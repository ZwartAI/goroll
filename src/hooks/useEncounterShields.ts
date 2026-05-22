import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type ShieldRow = {
  id: string;
  encounter_id: string;
  target_character_id: string | null;
  target_enemy_participant_id: string | null;
  effect_type: string;
  value: number;
};

/**
 * Subscribes to all shield-type temporary effects for the given encounter and
 * returns aggregated remaining shield values keyed by character id and by
 * enemy participant id. Updates instantly via Supabase realtime.
 */
export function useEncounterShields(encounterId: string | null | undefined) {
  const [byCharacter, setByCharacter] = useState<Record<string, number>>({});
  const [byEnemyParticipant, setByEnemyParticipant] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!encounterId) {
      setByCharacter({});
      setByEnemyParticipant({});
      return;
    }
    let alive = true;

    const load = async () => {
      const { data } = await (supabase as any)
        .from("combat_temporary_effects")
        .select("id,encounter_id,target_character_id,target_enemy_participant_id,effect_type,value")
        .eq("encounter_id", encounterId)
        .eq("effect_type", "shield");
      if (!alive) return;
      const rows: ShieldRow[] = (data as any) || [];
      const c: Record<string, number> = {};
      const e: Record<string, number> = {};
      for (const r of rows) {
        const v = Math.max(0, r.value || 0);
        if (v <= 0) continue;
        if (r.target_character_id) c[r.target_character_id] = (c[r.target_character_id] || 0) + v;
        if (r.target_enemy_participant_id)
          e[r.target_enemy_participant_id] = (e[r.target_enemy_participant_id] || 0) + v;
      }
      setByCharacter(c);
      setByEnemyParticipant(e);
    };

    load();
    const ch = supabase.channel(
      `shields-${encounterId}-${Math.random().toString(36).slice(2)}`,
    );
    ch.on(
      "postgres_changes" as any,
      {
        event: "*",
        schema: "public",
        table: "combat_temporary_effects",
        filter: `encounter_id=eq.${encounterId}`,
      },
      () => load(),
    ).subscribe();

    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [encounterId]);

  return { byCharacter, byEnemyParticipant };
}
