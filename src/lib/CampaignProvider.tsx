import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getSession, setSession, type Campaign, type Character, type Item, type LogRow, type Achievement } from "./game";
import type { CombatEncounter, CombatParticipant, CombatTurnGroup } from "./combat";

export type DmLabel = { name: string; color: string };

export type CombatState = {
  encounter: CombatEncounter | null;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
};

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
};

const Ctx = createContext<GameData | null>(null);

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

  const [combat, setCombat] = useState<CombatState>({ encounter: null, participants: [], groups: [] });

  const loadCombat = useCallback(async (campaignId: string) => {
    const { data: encs } = await (supabase as any)
      .from("combat_encounters")
      .select("*")
      .eq("campaign_id", campaignId)
      .neq("status", "ended")
      .order("created_at", { ascending: false })
      .limit(1);
    const enc = (encs && encs[0]) as CombatEncounter | undefined;
    if (!enc) { setCombat({ encounter: null, participants: [], groups: [] }); return; }
    const [{ data: parts }, { data: grps }] = await Promise.all([
      (supabase as any).from("combat_participants").select("*").eq("encounter_id", enc.id),
      (supabase as any).from("combat_turn_groups").select("*").eq("encounter_id", enc.id),
    ]);
    setCombat({
      encounter: enc,
      participants: (parts || []) as CombatParticipant[],
      groups: (grps || []) as CombatTurnGroup[],
    });
  }, []);

  const load = useCallback(async () => {
    const s = getSession();
    if (!s) { nav({ to: "/" }); return; }
    const [c1, c2, c3, c4, c5, c6] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", s.campaignId).single(),
      s.characterId ? supabase.from("characters").select("*").eq("id", s.characterId).single() : Promise.resolve({ data: null }),
      supabase.from("characters").select("*").eq("campaign_id", s.campaignId),
      supabase.from("items").select("*").eq("campaign_id", s.campaignId),
      supabase.from("logs").select("*").eq("campaign_id", s.campaignId).order("created_at", { ascending: false }).limit(100),
      (supabase as any).from("campaign_members").select("user_id,role,created_at").eq("campaign_id", s.campaignId).order("created_at"),
    ]);
    if (!c1.data) { setSession(null); nav({ to: "/" }); return; }
    setCampaign(c1.data as Campaign);
    setCharacter((c2.data as Character) || null);
    const chars = (c3.data || []) as Character[];
    setCharacters(chars);
    setItems((c4.data || []) as Item[]);
    setLogs((c5.data || []) as LogRow[]);
    setMembers((c6.data || []) as any);
    const charIds = chars.map(c => c.id);
    const { data: ach } = charIds.length
      ? await supabase.from("achievements").select("*").in("character_id", charIds)
      : { data: [] as Achievement[] };
    setAchievements((ach || []) as Achievement[]);
    await loadCombat(s.campaignId);
    setLoading(false);
  }, [nav, loadCombat]);

  useEffect(() => { load(); }, [load]);

  // Single shared realtime channel for the entire campaign session.
  useEffect(() => {
    const s = getSession(); if (!s) return;
    const channel = supabase.channel(`campaign:${s.campaignId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "characters", filter: `campaign_id=eq.${s.campaignId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `campaign_id=eq.${s.campaignId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "logs", filter: `campaign_id=eq.${s.campaignId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "achievements" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "boosters", filter: `campaign_id=eq.${s.campaignId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "booster_assignments", filter: `campaign_id=eq.${s.campaignId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "character_conditions" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "campaign_members", filter: `campaign_id=eq.${s.campaignId}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "campaigns", filter: `id=eq.${s.campaignId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Presence: track which characters are currently connected.
  // Spectators (no characterId) still subscribe so they can SEE who is online,
  // but use a unique non-character key and don't expose themselves in onlineIds.
  useEffect(() => {
    const s = getSession(); if (!s) return;
    const isSpectator = !s.characterId;
    const presenceKey = s.characterId || `spectator:${Math.random().toString(36).slice(2)}`;
    const ch = supabase.channel(`presence:campaign:${s.campaignId}`, {
      config: { presence: { key: presenceKey } },
    });
    const sync = () => {
      const state = ch.presenceState() as Record<string, any[]>;
      // Only keys that correspond to actual character ids count as "online characters".
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

  // Compute DM/Co-DM display labels for the log + figure out which character ids
  // belong to DM-role users (those characters should not appear in the player table
  // and should not be exposed as online in the "Mesa de jugadores").
  const { dmLabels, dmCharacterIds } = useMemo(() => {
    const ownerId = (campaign as any)?.owner_user_id as string | null | undefined;
    // Order DM members by created_at; owner first, then co-DMs in join order.
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
      // A character is treated as DM-controlled when EITHER the character row says role='dm'
      // OR its owning user currently has the DM role in this campaign.
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

  return (
    <Ctx.Provider value={{ campaign, character, characters, items, logs, achievements, loading, onlineIds, dmLabels, dmCharacterIds, reload: load }}>
      {children}
    </Ctx.Provider>
  );
}

/** Reads cached campaign data. Falls back to one-shot fetch if used outside the provider. */
export function useGameData(): GameData {
  const v = useContext(Ctx);
  if (v) return v;
  return {
    campaign: null, character: null, characters: [], items: [], logs: [], achievements: [],
    loading: true, onlineIds: new Set(), dmLabels: {}, dmCharacterIds: new Set(), reload: async () => {},
  };
}

