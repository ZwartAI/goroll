import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getSession, setSession, type Campaign, type Character, type Item, type LogRow, type Achievement } from "./game";

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

  const load = useCallback(async () => {
    const s = getSession();
    if (!s) { nav({ to: "/" }); return; }
    const [c1, c2, c3, c4, c5] = await Promise.all([
      supabase.from("campaigns").select("*").eq("id", s.campaignId).single(),
      s.characterId ? supabase.from("characters").select("*").eq("id", s.characterId).single() : Promise.resolve({ data: null }),
      supabase.from("characters").select("*").eq("campaign_id", s.campaignId),
      supabase.from("items").select("*").eq("campaign_id", s.campaignId),
      supabase.from("logs").select("*").eq("campaign_id", s.campaignId).order("created_at", { ascending: false }).limit(100),
    ]);
    if (!c1.data) { setSession(null); nav({ to: "/" }); return; }
    setCampaign(c1.data as Campaign);
    setCharacter((c2.data as Character) || null);
    const chars = (c3.data || []) as Character[];
    setCharacters(chars);
    setItems((c4.data || []) as Item[]);
    setLogs((c5.data || []) as LogRow[]);
    const charIds = chars.map(c => c.id);
    const { data: ach } = charIds.length
      ? await supabase.from("achievements").select("*").in("character_id", charIds)
      : { data: [] as Achievement[] };
    setAchievements((ach || []) as Achievement[]);
    setLoading(false);
  }, [nav]);

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
      .on("postgres_changes", { event: "*", schema: "public", table: "character_conditions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  // Presence: track which characters are currently connected.
  useEffect(() => {
    const s = getSession(); if (!s || !s.characterId) return;
    const presenceKey = s.characterId;
    const ch = supabase.channel(`presence:campaign:${s.campaignId}`, {
      config: { presence: { key: presenceKey } },
    });
    const sync = () => {
      const state = ch.presenceState() as Record<string, any[]>;
      setOnlineIds(new Set(Object.keys(state)));
    };
    ch.on("presence", { event: "sync" }, sync)
      .on("presence", { event: "join" }, sync)
      .on("presence", { event: "leave" }, sync)
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ character_id: presenceKey, at: Date.now() });
        }
      });
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <Ctx.Provider value={{ campaign, character, characters, items, logs, achievements, loading, onlineIds, reload: load }}>
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
    loading: true, onlineIds: new Set(), reload: async () => {},
  };
}
