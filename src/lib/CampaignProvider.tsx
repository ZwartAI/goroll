import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getSession, setSession, type Campaign, type Character, type Item, type LogRow, type Achievement } from "./game";
import type { CombatEncounter, CombatParticipant, CombatTurnGroup, CombatTurnPin } from "./combat";
import { CampaignLoadingOverlay } from "@/components/app/CampaignLoadingOverlay";

export type DmLabel = { name: string; color: string };

export type CombatState = {
  encounter: CombatEncounter | null;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  pins: CombatTurnPin[];
};

const LOGS_INITIAL_LIMIT = 50;

type GameData = {
  campaign: Campaign | null;
  character: Character | null;
  characters: Character[];
  items: Item[];
  logs: LogRow[];
  achievements: Achievement[];
  loading: boolean;
  /** Set of character ids currently connected (via Realtime presence). */
  onlineIds: Set<string>;
  /** Display overrides for DM/Co-DM characters used by the log (character_id → label). */
  dmLabels: Record<string, DmLabel>;
  /** character_ids belonging to DM-role users in this campaign (hidden from the player table). */
  dmCharacterIds: Set<string>;
  /** Active or collecting combat for this campaign (null when none). */
  combat: CombatState;
  reload: () => Promise<void>;
  loadMoreLogs: (extra?: number) => Promise<void>;
};

const Ctx = createContext<GameData | null>(null);

/** Generic targeted patcher for INSERT / UPDATE / DELETE realtime payloads. */
function applyChange<T extends { id: string }>(prev: T[], payload: any): T[] {
  const ev = payload?.eventType;
  const nu = payload?.new as T | null;
  const old = payload?.old as Partial<T> | null;
  if (ev === "INSERT" && nu) {
    if (prev.some(x => x.id === nu.id)) return prev;
    return [...prev, nu];
  }
  if (ev === "UPDATE" && nu) {
    return prev.map(x => (x.id === nu.id ? { ...x, ...nu } : x));
  }
  if (ev === "DELETE" && old?.id) {
    return prev.filter(x => x.id !== old.id);
  }
  return prev;
}

