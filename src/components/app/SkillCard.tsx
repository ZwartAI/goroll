import { useState } from "react";
import { ChevronDown, Dices, Crosshair, Users, Eye, Sparkles } from "lucide-react";
import { RARITY_COLOR, type Rarity } from "@/lib/game";
import { RarityBadge } from "./RarityBadge";
import { SkillIconMedallion } from "./SkillIconMedallion";

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

/** Best-effort split of "Alcance / Objetivos" combined strings. */
function splitRangeTargets(s: string | null): { range?: string; targets?: string } {
  if (!s) return {};
  const sep = s.match(/\s*(?:\/|·|\||,|-)\s*/);
  if (sep) {
    const i = s.indexOf(sep[0]);
    return { range: s.slice(0, i).trim(), targets: s.slice(i + sep[0].length).trim() };
  }
  return { range: s.trim() };
}

type Props = {
  s: CharacterSkill;
  /** Compact one-line look (used inside CharacterSheetModal). */
  compact?: boolean;
  /** Locked visual treatment + lock icon overlay. */
  locked?: boolean;
  /** Tap handler when card is not expandable (e.g. in CharacterSheetModal). */
  onClick?: () => void;
  /** Render the full grimoire-style horizontal card with inline expansion. */
  expandable?: boolean;
  i18n?: {
    dice: string;
    range: string;
    targets: string;
    effect: string;
    visual: string;
    rangeTargets: string;
  };
};

export function SkillCard({ s, compact, locked, onClick, expandable, i18n }: Props) {
  const color = RARITY_COLOR[s.rarity];
  const [open, setOpen] = useState(false);

  // Legacy compact mode (kept for CharacterSheetModal)
  if (compact) {
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

  const { range, targets } = splitRangeTargets(s.range_targets);
  const isExpandable = !!expandable;

  // Color tokens for data types (gold = dice, blue = range, green = targets)
  const DICE_C = "var(--gold)";
  const RANGE_C = "oklch(0.72 0.14 230)";
  const TARGET_C = "oklch(0.70 0.14 165)";
  const VISUAL_C = "oklch(0.75 0.12 300)";

  // Heuristic: only render extra "full effect" block when text is long enough to be clamped
  const effectLong = (s.effect?.length ?? 0) > 110;

  return (
    <div
      className="rounded-xl overflow-hidden transition-shadow"
      style={{
        border: `1.5px solid ${color}`,
        background: `linear-gradient(180deg, color-mix(in oklab, ${color} 10%, var(--card)), var(--card))`,
        boxShadow: `0 0 18px color-mix(in oklab, ${color} 22%, transparent)`,
        opacity: locked ? 0.92 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => (isExpandable ? setOpen(o => !o) : onClick?.())}
        className="w-full text-left p-3 flex gap-3 items-start"
      >
        <SkillIconMedallion type={s.type} rarity={s.rarity} size="md" locked={locked} />

        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-display text-base leading-tight line-clamp-2 flex-1 min-w-0" style={{ color }}>
              {s.name}
            </h4>
            <RarityBadge rarity={s.rarity} />
          </div>

          {s.type && (
            <span
              className="inline-block text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
              style={{
                color,
                border: `1px solid color-mix(in oklab, ${color} 45%, transparent)`,
                background: `color-mix(in oklab, ${color} 8%, transparent)`,
              }}
            >
              {s.type}
            </span>
          )}

          {s.effect && (
            <p className={`text-[11px] leading-snug ${open ? "" : "line-clamp-2"}`}
              style={{ color: "color-mix(in oklab, var(--foreground) 80%, transparent)" }}>
              {s.effect}
            </p>
          )}

          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {s.dice && <DataChip icon={<Dices size={11} />} color={DICE_C}>{s.dice}</DataChip>}
            {range && <DataChip icon={<Crosshair size={11} />} color={RANGE_C}>{range}</DataChip>}
            {targets && <DataChip icon={<Users size={11} />} color={TARGET_C}>{targets}</DataChip>}
            {!range && !targets && s.range_targets && (
              <DataChip icon={<Crosshair size={11} />} color={RANGE_C}>{s.range_targets}</DataChip>
            )}
          </div>
        </div>

        {isExpandable && (
          <ChevronDown
            size={18}
            className="shrink-0 mt-1 transition-transform text-muted-foreground"
            style={{ transform: open ? "rotate(180deg)" : "none" }}
          />
        )}
      </button>

      {isExpandable && open && (effectLong || s.visual_brief) && (
        <div className="px-3 pb-3 pt-1 border-t space-y-2.5"
          style={{ borderColor: `color-mix(in oklab, ${color} 35%, transparent)` }}>
          {effectLong && (
            <DetailRow icon={<Sparkles size={13} color={color} />} label={i18n?.effect ?? "Efecto"}>
              <p className="text-xs whitespace-pre-wrap"
                style={{ color: "color-mix(in oklab, var(--foreground) 88%, transparent)" }}>
                {s.effect}
              </p>
            </DetailRow>
          )}
          {s.visual_brief && (
            <DetailRow icon={<Eye size={13} color={VISUAL_C} />} label={i18n?.visual ?? "Visual"}>
              <p className="text-xs italic" style={{ color: VISUAL_C }}>{s.visual_brief}</p>
            </DetailRow>
          )}
        </div>
      )}
    </div>
  );
}

function DataChip({ icon, color, children }: { icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium"
      style={{
        color,
        border: `1px solid color-mix(in oklab, ${color} 40%, transparent)`,
        background: `color-mix(in oklab, ${color} 10%, transparent)`,
      }}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5 flex items-center gap-1">
        {icon} {label}
      </p>
      {children}
    </div>
  );
}

