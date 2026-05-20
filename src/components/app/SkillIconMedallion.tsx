import {
  Heart, Sword, Shield, Lock, Mountain, Wind, Ghost, BookOpen, Sparkles,
  type LucideIcon,
} from "lucide-react";
import { RARITY_COLOR, type Rarity } from "@/lib/game";

/** Map a free-text "type" string to a lucide icon. Case/locale insensitive. */
export function iconForType(type: string | null | undefined): LucideIcon {
  const s = (type || "").toLowerCase();
  const has = (...keys: string[]) => keys.some(k => s.includes(k));
  if (has("heal", "curac", "sana", "vida")) return Heart;
  if (has("damage", "daño", "dano", "ataq", "impact", "fuego", "rayo", "llama")) return Sword;
  if (has("shield", "escudo", "protec", "defens", "soport", "barrer", "guard")) return Shield;
  if (has("control", "cc", "restric", "atad", "paraliz", "stun")) return Lock;
  if (has("terren", "area", "zona", "campo")) return Mountain;
  if (has("mov", "evas", "veloc", "dash", "wind", "viento")) return Wind;
  if (has("invoc", "summon", "espir", "portal")) return Ghost;
  if (has("util", "rol", "explor", "scout", "saber", "conoc")) return BookOpen;
  return Sparkles;
}

type Size = "sm" | "md" | "lg";
const SIZES: Record<Size, { box: number; icon: number }> = {
  sm: { box: 40, icon: 18 },
  md: { box: 56, icon: 26 },
  lg: { box: 72, icon: 34 },
};

export function SkillIconMedallion({
  type, rarity, size = "md", locked = false,
}: { type: string | null; rarity: Rarity; size?: Size; locked?: boolean }) {
  const Icon = iconForType(type);
  const { box, icon } = SIZES[size];
  const color = RARITY_COLOR[rarity];
  return (
    <div
      className="relative shrink-0 rounded-full flex items-center justify-center"
      style={{
        width: box,
        height: box,
        background: `radial-gradient(circle at 30% 30%, color-mix(in oklab, ${color} 55%, transparent), color-mix(in oklab, ${color} 10%, var(--card)) 70%)`,
        border: `1.5px solid ${color}`,
        boxShadow: `0 0 14px color-mix(in oklab, ${color} 45%, transparent), inset 0 0 10px color-mix(in oklab, ${color} 25%, transparent)`,
        opacity: locked ? 0.7 : 1,
      }}
      aria-hidden
    >
      <Icon size={icon} color={color} strokeWidth={1.8} />
      {/* tiny decorative rune dot */}
      <span
        className="absolute -top-0.5 -right-0.5 rounded-full"
        style={{
          width: 8, height: 8,
          background: color,
          boxShadow: `0 0 6px ${color}`,
        }}
      />
    </div>
  );
}