export function CampaignProvider({ children }: { children: ReactNode }) {
  const nav = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [character, setCharacter] = useState<Character | null>(null);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);

  const [onlineIds, setOnlineIds] = useState<Set<string>>(new Set());

  const [members, setMembers] = useState<Array<{ user_id: string; role: string; created_at: string }>>([]);

  const [combat, setCombat] = useState<CombatState>({ encounter: null, participants: [], groups: [], pins: [] });
  const logsLimitRef = useRef(LOGS_INITIAL_LIMIT);
  const charIdsRef = useRef<string[]>([]);

  // -------- Targeted loaders --------

  const loadCombat = useCallback(async (campaignId: string) => {
    const { data: encs } = await (supabase as any)
      .from("combat_encounters")
      .select("*")
      .eq("campaign_id", campaignId)
      .neq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(1);
    const enc = (encs && encs[0]) as CombatEncounter | undefined;
    if (!enc) { setCombat({ encounter: null, participants: [], groups: [], pins: [] }); return; }
    const [{ data: parts }, { data: grps }, { data: pins }] = await Promise.all([
      (supabase as any).from("combat_participants").select("*").eq("encounter_id", enc.id),
      (supabase as any).from("combat_turn_groups").select("*").eq("encounter_id", enc.id),
      (supabase as any).from("combat_turn_pins").select("*").eq("encounter_id", enc.id),
    ]);
    setCombat({
      encounter: enc,
      participants: (parts || []) as CombatParticipant[],
      groups: (grps || []) as CombatTurnGroup[],
      pins: (pins || []) as CombatTurnPin[],
    });
  }, []);

  const loadCharacters = useCallback(async (campaignId: string) => {
    const { data } = await supabase.from("characters").select("*").eq("campaign_id", campaignId);
    const chars = (data || []) as Character[];
    setCharacters(chars);
    charIdsRef.current = chars.map(c => c.id);
    return chars;
  }, []);

  const loadAchievements = useCallback(async (charIds: string[]) => {
    if (!charIds.length) { setAchievements([]); return; }
    const { data } = await supabase.from("achievements").select("*").in("character_id", charIds);
    setAchievements((data || []) as Achievement[]);
  }, []);

  const loadLogs = useCallback(async (campaignId: string, limit = LOGS_INITIAL_LIMIT) => {
    const { data } = await supabase
      .from("logs").select("*").eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }).limit(limit);
    logsLimitRef.current = limit;
    setLogs((data || []) as LogRow[]);
  }, []);

  const loadMoreLogs = useCallback(async (extra = 50) => {
    const s = getSession(); if (!s) return;
    await loadLogs(s.campaignId, logsLimitRef.current + extra);
  }, [loadLogs]);

  const load = useCallback(async () => {
    const s = getSession();
    if (!s) { nav({ to: "/" }); return; }

    // Critical first paint: campaign + current character + characters list + combat.
    const [c1, c2, c3, c6] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", s.campaignId).single(),
      s.characterId ? supabase.from("characters").select("*").eq("id", s.characterId).single() : Promise.resolve({ data: null }),
      supabase.from("characters").select("*").eq("campaign_id", s.campaignId),
      (supabase as any).from("campaign_members").select("user_id,role,created_at").eq("campaign_id", s.campaignId).order("created_at"),
    ]);
    if (!c1.data) { setSession(null); nav({ to: "/" }); return; }
    setCampaign(c1.data as Campaign);
    setCharacter((c2.data as Character) || null);
    const chars = (c3.data || []) as Character[];
    setCharacters(chars);
    charIdsRef.current = chars.map(c => c.id);
    setMembers((c6.data || []) as any);

    // Reveal UI as soon as core data is ready.
    setLoading(false);

    // Secondary data in parallel — UI can render partial while these arrive.
    void loadCombat(s.campaignId);
    void loadLogs(s.campaignId, LOGS_INITIAL_LIMIT);
    void supabase.from("items").select("*").eq("campaign_id", s.campaignId)
      .then(({ data }) => setItems((data || []) as Item[]));
    void loadAchievements(chars.map(c => c.id));
  }, [nav, loadCombat, loadAchievements, loadLogs]);

  useEffect(() => { load(); }, [load]);

  // Single shared realtime channel for the entire campaign session.
  // Realtime handlers apply TARGETED patches to local state instead of triggering
  // a full reload — that keeps the app snappy when many events fire.
  useEffect(() => {
    const s = getSession(); if (!s) return;
    const campaignId = s.campaignId;
    const channel = supabase.channel(`campaign:${campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${campaignId}` }, (payload: any) => {
        setCharacters(prev => {
          const next = applyChange(prev, payload);
          charIdsRef.current = next.map(c => c.id);
          return next;
        });
        const nu = payload?.new as Character | null;
        if (nu && s.characterId && nu.id === s.characterId) setCharacter(nu);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `campaign_id=eq.${campaignId}` }, (payload: any) => {
        setItems(prev => applyChange(prev, payload));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "logs", filter: `campaign_id=eq.${campaignId}` }, (payload: any) => {
        const ev = payload?.eventType;
        if (ev === "INSERT" && payload.new) {
          setLogs(prev => prev.some(l => l.id === payload.new.id) ? prev : [payload.new as LogRow, ...prev].slice(0, Math.max(logsLimitRef.current, 100)));
        } else if (ev === "UPDATE" && payload.new) {
          setLogs(prev => prev.map(l => l.id === payload.new.id ? { ...l, ...payload.new } : l));
        } else if (ev === "DELETE" && payload.old?.id) {
          setLogs(prev => prev.filter(l => l.id !== payload.old.id));
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "achievements" }, (payload: any) => {
        const nu = payload?.new as Achievement | null;
        const oldRow = payload?.old as Partial<Achievement> | null;
        const targetId = nu?.character_id ?? oldRow?.character_id;
        if (!targetId || !charIdsRef.current.includes(targetId)) return;
        setAchievements(prev => applyChange(prev, payload));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_members", filter: `campaign_id=eq.${campaignId}` }, async () => {
        const { data } = await (supabase as any).from("campaign_members").select("user_id,role,created_at").eq("campaign_id", campaignId).order("created_at");
        setMembers((data || []) as any);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns", filter: `id=eq.${campaignId}` }, (payload: any) => {
        if (payload?.new) setCampaign(payload.new as Campaign);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_encounters", filter: `campaign_id=eq.${campaignId}` }, () => loadCombat(campaignId))
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_participants", filter: `campaign_id=eq.${campaignId}` }, (payload: any) => {
        setCombat(prev => ({ ...prev, participants: applyChange(prev.participants, payload) as CombatParticipant[] }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_turn_groups", filter: `campaign_id=eq.${campaignId}` }, (payload: any) => {
        setCombat(prev => ({ ...prev, groups: applyChange(prev.groups, payload) as CombatTurnGroup[] }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "combat_turn_pins", filter: `campaign_id=eq.${campaignId}` }, (payload: any) => {
        setCombat(prev => ({ ...prev, pins: applyChange(prev.pins, payload) as CombatTurnPin[] }));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadCombat]);

  // Presence: track which characters are currently connected.
  useEffect(() => {
    const s = getSession(); if (!s) return;
    const isSpectator = !s.characterId;
    const presenceKey = s.characterId || `spectator:${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(`presence:campaign:${s.campaignId}`, {
      config: { presence: { key: presenceKey } },
    });
    const sync = () => {
      const state = ch.presenceState() as Record<string, any[]>;
      const ids = Object.keys(state).filter(k => !k.startsWith("spectator:"));
      setOnlineIds(new Set(ids));
    };
    ch.on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track(isSpectator
            ? { spectator: true, at: Date.now() }
            : { character_id: presenceKey, at: Date.now() });
        }
      });
    return () => { supabase.removeChannel(ch); };
  }, []);

  const { dmLabels, dmCharacterIds } = useMemo(() => {
    const ownerId = (campaign as any)?.owner_user_id as string | null | undefined;
    const dmMembers = members
      .filter(m => m.role === "dm")
      .sort((a, b) => {
        if (a.user_id === ownerId) return -1;
        if (b.user_id === ownerId) return 1;
        return a.created_at.localeCompare(b.created_at);
      });
    const labelByUserId: Record<string, string> = {};
    let coCounter = 0;
    for (const m of dmMembers) {
      if (m.user_id === ownerId) labelByUserId[m.user_id] = "DM";
      else {
        coCounter++;
        labelByUserId[m.user_id] = coCounter === 1 ? "Co-DM" : `Co-DM ${coCounter}`;
      }
    }
    const labels: Record<string, DmLabel> = {};
    const ids = new Set<string>();
    for (const c of characters) {
      const uid = (c as any).user_id as string | null;
      const userIsDm = uid && labelByUserId[uid];
      if (c.role === "dm" || userIsDm) {
        ids.add(c.id);
        const label = (uid && labelByUserId[uid]) || "DM";
        labels[c.id] = { name: label, color: "var(--gold)" };
      }
    }
    return { dmLabels: labels, dmCharacterIds: ids };
  }, [members, characters, campaign]);

  // Hide dm_only log entries from non-DM viewers (players + spectators).
  const isDmViewer = !!character && (character.role === "dm" || dmCharacterIds.has(character.id));
  const visibleLogs = useMemo(
    () => (isDmViewer ? logs : logs.filter(l => !(l as any).dm_only)),
    [logs, isDmViewer],
  );

  return (
    <Ctx.Provider value={{ campaign, character, characters, items, logs: visibleLogs, achievements, loading, onlineIds, dmLabels, dmCharacterIds, combat, reload: load, loadMoreLogs }}>
      {loading && <CampaignLoadingOverlay onCancel={() => { setSession(null); nav({ to: "/" }); }} />}
      {children}
    </Ctx.Provider>
  );
}

function CampaignLoadingOverlay({ onCancel }: { onCancel: () => void }) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-[300] bg-black/85 flex items-center justify-center p-4">
      <div className="ornate-card p-5 w-full max-w-sm space-y-4 text-center">
        <div className="flex justify-center">
          <div className="w-10 h-10 rounded-full border-2 border-[var(--gold)]/30 border-t-[var(--gold)] animate-spin" />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-lg text-[var(--gold)]">{t("campaign.loadingTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("campaign.loadingBody")}</p>
        </div>
        <button className="btn-fantasy w-full" onClick={onCancel}>{t("common.cancel")}</button>
      </div>
    </div>
  );
}

/** Reads cached campaign data. Falls back to one-shot fetch if used outside the provider. */
export function useGameData(): GameData {
  const v = useContext(Ctx);
  if (v) return v;
  return {
    campaign: null, character: null, characters: [], items: [], logs: [], achievements: [],
    loading: true, onlineIds: new Set(), dmLabels: {}, dmCharacterIds: new Set(),
    combat: { encounter: null, participants: [], groups: [], pins: [] },
    reload: async () => {}, loadMoreLogs: async () => {},
  };
}
