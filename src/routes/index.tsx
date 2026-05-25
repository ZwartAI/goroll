import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageFrame } from "@/components/app/Frame";
import {
  setSession, setStoredUser, getStoredUser, totals,
  type Campaign, type Character, type Item, type Role, type StoredUser,
} from "@/lib/game";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { attemptLogin } from "@/lib/auth.functions";
import { CampaignActionsModal } from "@/components/app/CampaignActionsModal";
import { CampaignLoadingOverlay } from "@/components/app/CampaignLoadingOverlay";
import { AppSettingsModal } from "@/components/app/AppSettingsModal";
import { Settings as SettingsIcon } from "lucide-react";
import { CharacterPortrait } from "@/components/app/CharacterPortrait";
import { useT } from "@/lib/i18n";
import goRollLogo from "@/assets/go-roll-logo.png";
import loginFrame from "@/assets/login-frame.png";
import { preloadCharacterSheetAssets } from "@/lib/preloadCharacterSheetAssets";


export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Vamos a Rolear · GoRoll" }] }),
  component: Home,
});

type Step = "login" | "role" | "campaign" | "character";

function Home() {
  const nav = useNavigate();
  const { t, setLang } = useT();
  const [user, setUser] = useState<StoredUser | null>(null);
  const [step, setStep] = useState<Step>("login");
  const [showLanguagePrompt, setShowLanguagePrompt] = useState(false);
  const [postLoginTarget, setPostLoginTarget] = useState<"master" | "role">("role");

  // login fields
  const [username, setUsername] = useState("");
  const [pinDigits, setPinDigits] = useState<string[]>(["", "", "", ""]);
  const pin = pinDigits.join("");
  const setPin = (v: string) => {
    const d = (v || "").replace(/\D/g, "").slice(0, 4).split("");
    setPinDigits([d[0] || "", d[1] || "", d[2] || "", d[3] || ""]);
  };
  const pinRefs = useRef<Array<HTMLInputElement | null>>([null, null, null, null]);
  const [busy, setBusy] = useState(false);
  const [pulseKey, setPulseKey] = useState(0);

  // role/campaign
  const [role, setRole] = useState<Role>("player");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [search, setSearch] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [singleDmOnly, setSingleDmOnly] = useState(false);
  const [lockNames, setLockNames] = useState(false);
  const [waitingReqId, setWaitingReqId] = useState<string | null>(null);
  const [waitingKind, setWaitingKind] = useState<"codm" | "player_rejoin" | "player_join">("codm");
  const [closedCampaign, setClosedCampaign] = useState<Campaign | null>(null);
  const [actionCampaign, setActionCampaign] = useState<Campaign | null>(null);
  const [expelledCampaign, setExpelledCampaign] = useState<Campaign | null>(null);
  const [showAppSettings, setShowAppSettings] = useState(false);
  const [entering, setEntering] = useState(false);

  // character
  const [myChars, setMyChars] = useState<Character[]>([]);
  const [myCharItems, setMyCharItems] = useState<Record<string, Item[]>>({});
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

  // Load my characters + their equipped items when entering character step (player)
  useEffect(() => {
    if (step !== "character" || !user || !campaign || role !== "player") return;
    let cancelled = false;
    const reload = async () => {
      const { data: chars } = await (supabase as any).from("characters")
        .select("*").eq("campaign_id", campaign.id).eq("user_id", user.id);
      const list = (chars || []) as Character[];
      if (cancelled) return;
      setMyChars(list);
      const ids = list.map(c => c.id);
      if (!ids.length) { setMyCharItems({}); return; }
      const { data: its } = await (supabase as any).from("items")
        .select("*").in("owner_character_id", ids).eq("equipped", true);
      if (cancelled) return;
      const map: Record<string, Item[]> = {};
      for (const it of (its || []) as Item[]) {
        const k = (it as any).owner_character_id as string;
        (map[k] = map[k] || []).push(it);
      }
      setMyCharItems(map);
    };
    reload();
    const ch = (supabase as any).channel(`home-chars:${campaign.id}:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${campaign.id}` }, () => reload())
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `campaign_id=eq.${campaign.id}` }, () => reload())
      .subscribe();
    return () => { cancelled = true; (supabase as any).removeChannel(ch); };
  }, [step, user, campaign, role]);

  const loginFn = useServerFn(attemptLogin);
  async function login() {
    if (busy) return;
    const uname = username.trim();
    if (!uname) return toast.error(t("home.errWriteUser"));
    if (!/^[0-9]{4}$/.test(pin)) return toast.error(t("home.errPin"));
    setBusy(true);
    try {
      const res = await loginFn({ data: { username: uname, pin } });
      if (!res.ok) { toast.error(res.message); return; }
      const u: StoredUser = { id: res.user.id, username: res.user.username };
      setStoredUser(u); setUser(u);
      toast.success(t("home.welcome", { name: res.user.username }));
      if (res.isNewAccount) {
        setPostLoginTarget(res.user.isMaster ? "master" : "role");
        setShowLanguagePrompt(true);
      } else if (res.user.isMaster) {
        nav({ to: "/master" });
      } else {
        setStep("role");
      }
    } catch (e: any) {
      toast.error(e?.message || t("home.errLogin"));
    } finally { setBusy(false); }
  }

  function logout() {
    setStoredUser(null); setUser(null);
    setUsername(""); setPin(""); setStep("login");
    setShowLanguagePrompt(false);
  }

  function confirmInitialLanguage(lang: "es" | "en") {
    setLang(lang);
    setShowLanguagePrompt(false);
    if (postLoginTarget === "master") nav({ to: "/master" });
    else setStep("role");
  }

  async function createCampaign() {
    if (!user || !newCampaignName.trim()) return;
    const { data, error } = await (supabase as any).from("campaigns")
      .insert({ name: newCampaignName.trim(), max_players: 999, owner_user_id: user.id, single_dm_only: singleDmOnly, lock_character_names: lockNames }).select().single();
    if (error) return toast.error(error.message);
    await (supabase as any).from("campaign_members").insert({ campaign_id: data.id, user_id: user.id, role });
    setNewCampaignName("");
    await pickCampaign(data as Campaign);
  }

  async function checkBan(cid: string): Promise<boolean> {
    if (!user) return false;
    const { data } = await (supabase as any).from("campaign_bans")
      .select("id").eq("campaign_id", cid).eq("user_id", user.id).maybeSingle();
    return !!data;
  }

  async function requestRejoin(c: Campaign) {
    if (!user) return;
    const { data: existing } = await (supabase as any).from("dm_join_requests")
      .select("*").eq("campaign_id", c.id).eq("requester_user_id", user.id)
      .eq("status", "pending").maybeSingle();
    let reqId = existing?.id as string | undefined;
    if (!reqId) {
      const { data: ins, error } = await (supabase as any).from("dm_join_requests")
        .insert({ campaign_id: c.id, requester_user_id: user.id, requester_username: user.username, status: "pending", kind: "player_rejoin" })
        .select().single();
      if (error) { toast.error(error.message); return; }
      reqId = ins.id as string;
    } else {
      toast.info(t("rejoin.alreadyPending"));
    }
    setCampaign(c);
    setWaitingKind("player_rejoin");
    setWaitingReqId(reqId!);
  }

  async function joinByCode() {
    if (!user || !joinCode.trim()) return;
    const code = joinCode.trim();
    let { data } = await (supabase as any).from("campaigns").select("*").eq("id", code).maybeSingle();
    if (!data) {
      const r = await (supabase as any).from("campaigns").select("*").ilike("name", code).maybeSingle();
      data = r.data;
    }
    if (!data) return toast.error(t("home.errCampaignNotFound"));
    if (role === "player") {
      // Already a member? enter directly.
      const { data: mem } = await (supabase as any).from("campaign_members")
        .select("role").eq("campaign_id", data.id).eq("user_id", user.id).maybeSingle();
      if (mem) {
        setJoinCode("");
        await pickCampaign(data as Campaign);
        return;
      }
      const banned = await checkBan(data.id);
      if (banned) {
        setJoinCode("");
        setExpelledCampaign(data as Campaign);
        return;
      }
      // Closed campaigns reject new players outright.
      if ((data as any).player_join_mode === "closed") {
        setJoinCode("");
        setClosedCampaign(data as Campaign);
        return;
      }
      // Otherwise: send a join request to the DM mailbox.
      await requestPlayerJoin(data as Campaign);
      setJoinCode("");
      return;
    } else if (role === "spectator") {
      await (supabase as any).from("campaign_members")
        .upsert({ campaign_id: data.id, user_id: user.id, role }, { onConflict: "campaign_id,user_id" });
    }
    setJoinCode("");
    await pickCampaign(data as Campaign);
  }

  async function requestPlayerJoin(c: Campaign) {
    if (!user) return;
    const { data: existing } = await (supabase as any).from("dm_join_requests")
      .select("*").eq("campaign_id", c.id).eq("requester_user_id", user.id)
      .eq("status", "pending").maybeSingle();
    let reqId = existing?.id as string | undefined;
    if (!reqId) {
      const { data: ins, error } = await (supabase as any).from("dm_join_requests")
        .insert({ campaign_id: c.id, requester_user_id: user.id, requester_username: user.username, status: "pending", kind: "player_join" })
        .select().single();
      if (error) { toast.error(error.message); return; }
      reqId = ins.id as string;
    } else {
      toast.info(t("playerJoin.alreadyPending"));
    }
    setCampaign(c);
    setWaitingKind("player_join");
    setWaitingReqId(reqId!);
  }

  const COOLDOWN_KEY = (cid: string) => `codice.dmreq.cooldown.${cid}`;

  async function requestCoDM(c: Campaign) {
    if (!user) return;
    // Check cooldown
    try {
      const until = parseInt(localStorage.getItem(COOLDOWN_KEY(c.id)) || "0", 10);
      const now = Date.now();
      if (until > now) {
        const sec = Math.ceil((until - now) / 1000);
        toast.error(t("home.errCooldown", { sec }));
        return;
      }
    } catch {}
    if ((c as any).single_dm_only) {
      toast.error(t("home.errSingleDm"));
      return;
    }
    // Already a DM member? skip request
    const { data: mem } = await (supabase as any).from("campaign_members")
      .select("role").eq("campaign_id", c.id).eq("user_id", user.id).maybeSingle();
    if (mem?.role === "dm") {
      enterAsDM(c);
      return;
    }
    // Reuse existing pending request if any
    const { data: existing } = await (supabase as any).from("dm_join_requests")
      .select("*").eq("campaign_id", c.id).eq("requester_user_id", user.id)
      .eq("status", "pending").maybeSingle();
    let reqId = existing?.id as string | undefined;
    if (!reqId) {
      const { data: ins, error } = await (supabase as any).from("dm_join_requests")
        .insert({ campaign_id: c.id, requester_user_id: user.id, requester_username: user.username, status: "pending" })
        .select().single();
      if (error) { toast.error(error.message); return; }
      reqId = ins.id as string;
    }
    setCampaign(c);
    setWaitingReqId(reqId!);
  }

  async function enterAsDM(c: Campaign) {
    if (!user) return;
    await (supabase as any).from("campaign_members")
      .upsert({ campaign_id: c.id, user_id: user.id, role: "dm" }, { onConflict: "campaign_id,user_id" });
    const { data: existing } = await (supabase as any).from("characters")
      .select("*").eq("campaign_id", c.id).eq("user_id", user.id).eq("role", "dm").maybeSingle();
    if (existing) { enterCampaign(c, existing as Character); return; }
    const { data } = await (supabase as any).from("characters").insert({
      campaign_id: c.id, user_id: user.id, name: user.username, role: "dm", color: "#fbbf24",
    }).select().single();
    enterCampaign(c, data as Character);
  }

  async function pickCampaign(c: Campaign) {
    setCampaign(c);
    if (role === "spectator") {
      enterCampaign(c, null);
    } else if (role === "dm") {
      // Owner enters directly; non-owner goes through approval flow
      if ((c as any).owner_user_id === user!.id) {
        enterAsDM(c);
      } else {
        await requestCoDM(c);
      }
    } else {
      setStep("character");
    }
  }

  // Watch the pending request for resolution
  useEffect(() => {
    if (!waitingReqId || !campaign || !user) return;
    let stop = false;
    const finish = async (status: string) => {
      if (status === "approved") {
        if (waitingKind === "player_rejoin") {
          toast.success(t("rejoin.approved"));
          setWaitingReqId(null);
          setStep("character");
        } else if (waitingKind === "player_join") {
          // DM accepted: server-side membership was created by the approval handler.
          // Make sure we are registered as a player member here too (safety net).
          await (supabase as any).from("campaign_members")
            .upsert({ campaign_id: campaign.id, user_id: user.id, role: "player" },
              { onConflict: "campaign_id,user_id" });
          toast.success(t("playerJoin.approved"));
          setWaitingReqId(null);
          setStep("character");
        } else {
          toast.success(t("home.reqApproved"));
          await enterAsDM(campaign);
        }
      } else {
        if (waitingKind === "player_rejoin") {
          toast.error(t("rejoin.rejected"));
        } else if (waitingKind === "player_join") {
          toast.error(t("playerJoin.rejected"));
        } else {
          const cooldownUntil = Date.now() + 60_000;
          try { localStorage.setItem(COOLDOWN_KEY(campaign.id), String(cooldownUntil)); } catch {}
          toast.error(t("home.reqRejected"));
        }
        setWaitingReqId(null);
        setCampaign(null);
      }
    };
    const ch = (supabase as any).channel(`dmreq:requester:${waitingReqId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "dm_join_requests", filter: `id=eq.${waitingReqId}` },
        (payload: any) => { if (stop) return; const s = payload.new?.status; if (s && s !== "pending") finish(s); })
      .subscribe();
    (async () => {
      const { data } = await (supabase as any).from("dm_join_requests").select("status").eq("id", waitingReqId).maybeSingle();
      if (!stop && data && data.status !== "pending") finish(data.status);
    })();
    return () => { stop = true; (supabase as any).removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingReqId, campaign?.id, user?.id, waitingKind]);

  async function cancelCoDMRequest() {
    if (!waitingReqId) return;
    await (supabase as any).from("dm_join_requests").delete().eq("id", waitingReqId);
    setWaitingReqId(null);
    setCampaign(null);
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
    // Ensure the blocking overlay is visible across the navigation hand-off
    // so the player never sees a brief flash of the campaign list / character
    // picker between click and the new route mounting.
    setEntering(true);
    setSession({
      userId: user.id, username: user.username,
      campaignId: c.id, characterId: ch?.id || null, role,
    });
    nav({ to: role === "dm" ? "/campaign/dm" : role === "spectator" ? "/campaign/spectator" : "/campaign/profile" });
  }

  return (
    <PageFrame>
      <button
        onClick={() => setShowAppSettings(true)}
        aria-label={t("home.settingsAria")}
        className="fixed top-2 left-2 z-[200] rounded-lg border border-[var(--gold)]/60 bg-black/70 backdrop-blur-md p-2.5 text-[var(--gold)] hover:bg-black/90 hover:border-[var(--gold)] transition-colors shadow-[0_0_12px_rgba(212,175,55,0.35)] min-w-[40px] min-h-[40px] flex items-center justify-center"
      >
        <SettingsIcon size={18} />
      </button>
      <div className="flex flex-col items-center pt-4 text-center">
        <img
          src={goRollLogo}
          alt="Go Roll · Portal of Adventure"
          className="w-56 max-w-[80%] h-auto drop-shadow-[0_0_24px_rgba(212,175,55,0.35)]"
        />
      </div>
      <div className="gem-divider my-5" />
      {showAppSettings && <AppSettingsModal onClose={() => setShowAppSettings(false)} />}
      {showLanguagePrompt && (
        <div className="fixed inset-0 z-[260] bg-black/85 flex items-center justify-center p-4">
          <div className="ornate-card p-5 w-full max-w-sm space-y-4 text-center">
            <div className="text-4xl">🌐</div>
            <div className="space-y-1">
              <h2 className="font-display text-lg text-[var(--gold)]">{t("home.languagePromptTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("home.languagePromptBody")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-fantasy flex items-center justify-center gap-2" onClick={() => confirmInitialLanguage("es")}>
                <span className="text-base">🇪🇸</span>
                <span>{t("langs.es")}</span>
              </button>
              <button className="btn-fantasy flex items-center justify-center gap-2" onClick={() => confirmInitialLanguage("en")}>
                <span className="text-base">🇬🇧</span>
                <span>{t("langs.en")}</span>
              </button>
            </div>
          </div>
        </div>
      )}
      {step === "login" && (
        <div className="flex justify-center">
          <div
            className="relative"
            style={{
              width: "min(92vw, 480px)",
              aspectRatio: "1 / 1",
              backgroundImage: `url(${loginFrame})`,
              backgroundSize: "100% 100%",
              backgroundRepeat: "no-repeat",
            }}
          >
            {/* Título */}
            <div
              className="absolute text-center font-display tracking-[0.08em] whitespace-nowrap flex items-center justify-center gap-2 mt-[10px]"
              style={{
                top: "12%",
                left: "0",
                right: "0",
                fontSize: "clamp(14px, 3.4vw, 20px)",
                color: "color-mix(in oklab, white 78%, transparent)",
                textShadow: "0 0 10px rgba(0,0,0,0.55), 0 2px 4px rgba(0,0,0,0.8)",
              }}
            >
              <span className="text-[color-mix(in_oklab,var(--gold)_85%,#ff5a5a)]">✦</span>
              <span>{t("home.loginTitle")}</span>
              <span className="text-[color-mix(in_oklab,var(--gold)_85%,#ff5a5a)]">✦</span>
            </div>

            {/* Subtítulo */}
            <div
              className="absolute text-center text-[color-mix(in_oklab,var(--gold)_70%,#e8d9b0)] leading-snug px-2"
              style={{
                top: "22%",
                left: "10%",
                width: "80%",
                fontSize: "clamp(11px, 2.8vw, 14px)",
              }}
            >
              {t("home.loginHint")}
            </div>

            {/* Username */}
            <input
              type="text"
              className="absolute bg-transparent border-0 outline-none ring-0 focus:ring-0 focus:outline-none font-display text-[var(--gold)] placeholder:text-[color-mix(in_oklab,var(--gold)_55%,transparent)]"
              style={{
                top: "36.5%",
                left: "11%",
                width: "78%",
                height: "10.5%",
                paddingLeft: "22%",
                paddingRight: "3%",
                fontSize: "clamp(14px, 3.6vw, 20px)",
              }}
              placeholder={t("home.user")}
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") pinRefs.current[0]?.focus(); }}
              autoFocus
            />

            {/* Etiqueta CODEX PIN */}
            <div
              className="absolute text-center font-display text-[var(--gold)] tracking-[0.18em]"
              style={{
                top: "50%",
                left: "20%",
                width: "60%",
                fontSize: "clamp(11px, 2.6vw, 14px)",
                textShadow: "0 0 6px color-mix(in oklab, var(--gold) 40%, transparent)",
              }}
            >
              ✦ {t("home.codexPin")} ✦
            </div>

            {/* PIN — 4 cuadros */}
            <div
              className="absolute flex justify-center items-center"
              style={{ top: "59%", left: "14%", width: "72%", height: "13%", gap: "7%" }}
            >
              {[0, 1, 2, 3].map(i => (
                <input
                  key={i}
                  type="text"
                  ref={el => { pinRefs.current[i] = el; }}
                  className="bg-transparent border-0 outline-none ring-0 focus:ring-0 focus:outline-none text-center p-0 m-0 font-display text-[var(--gold)] caret-[var(--gold)]"
                  style={{ width: "15%", height: "100%", fontSize: "clamp(20px, 5.2vw, 30px)" }}
                  inputMode="numeric"
                  maxLength={1}
                  value={pinDigits[i]}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, "").slice(-1);
                    const next = [...pinDigits];
                    next[i] = v;
                    setPinDigits(next);
                    if (v && i < 3) pinRefs.current[i + 1]?.focus();
                  }}
                  onKeyDown={e => {
                    if (e.key === "Backspace") {
                      if (pinDigits[i]) {
                        const next = [...pinDigits];
                        next[i] = "";
                        setPinDigits(next);
                      } else if (i > 0) {
                        const next = [...pinDigits];
                        next[i - 1] = "";
                        setPinDigits(next);
                        pinRefs.current[i - 1]?.focus();
                      }
                      e.preventDefault();
                    } else if (e.key === "ArrowLeft" && i > 0) {
                      pinRefs.current[i - 1]?.focus();
                    } else if (e.key === "ArrowRight" && i < 3) {
                      pinRefs.current[i + 1]?.focus();
                    } else if (e.key === "Enter" && pin.length === 4) {
                      login();
                    }
                  }}
                  onPaste={e => {
                    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
                    if (text.length) {
                      e.preventDefault();
                      const next = ["", "", "", ""];
                      for (let k = 0; k < text.length; k++) next[k] = text[k];
                      setPinDigits(next);
                      pinRefs.current[Math.min(text.length, 3)]?.focus();
                    }
                  }}
                />
              ))}
            </div>

            {/* Botón Entrar / Join */}
            <button
              type="button"
              disabled={busy}
              onClick={() => { setPulseKey(k => k + 1); login(); }}
              className="login-cta absolute bg-transparent border-0 outline-none font-display tracking-wider disabled:opacity-70 cursor-pointer"
              style={{
                top: "77%",
                left: "12%",
                width: "76%",
                height: "11%",
                fontSize: "clamp(18px, 4.6vw, 26px)",
              }}
            >
              <span key={pulseKey} className="login-cta-text is-pulsing">
                {t("home.enterCta")}
              </span>
            </button>
          </div>
        </div>
      )}


      {step === "role" && user && (
        <div className="ornate-card p-6 space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("home.hello", { name: user.username })}</p>
            <button onClick={logout} className="text-[10px] text-muted-foreground underline">{t("home.logout")}</button>
          </div>
          <h2 className="text-center font-display text-lg">{t("home.roleQuestion")}</h2>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-fantasy h-24 flex flex-col items-center justify-center gap-1 text-xs"
              onClick={() => { setRole("player"); preloadCharacterSheetAssets(); setStep("campaign"); }}>
              <span className="text-2xl">🗡️</span>{t("home.rolePlayer")}
            </button>
            <button className="btn-fantasy h-24 flex flex-col items-center justify-center gap-1 text-xs"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={() => { setRole("dm"); setStep("campaign"); }}>
              <span className="text-2xl">👑</span>{t("home.roleDM")}
            </button>
            <button className="btn-fantasy h-24 flex flex-col items-center justify-center gap-1 text-xs"
              onClick={() => { setRole("spectator"); preloadCharacterSheetAssets(); setStep("campaign"); }}>
              <span className="text-2xl">👁️</span>{t("home.roleSpectator")}
            </button>

          </div>
        </div>
      )}

      {!waitingReqId && expelledCampaign && (
        <div className="ornate-card p-6 space-y-4 text-center">
          <div className="text-5xl">🚫</div>
          <h2 className="font-display text-lg text-[var(--loss)]">{t("rejoin.title")}</h2>
          <p className="text-sm text-muted-foreground">{t("rejoin.body")}</p>
          <p className="text-xs text-muted-foreground">{expelledCampaign.name}</p>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-fantasy" onClick={() => setExpelledCampaign(null)}>{t("common.cancel")}</button>
            <button
              className="btn-fantasy"
              style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
              onClick={async () => { const c = expelledCampaign!; setExpelledCampaign(null); await requestRejoin(c); }}
            >
              {t("rejoin.request")}
            </button>
          </div>
        </div>
      )}

      {!waitingReqId && closedCampaign && (
        <div className="ornate-card p-6 space-y-4 text-center">
          <div className="text-5xl">🔒</div>
          <h2 className="font-display text-lg text-[var(--loss)]">{t("playerJoin.closedTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("playerJoin.closedBody")}</p>
          <p className="text-xs text-muted-foreground">{closedCampaign.name}</p>
          <button className="btn-fantasy w-full" onClick={() => setClosedCampaign(null)}>
            {t("playerJoin.close")}
          </button>
        </div>
      )}

      {waitingReqId && campaign && (
        <div className="ornate-card p-6 space-y-4 text-center">
          <div className="text-5xl">⏳</div>
          <h2 className="font-display text-lg text-[var(--gold)]">
            {waitingKind === "player_rejoin"
              ? t("rejoin.waitingTitle")
              : waitingKind === "player_join"
                ? t("playerJoin.waitingTitle")
                : t("home.waitingTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {waitingKind === "player_rejoin"
              ? t("rejoin.waitingBody", { name: campaign.name })
              : waitingKind === "player_join"
                ? t("playerJoin.waitingBody", { name: campaign.name })
                : t("home.waitingBody", { name: campaign.name })}
          </p>
          <button className="btn-fantasy w-full" onClick={cancelCoDMRequest}>
            {waitingKind === "player_rejoin"
              ? t("rejoin.cancel")
              : waitingKind === "player_join"
                ? t("playerJoin.cancel")
                : t("home.cancelRequest")}
          </button>
        </div>
      )}

      {!waitingReqId && !expelledCampaign && !closedCampaign && step === "campaign" && user && (
        <div className="ornate-card p-5 space-y-4">
          <h2 className="text-center font-display text-lg">{t("home.myCampaigns")}</h2>
          <input className="w-full rounded-md bg-input border border-border px-3 py-2 text-sm"
            placeholder={t("home.searchPlaceholder")} value={search} onChange={e => setSearch(e.target.value)} />
          <div className="max-h-56 overflow-y-auto space-y-2">
            {campaigns.filter(c => c.name.toLowerCase().includes(search.toLowerCase())).map(c => (
              <button key={c.id} onClick={() => setActionCampaign(c)}
                className="w-full rounded-lg border border-border bg-card px-3 py-3 text-left hover:border-[var(--gold)]/60 transition">
                <span className="font-display text-base">{c.name}</span>
              </button>
            ))}
            {!campaigns.length && <p className="text-center text-xs text-muted-foreground py-4">{t("home.noCampaigns")}</p>}
          </div>
          <div className="gem-divider" />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("home.joinByCode")}</p>
            <div className="flex flex-wrap gap-2">
              <input className="flex-1 min-w-0 basis-[12rem] rounded-md bg-input border border-border px-3 py-2 text-sm"
                placeholder={t("home.joinPlaceholder")} value={joinCode} onChange={e => setJoinCode(e.target.value)} />
              <button className="btn-fantasy shrink-0" onClick={joinByCode}>{t("home.join")}</button>
            </div>
          </div>
          {role === "dm" && (
            <>
              <div className="gem-divider" />
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("home.createCampaign")}</p>
                <div className="flex flex-wrap gap-2">
                  <input className="flex-1 min-w-0 basis-[12rem] rounded-md bg-input border border-border px-3 py-2 text-sm"
                    placeholder={t("home.namePlaceholder")} value={newCampaignName} onChange={e => setNewCampaignName(e.target.value)} />
                  <button className="btn-fantasy shrink-0" onClick={createCampaign}>{t("home.create")}</button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={singleDmOnly} onChange={e => setSingleDmOnly(e.target.checked)} />
                  {t("home.singleDmLabel")}
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                  <input type="checkbox" checked={lockNames} onChange={e => setLockNames(e.target.checked)} />
                  {t("home.lockNamesLabel")}
                </label>
              </div>
            </>
          )}
          <button className="text-xs text-muted-foreground underline w-full text-center" onClick={() => setStep("role")}>{t("home.changeRole")}</button>
        </div>
      )}

      {step === "character" && campaign && user && role === "player" && (
        <div className="ornate-card p-5 space-y-4">
          <h2 className="text-center font-display text-lg">{campaign.name}</h2>
          <p className="text-center text-xs uppercase tracking-widest text-muted-foreground">{t("home.yourCharacters")}</p>
          <div className="space-y-2">
            {myChars.map(c => {
              const equipped = myCharItems[c.id] || [];
              const max = totals(c, equipped).maxHp || 1;
              const cur = (c as any).current_hp ?? max;
              const pct = Math.max(0, Math.min(100, (cur / max) * 100));
              return (
                <button key={c.id} onClick={() => enterCampaign(campaign, c)}
                  className="w-full rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-[var(--gold)]/60 transition flex items-center gap-3">
                  <CharacterPortrait character={c as any} className="w-12 h-12 shrink-0 border-2"
                    rounded="rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-base truncate" style={{ color: c.color }}>{c.name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{c.race || "—"} / {c.class || "—"}</span>
                    </div>
                    <p className="text-[11px] mt-0.5">❤️ {cur}/{max}</p>
                    <div className="h-1 rounded-full bg-secondary overflow-hidden mt-1">
                      <div className="h-full" style={{ width: `${pct}%`, background: pct > 50 ? "var(--gain)" : pct > 25 ? "var(--gold)" : "var(--loss)" }} />
                    </div>
                  </div>
                </button>
              );
            })}
            {!myChars.length && <p className="text-center text-xs text-muted-foreground py-2">{t("home.noCharacters")}</p>}
          </div>
          <div className="gem-divider" />
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{t("home.createCharacter")}</p>
            <div className="flex flex-wrap gap-2">
              <input className="flex-1 min-w-0 basis-[12rem] rounded-md bg-input border border-border px-3 py-2 text-sm"
                placeholder={t("home.heroPlaceholder")} value={newCharName} onChange={e => setNewCharName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && createCharacter()} />
              <button className="btn-fantasy shrink-0" onClick={createCharacter}>{t("home.create")}</button>
            </div>
          </div>
          <button className="text-xs text-muted-foreground underline w-full text-center" onClick={() => setStep("campaign")}>{t("home.otherCampaign")}</button>
        </div>
      )}

      {actionCampaign && user && (
        <CampaignActionsModal
          campaign={actionCampaign}
          currentUserId={user.id}
          role={role}
          onPlay={() => {
            const c = actionCampaign;
            setActionCampaign(null);
            // Show the loading overlay IMMEDIATELY so the user cannot keep
            // interacting with the campaign list while we transition. For
            // the "player" role the next step is choosing a character
            // (no campaign load yet), so skip the overlay there.
            if (role !== "player") setEntering(true);
            pickCampaign(c).catch(() => setEntering(false));
          }}
          onClose={() => setActionCampaign(null)}
          onDeleted={() => {
            setCampaigns(cs => cs.filter(c => c.id !== actionCampaign.id));
            setActionCampaign(null);
          }}
        />
      )}

      {entering && (
        <CampaignLoadingOverlay
          onCancel={() => {
            setEntering(false);
            setCampaign(null);
          }}
        />
      )}
    </PageFrame>
  );
}

function randomColor() {
  const colors = ["#a78bfa", "#60a5fa", "#34d399", "#f472b6", "#fbbf24", "#fb7185", "#22d3ee", "#84cc16"];
  return colors[Math.floor(Math.random() * colors.length)];
}