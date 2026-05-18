import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageFrame } from "@/components/app/Frame";
import { getStoredUser, setStoredUser, type StoredUser } from "@/lib/game";
import { toast } from "sonner";
import { toastSaved } from "@/lib/saved";
import { setGlobalBackground } from "@/lib/background";
import { Trash2, LogIn, Image as ImageIcon, LogOut } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/master")({
  head: () => ({ meta: [{ title: "Panel Maestro" }] }),
  component: Master,
});

type AppUser = { id: string; username: string; pin: string; created_at: string };
type Attempt = { ip: string; failed_count: number; blocked_until: string | null; next_try_at: string | null };

function Master() {
  const { t } = useT();
  const nav = useNavigate();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [bgUrl, setBgUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const me = getStoredUser();
    if (!me || me.username !== "MasterAcc1000") {
      nav({ to: "/" }); return;
    }
    reload();
    (async () => {
      const { data } = await (supabase as any).from("app_settings").select("value").eq("key", "background_url").maybeSingle();
      setBgUrl(data?.value || "");
    })();
  }, []);

  async function reload() {
    const { data: u } = await (supabase as any).from("app_users").select("*").order("created_at", { ascending: false });
    setUsers((u || []) as AppUser[]);
    const { data: a } = await (supabase as any).from("login_attempts").select("*");
    setAttempts((a || []) as Attempt[]);
  }

  async function deleteUser(u: AppUser) {
    if (u.username === "MasterAcc1000") return toast.error(t("master.cantDeleteMaster"));
    if (!confirm(t("master.deleteAccountConfirm", { name: u.username }))) return;
    const { data: chars } = await (supabase as any).from("characters").select("id").eq("user_id", u.id);
    const charIds = (chars || []).map((c: any) => c.id);
    if (charIds.length) {
      await (supabase as any).from("items").delete().in("owner_character_id", charIds);
      await (supabase as any).from("achievements").delete().in("character_id", charIds);
      await (supabase as any).from("character_conditions").delete().in("character_id", charIds);
      await (supabase as any).from("characters").delete().in("id", charIds);
    }
    await (supabase as any).from("campaign_members").delete().eq("user_id", u.id);
    await (supabase as any).from("campaigns").delete().eq("owner_user_id", u.id);
    await (supabase as any).from("app_users").delete().eq("id", u.id);
    toast.success(t("master.accountDeleted", { name: u.username }));
    reload();
  }

  async function unblockAll() {
    await (supabase as any).from("login_attempts").delete().not("ip", "is", null);
    toastSaved(t("master.unblockedAll"));
    reload();
  }
  async function unblockOne(ip: string) {
    await (supabase as any).from("login_attempts").delete().eq("ip", ip);
    toastSaved(t("master.ipUnblocked"));
    reload();
  }

  function impersonate(u: AppUser) {
    const stored: StoredUser = { id: u.id, username: u.username };
    setStoredUser(stored);
    toast.success(t("master.enteringAs", { name: u.username }));
    nav({ to: "/" });
  }

  async function uploadBg(file: File) {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `bg-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("backgrounds").upload(path, file, { upsert: true, contentType: file.type });
      if (error) { toast.error(error.message); return; }
      const { data } = supabase.storage.from("backgrounds").getPublicUrl(path);
      setBgUrl(data.publicUrl);
      await setGlobalBackground(data.publicUrl);
      toastSaved(t("master.bgUpdated"));
    } finally { setUploading(false); }
  }

  async function saveBgUrl() {
    await setGlobalBackground(bgUrl);
    toastSaved();
  }

  async function clearBg() {
    setBgUrl("");
    await setGlobalBackground("");
    toastSaved(t("master.bgRestored"));
  }

  function logout() {
    setStoredUser(null);
    nav({ to: "/" });
  }

  return (
    <PageFrame>
      <header className="flex items-center justify-between mb-3">
        <h1 className="font-display text-xl text-[var(--gold)]">{t("master.title")}</h1>
        <button onClick={logout} className="text-muted-foreground" aria-label={t("master.logoutAria")}><LogOut size={18} /></button>
      </header>
      <div className="gem-divider mb-4" />

      <section className="ornate-card p-4 mb-4 space-y-3">
        <h2 className="font-display text-sm uppercase tracking-widest"><ImageIcon size={14} className="inline mr-1" /> {t("master.bgTitle")}</h2>
        {bgUrl && (
          <div className="aspect-video rounded-lg overflow-hidden border border-border">
            <img src={bgUrl} alt="bg" className="w-full h-full object-cover" />
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadBg(f); }} />
        <div className="flex gap-2">
          <button className="btn-fantasy flex-1" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? t("master.uploading") : t("master.upload")}
          </button>
          <button className="btn-fantasy flex-1" onClick={clearBg}>{t("master.remove")}</button>
        </div>
        <div className="flex gap-2">
          <input className="flex-1 rounded bg-input border border-border px-2 py-1 text-xs"
            placeholder={t("master.urlPh")} value={bgUrl} onChange={e => setBgUrl(e.target.value)} />
          <button className="btn-fantasy text-xs" onClick={saveBgUrl}>{t("master.saveUrl")}</button>
        </div>
      </section>

      <section className="ornate-card p-4 mb-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm uppercase tracking-widest">{t("master.ipsTitle")}</h2>
          <button className="text-xs underline" onClick={unblockAll}>{t("master.clearAll")}</button>
        </div>
        {attempts.length === 0 && <p className="text-xs text-muted-foreground">{t("master.noAttempts")}</p>}
        {attempts.map(a => (
          <div key={a.ip} className="flex items-center justify-between text-xs bg-secondary/40 rounded px-2 py-1">
            <span className="font-mono">{a.ip}</span>
            <span className="text-muted-foreground">
              {a.blocked_until && new Date(a.blocked_until) > new Date()
                ? t("master.blocked", { n: a.failed_count })
                : t("master.failed", { n: a.failed_count })}
            </span>
            <button className="text-[var(--gold)] underline" onClick={() => unblockOne(a.ip)}>{t("master.unblock")}</button>
          </div>
        ))}
      </section>

      <section className="ornate-card p-4 space-y-2">
        <h2 className="font-display text-sm uppercase tracking-widest">{t("master.accounts", { count: users.length })}</h2>
        {users.map(u => {
          const isMaster = u.username === "MasterAcc1000";
          return (
            <div key={u.id} className="flex items-center justify-between bg-secondary/40 rounded px-2 py-2 gap-2">
              <button onClick={() => !isMaster && impersonate(u)} disabled={isMaster}
                className="flex-1 text-left">
                <p className="font-display text-sm">{u.username}{isMaster && " 👑"}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</p>
              </button>
              {!isMaster && (
                <>
                  <button onClick={() => impersonate(u)} className="text-[var(--gold)]" aria-label={t("master.enterAria")}><LogIn size={14} /></button>
                  <button onClick={() => deleteUser(u)} className="text-[var(--loss)]" aria-label={t("master.deleteAria")}><Trash2 size={14} /></button>
                </>
              )}
            </div>
          );
        })}
      </section>
    </PageFrame>
  );
}
