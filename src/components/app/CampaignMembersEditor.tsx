import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { toastSaved } from "@/lib/saved";
import { getStoredUser, type Campaign } from "@/lib/game";
import { pushLog } from "@/lib/log";
import { useT } from "@/lib/i18n";

type Member = { id: string; user_id: string; role: "player" | "dm"; created_at: string };
type AppUser = { id: string; username: string };
type Req = {
  id: string;
  campaign_id: string;
  requester_user_id: string;
  requester_username: string;
  status: string;
  kind: "codm" | "player_rejoin" | "player_join";
  created_at: string;
};

export function CampaignMembersEditor({ campaign, onBack }: { campaign: Campaign; onBack: () => void }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<Record<string, AppUser>>({});
  const [requests, setRequests] = useState<Req[]>([]);
  const [singleDmOnly, setSingleDmOnly] = useState<boolean>(!!(campaign as any).single_dm_only);
  const [lockNames, setLockNames] = useState<boolean>(!!(campaign as any).lock_character_names);
  const [joinMode, setJoinMode] = useState<"request" | "closed">(
    ((campaign as any).player_join_mode as "request" | "closed") || "request",
  );
  const [busy, setBusy] = useState(false);
  const { t } = useT();
  const me = getStoredUser();

  const reload = useCallback(async () => {
    const { data } = await (supabase as any).from("campaign_members")
      .select("*").eq("campaign_id", campaign.id).order("created_at");
    const ms = (data || []) as Member[];
    setMembers(ms);
    const ids = ms.map(m => m.user_id);
    if (ids.length) {
      try {
        const { getUsernamesByIds } = await import("@/lib/users.functions");
        const { users: us } = await getUsernamesByIds({ data: { ids } });
        const map: Record<string, AppUser> = {};
        (us || []).forEach((u: AppUser) => { map[u.id] = u; });
        setUsers(map);
      } catch {}
    }

    const { data: rq } = await (supabase as any).from("dm_join_requests")
      .select("*").eq("campaign_id", campaign.id).eq("status", "pending")
      .order("created_at", { ascending: true });
    setRequests((rq || []) as Req[]);
  }, [campaign.id]);

  useEffect(() => { reload(); }, [reload]);

  async function setRole(m: Member, next: "player" | "dm") {
    if (m.role === next) return;
    setBusy(true);
    try {
      await (supabase as any).from("campaign_members").update({ role: next }).eq("id", m.id);
      toastSaved(t("campaign.roleUpdated"));
      reload();
    } finally { setBusy(false); }
  }

  async function removeMember(m: Member) {
    if (m.user_id === (campaign as any).owner_user_id) { toast.error(t("campaign.cantRemoveOwner")); return; }
    const uname = users[m.user_id]?.username || "—";
    if (!confirm(t("campaign.removeUserConfirm", { name: uname }) + "\n\n" + t("membersExtra.removeWarning"))) return;
    setBusy(true);
    try {
      // 1. All characters owned by this user in this campaign
      const { data: chars } = await (supabase as any).from("characters")
        .select("id,name").eq("campaign_id", campaign.id).eq("user_id", m.user_id);
      const charIds = (chars || []).map((c: any) => c.id);

      // 2. Transfer their items & boosters to the DM vault (instead of deleting)
      if (charIds.length) {
        await (supabase as any).from("items")
          .update({ owner_character_id: null, in_dm_vault: true, equipped: false, inventory_slot_type: "normal" })
          .in("owner_character_id", charIds);
        await (supabase as any).from("boosters")
          .update({ owner_character_id: null, in_dm_vault: true })
          .in("owner_character_id", charIds);
        // 3. Delete dependent rows that belong to those characters
        await (supabase as any).from("achievements").delete().in("character_id", charIds);
        await (supabase as any).from("character_conditions").delete().in("character_id", charIds);
        await (supabase as any).from("character_notes").delete().in("character_id", charIds);
        // 4. Delete the characters
        await (supabase as any).from("characters").delete().in("id", charIds);
      }

      // 5. Remove membership
      await (supabase as any).from("campaign_members").delete().eq("id", m.id);

      // 6. Ban the user so they can't auto-rejoin
      await (supabase as any).from("campaign_bans")
        .upsert({ campaign_id: campaign.id, user_id: m.user_id },
          { onConflict: "campaign_id,user_id" });

      // 7. Reject any pending requests from that user for this campaign
      await (supabase as any).from("dm_join_requests")
        .update({ status: "rejected", resolved_at: new Date().toISOString() })
        .eq("campaign_id", campaign.id).eq("requester_user_id", m.user_id).eq("status", "pending");

      // 8. Log it
      if (me) {
        await pushLog(campaign.id, [
          { t: "char", v: me.username, color: "var(--gold)" },
          { t: "text", v: ` ${t("membersExtra.removedAndBanned", { name: uname })}` },
        ]);
      }
      toastSaved(t("campaign.userRemoved"));
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Error");
    } finally { setBusy(false); }
  }

  async function decideRequest(r: Req, approve: boolean) {
    setBusy(true);
    try {
      await (supabase as any).from("dm_join_requests")
        .update({ status: approve ? "approved" : "rejected", resolved_at: new Date().toISOString() })
        .eq("id", r.id);
      if (approve) {
        if (r.kind === "player_rejoin") {
          await (supabase as any).from("campaign_bans")
            .delete().eq("campaign_id", r.campaign_id).eq("user_id", r.requester_user_id);
          await (supabase as any).from("campaign_members")
            .upsert({ campaign_id: r.campaign_id, user_id: r.requester_user_id, role: "player" },
              { onConflict: "campaign_id,user_id" });
        } else {
          await (supabase as any).from("campaign_members")
            .upsert({ campaign_id: r.campaign_id, user_id: r.requester_user_id, role: "dm" },
              { onConflict: "campaign_id,user_id" });
        }
        toastSaved(t("mailbox.acceptedToast"));
      } else {
        toast.info(t("mailbox.rejectedToast"));
      }
      reload();
    } finally { setBusy(false); }
  }

  async function saveFlags() {
    setBusy(true);
    try {
      await (supabase as any).from("campaigns")
        .update({ single_dm_only: singleDmOnly, lock_character_names: lockNames })
        .eq("id", campaign.id);
      toastSaved();
    } finally { setBusy(false); }
  }

  const owner = (campaign as any).owner_user_id as string | null;

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-xs underline text-muted-foreground">← {t("common.back")}</button>
      <h3 className="font-display text-lg text-center text-[var(--gold)]">{t("campaign.editTitle")}</h3>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground text-center">{campaign.name}</p>

      <div className="ornate-card p-3 space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("campaign.rules")}</p>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={singleDmOnly} onChange={e => setSingleDmOnly(e.target.checked)} />
          {t("home.singleDmLabel")}
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={lockNames} onChange={e => setLockNames(e.target.checked)} />
          {t("campaign.lockNamesRule")}
        </label>
        <button className="btn-fantasy w-full text-xs" disabled={busy} onClick={saveFlags}>{t("campaign.saveRules")}</button>
      </div>

      <div className="ornate-card p-3 space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          {t("membersExtra.requestsTitle", { count: requests.length })}
        </p>
        {requests.length === 0 && (
          <p className="text-[10px] text-muted-foreground">{t("membersExtra.noRequests")}</p>
        )}
        {requests.map(r => (
          <div key={r.id} className="bg-secondary/40 rounded px-2 py-2 space-y-1">
            <p className="text-xs">
              <span className="font-display text-[var(--gold)]">{r.requester_username}</span>{" "}
              {r.kind === "player_rejoin" ? t("mailbox.reqRejoin") : t("mailbox.reqCoDM")}
            </p>
            <p className="text-[9px] uppercase text-muted-foreground tracking-widest">
              {r.kind === "player_rejoin" ? t("membersExtra.kindRejoin") : t("membersExtra.kindCoDM")}
            </p>
            <div className="grid grid-cols-2 gap-1">
              <button disabled={busy} onClick={() => decideRequest(r, true)}
                className="text-[10px] py-1 rounded bg-[var(--gold)] text-black font-display">
                {t("membersExtra.accept")}
              </button>
              <button disabled={busy} onClick={() => decideRequest(r, false)}
                className="text-[10px] py-1 rounded text-white"
                style={{ background: "var(--loss)" }}>
                {t("membersExtra.reject")}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="ornate-card p-3 space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("campaign.usersInCampaign", { count: members.length })}</p>
        {members.map(m => {
          const u = users[m.user_id];
          const isOwner = m.user_id === owner;
          return (
            <div key={m.id} className="bg-secondary/40 rounded px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-display text-sm truncate">{u?.username || m.user_id.slice(0, 8)} {isOwner && "👑"}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {isOwner ? t("campaign.creatorPermanent") : m.role === "dm" ? t("campaign.coDM") : t("campaign.player")}
                  </p>
                </div>
                {!isOwner && (
                  <button onClick={() => removeMember(m)} disabled={busy}
                    className="text-[10px] text-[var(--loss)] underline">{t("common.remove")}</button>
                )}
              </div>
              {!isOwner && (
                <div className="grid grid-cols-2 gap-1 mt-2">
                  <button
                    className={`text-[10px] py-1 rounded border ${m.role === "player" ? "bg-[var(--gold)] text-black border-transparent" : "border-border"}`}
                    onClick={() => setRole(m, "player")} disabled={busy}>{t("campaign.playerBtn")}</button>
                  <button
                    className={`text-[10px] py-1 rounded border ${m.role === "dm" ? "bg-[var(--gold)] text-black border-transparent" : "border-border"}`}
                    onClick={() => setRole(m, "dm")} disabled={busy || singleDmOnly}>{t("campaign.coDMBtn")}</button>
                </div>
              )}
            </div>
          );
        })}
        {!members.length && <p className="text-[10px] text-muted-foreground">{t("campaign.noUsers")}</p>}
        {singleDmOnly && (
          <p className="text-[9px] text-muted-foreground">{t("campaign.singleDmActive")}</p>
        )}
      </div>
    </div>
  );
}
