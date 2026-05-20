import { RARITY_COLOR, type Rarity } from "@/lib/game";
import { RarityBadge } from "./RarityBadge";

export type CharacterSkill = {
  id: string;
  campaign_id: string;
  character_id: string;
  name: string;
  name_key: string;
  rarity: Rarity;
  type: string | null;
  effect: string | null;
  dice: string | null;
  range_targets: string | null;
  visual_brief: string | null;
  cost: number;
  is_unlocked: boolean;
  source: string;
  order_index: number;
};

export function SkillCard({ s, onClick, locked }: { s: CharacterSkill; onClick?: () => void; locked?: boolean }) {
  const color = RARITY_COLOR[s.rarity];
  return (
    <button
      onClick={onClick}
      className="ornate-card p-2 w-full text-left flex items-center justify-between gap-2"
      style={{
        borderColor: color,
        boxShadow: `0 0 8px color-mix(in oklab, ${color} 25%, transparent)`,
        background: `linear-gradient(180deg, color-mix(in oklab, ${color} 12%, var(--card)), var(--card))`,
        opacity: locked ? 0.85 : 1,
      }}
    >
      <span className="text-base">{locked ? "🔒" : "✨"}</span>
      <div className="flex-1 min-w-0">
        <p className="font-display text-sm leading-tight truncate" style={{ color }}>{s.name}</p>
        {s.type && <p className="text-[10px] text-muted-foreground truncate">{s.type}</p>}
      </div>
      <RarityBadge rarity={s.rarity} />
    </button>
  );
}
