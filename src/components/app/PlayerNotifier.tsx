import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Gift, Sparkles, ShieldAlert, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { playNotification } from "@/lib/sound";
import { useT } from "@/lib/i18n";

/**
 * Mounted once on the player's view of the campaign. Subscribes to realtime
 * inserts/updates on the player's character and shows a top toast + soft
 * bell whenever the DM sends them something (items, conditions, achievements,
 * skill points, level-ups). DM / spectator views must pass enabled={false}.
 */
export function PlayerNotifier({
  characterId,
  enabled = true,
  initialSp,
  initialLevel,
}: {
  characterId: string | null | undefined;
  enabled?: boolean;
  initialSp?: number | null;
  initialLevel?: number | null;
}) {
  const { t } = useT();
  const spRef = useRef<number | null>(typeof initialSp === "number" ? initialSp : null);
  const lvlRef = useRef<number | null>(typeof initialLevel === "number" ? initialLevel : null);

  // Keep baselines fresh if props update (e.g. after first load).
  useEffect(() => {
    if (typeof initialSp === "number" && spRef.current == null) spRef.current = initialSp;
    if (typeof initialLevel === "number" && lvlRef.current == null) lvlRef.current = initialLevel;
  }, [initialSp, initialLevel]);

  useEffect(() => {
    if (!enabled || !characterId) return;

    function notify(icon: React.ReactNode, message: string) {
      try { playNotification(); } catch { /* ignore */ }
      toast(message, {
        icon: icon as any,
        position: "top-center",
        duration: 4500,
        className: "ornate-card",
      });
    }

    const ch = (supabase as any)
      .channel(`notify:${characterId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "items", filter: `owner_character_id=eq.${characterId}` },
        (payload: any) => {
          const label = payload?.new?.label || payload?.new?.name || "";
          notify(<Gift size={16} className="text-[var(--gold)]" />,
            label ? t("notify.receivedItem", { label }) : t("notify.received"));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "character_conditions", filter: `character_id=eq.${characterId}` },
        (payload: any) => {
          const icon = payload?.new?.icon || "✨";
          const label = payload?.new?.label || "";
          notify(<ShieldAlert size={16} className="text-[var(--loss)]" />,
            `${icon} ${label || t("notify.received")}`.trim());
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "achievements", filter: `character_id=eq.${characterId}` },
        (payload: any) => {
          const label = payload?.new?.label || "";
          notify(<Trophy size={16} className="text-[var(--gold)]" />,
            label || t("notify.received"));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "characters", filter: `id=eq.${characterId}` },
        (payload: any) => {
          const nu = payload?.new || {};
          const prevSp = spRef.current;
          const prevLvl = lvlRef.current;
          const nextSp = typeof nu.skill_points === "number" ? nu.skill_points : prevSp;
          const nextLvl = typeof nu.level === "number" ? nu.level : prevLvl;
          if (prevSp != null && typeof nextSp === "number" && nextSp > prevSp) {
            const gained = nextSp - prevSp;
            notify(<Sparkles size={16} className="text-[var(--gold)]" />,
              `+${gained} SP`);
          }
          if (prevLvl != null && typeof nextLvl === "number" && nextLvl > prevLvl) {
            // LevelUpModal already plays a confetti celebration with its own UI,
            // so just play the bell here — skip the toast to avoid duplication.
            try { playNotification(); } catch { /* ignore */ }
          }
          spRef.current = typeof nextSp === "number" ? nextSp : prevSp;
          lvlRef.current = typeof nextLvl === "number" ? nextLvl : prevLvl;
        },
      )
      .subscribe();

    return () => { (supabase as any).removeChannel(ch); };
  }, [characterId, enabled, t]);

  return null;
}
