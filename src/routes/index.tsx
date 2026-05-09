import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageFrame } from "@/components/app/Frame";
import {
  setSession, setStoredUser, getStoredUser,
  type Campaign, type Character, type Role, type StoredUser,
} from "@/lib/game";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { attemptLogin } from "@/lib/auth.functions";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Vamos a Rolear" }] }),
  component: Home,
});

type Step = "login" | "role" | "campaign" | "character";

function Home() {
  const nav = useNavigate();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [step, setStep] = useState<Step>("login");

  // login fields
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  // role/campaign
  const [role, setRole] = useState<Role>("player");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [search, setSearch] = useState("");
  const [joinCode, setJoinCode] = useState("");

  // character
  const [myChars, setMyChars] = useState<Character[]>([]);
  const [newCharName, setNewCharName] = useState("");

  useEffect(() => {
    const u = getStoredUser();
    if (u) { setUser(u); setStep("role"); }
  }, []);

  // Load only campaigns where the user is a member (or owns).
  useEffect(() => {
    if (step !== "campaign" || !user) return;
    (async () => {
      const { data: mem } = await (supabase as any).from("campaign_members")
        .select("campaign_id").eq("user_id", user.id);
      const ids = (mem || []).map((m: any) => m.campaign_id);
      if (!ids.length) { setCampaigns([]); return; }
      const { data } = await supabase.from("campaigns").select("*").in("id", ids).order("created_at", { ascending: false });
      setCampaigns((data || []) as Campaign[]);
    })();
  }, [step, user]);

  // Load my characters when entering character step (player)
  useEffect(() => {
    if (step !== "character" || !user || !campaign || role !== "player") return;
    (async () => {
      const { data } = await (supabase as any).from("characters")
        .select("*").eq("campaign_id", campaign.id).eq("user_id", user.id);
      setMyChars((data || []) as Character[]);
    })();
  }, [step, user, campaign, role]);

  const loginFn = useServerFn(attemptLogin);
  async function login() {
    if (busy) return;
    const uname = username.trim();
    if (!uname) return toast.error("Escribe un usuario");
    if (!/^[0-9]{4}$/.test(pin)) return toast.error("El PIN debe ser 4 dígitos");
    setBusy(true);
    try {
      const res = await loginFn({ data: { username: uname, pin } });
      if (!res.ok) { toast.error(res.message); return; }
      const u: StoredUser = { id: res.user.id, username: res.user.username };
      setStoredUser(u); setUser(u);
      toast.success(`Bienvenido, ${res.user.username}`);
      if (res.user.isMaster) {
        nav({ to: "/master" });
      } else {
        setStep("role");
      }
    } catch (e: any) {
      toast.error(e?.message || "Error al iniciar sesión");
    } finally { setBusy(false); }
  }

  function logout() {
    setStoredUser(null); setUser(null);
    setUsername(""); setPin(""); setStep("login");
  }

  async function createCampaign() {
    if (!user || !newCampaignName.trim()) return;
    const { data, error } = await (supabase as any).from("campaigns")
      .insert({ name: newCampaignName.trim(), max_players: 999, owner_user_id: user.id }).select().single();
    if (error) return toast.error(error.message);
    await (supabase as any).from("campaign_members").insert({ campaign_id: data.id, user_id: user.id, role });
    setNewCampaignName("");
    await pickCampaign(data as Campaign);
  }

  async function joinByCode() {
    if (!user || !joinCode.trim()) return;
    const code = joinCode.trim();
    // Allow joining by exact campaign id or exact name (case-insensitive)
    let { data } = await (supabase as any).from("campaigns").select("*").eq("id", code).maybeSingle();
    if (!data) {
      const r = await (supabase as any).from("campaigns").select("*").ilike("name", code).maybeSingle();
      data = r.data;
    }
    if (!data) return toast.error("Campaña no encontrada");
    await (supabase as any).from("campaign_members")
      .upsert({ campaign_id: data.id, user_id: user.id, role }, { onConflict: "campaign_id,user_id" });
    setJoinCode("");
    await pickCampaign(data as Campaign);
  }

  async function pickCampaign(c: Campaign) {
    setCampaign(c);
    if (role === "spectator") {
      enterCampaign(c, null);
    } else if (role === "dm") {
      // ensure DM has a character row for this campaign
      const { data: existing } = await (supabase as any).from("characters")
        .select("*").eq("campaign_id", c.id).eq("user_id", user!.id).eq("role", "dm").maybeSingle();
      if (existing) enterCampaign(c, existing as Character);
      else {
        const { data } = await (supabase as any).from("characters").insert({
          campaign_id: c.id, user_id: user!.id, name: user!.username, role: "dm", color: "#fbbf24",
        }).select().single();
        enterCampaign(c, data as Character);
      }
    } else {
      setStep("character");
    }
  }

  async function createCharacter() {
    if (!user || !campaign || !newCharName.trim()) return;
    const { data, error } = await (supabase as any).from("characters").insert({
      campaign_id: campaign.id, user_id: user.id, name: newCharName.trim(), role: "player",
      color: randomColor(),
    }).select().single();
    if (error) return toast.error(error.message);
    enterCampaign(campaign, data as Character);
  }

  function enterCampaign(c: Campaign, ch: Character | null) {
    if (!user) return;
    setSession({
      userId: user.id, username: user.username,
      campaignId: c.id, characterId: ch?.id || null, role,
    });
    nav({ to: role === "dm" ? "/campaign/dm" : role === "spectator" ? "/campaign/spectator" : "/campaign/profile" });
  }

  return (
    <PageFrame>
      <div className="flex flex-col items-center gap-1 pt-4 text-center">
        <div className="text-5xl">🎲</div>
        <h1 className="font-display text-3xl font-black tracking-wider rune-glow">VAMOS A</h1>
        <p className="font-display text-4xl font-black tracking-[0.3em] text-[var(--gold)]">ROLEAR</p>
      </div>
      <div className="gem-divider my-5" />

      {step === "login" && (
        <div className="ornate-card p-6 space-y-4">
          <h2 className="text-center font-display text-lg">Entra al códice</h2>
          <p className="text-center text-xs text-muted-foreground">
            Si es tu primera vez, se creará tu cuenta automáticamente.
          </p>
          <input className="w-full rounded-md bg-input border border-border px-3 py-3 text-center font-display text-lg"
            placeholder="Usuario" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          <input className="w-full rounded-md bg-input border border-border px-3 py-3 text-center font-display text-2xl tracking-[0.6em]"
            placeholder="••••" inputMode="numeric" maxLength={4} value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={e => e.key === "Enter" && login()} />
          <button className="btn-fantasy w-full" disabled={busy} onClick={login}>Entrar →</button>
        </div>
      )}

      {step === "role" && user && (
        <div className="ornate-card p-6 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Hola, {user.username}</p>
            <button onClick={logout} className="text-[10px] text-muted-foreground underline">Salir</button>
          </div>
          <h2 className="text-center font-display text-lg">¿Quién entra al salón?</h2>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-fantasy h-24 flex flex-col items-center justify-center gap-1 text-xs"
              onClick={() => { setRole("player"); setStep("campaign"); }}>
              <span className="text-2xl">🗡️</span>Jugador
            </button>
            <button className="btn-fantasy h-24 flex flex-col items-center justify-center gap-1 text-xs"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={() => { setRole("dm"); setStep("campaign"); }}>
              <span className="text-2xl">👑</span>DM
            </button>
            <button className="btn-fantasy h-24 flex flex-col items-center justify-center gap-1 text-xs"
              onClick={() => { setRole("spectator"); setStep("campaign"); }}>
              <span className="text-2xl">👁️</span>Espectador
            </button>
          </div>
        </div>
      )}

      {step === "campaign" && user && (
        <div className="ornate-card p-5 space-y-4">
          <h2 className="text-center font-display text-lg">Tus campañas</h2>
          <input className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm"
            placeholder="🔎 Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="max-h-56 overflow-y-auto space-y-2">
            {campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(c => (
              <button key={c.id} onClick={() => pickCampaign(c)}
                className="w-full rounded-lg border border-border bg-card px-3 py-3 text-left hover:border-[var(--gold)]/60 transition">
                <span className="font-display text-base">{c.name}</span>
              </button>
            ))}
            {!campaigns.length && <p className="text-center text-xs text-muted-foreground py-4">No estás en ninguna campaña aún.</p>}
          </div>
          <div className="gem-divider" />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Unirme por nombre o código</p>
            <div className="flex gap-2">
              <input className="flex-1 rounded-md bg-input border border-border px-3 py-2 text-sm"
                placeholder="Nombre exacto de la campaña..." value={joinCode} onChange={e => setJoinCode(e.target.value)} />
              <button className="btn-fantasy" onClick={joinByCode}>Unirme</button>
            </div>
          </div>
          {role === "dm" && (
            <>
              <div className="gem-divider" />
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Crear nueva campaña</p>
                <div className="flex gap-2">
                  <input className="flex-1 rounded-md bg-input border border-border px-3 py-2 text-sm"
                    placeholder="Nombre épico..." value={newCampaignName} onChange={e => setNewCampaignName(e.target.value)} />
                  <button className="btn-fantasy" onClick={createCampaign}>Crear</button>
                </div>
              </div>
            </>
          )}
          <button className="text-xs text-muted-foreground underline w-full text-center" onClick={() => setStep("role")}>← Cambiar rol</button>
        </div>
      )}

      {step === "character" && campaign && user && role === "player" && (
        <div className="ornate-card p-5 space-y-4">
          <h2 className="text-center font-display text-lg">{campaign.name}</h2>
          <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">Tus personajes</p>
          <div className="space-y-2">
            {myChars.map(c => (
              <button key={c.id} onClick={() => enterCampaign(campaign, c)}
                className="w-full rounded-lg border border-border bg-card px-3 py-3 text-left hover:border-[var(--gold)]/60 transition flex justify-between items-center">
                <span className="font-display text-base" style={{ color: c.color }}>{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.race || "—"} / {c.class || "—"}</span>
              </button>
            ))}
            {!myChars.length && <p className="text-center text-xs text-muted-foreground py-2">Aún no tienes personajes en esta campaña.</p>}
          </div>
          <div className="gem-divider" />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Crear nuevo personaje</p>
            <div className="flex gap-2">
              <input className="flex-1 rounded-md bg-input border border-border px-3 py-2 text-sm"
                placeholder="Nombre del héroe..." value={newCharName} onChange={e => setNewCharName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createCharacter()} />
              <button className="btn-fantasy" onClick={createCharacter}>Crear</button>
            </div>
          </div>
          <button className="text-xs text-muted-foreground underline w-full text-center" onClick={() => setStep("campaign")}>← Otra campaña</button>
        </div>
      )}
    </PageFrame>
  );
}

function randomColor() {
  const colors = ["#a78bfa", "#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#fb7185", "#22d3ee", "#84cc16"];
  return colors[Math.floor(Math.random() * colors.length)];
}