import {
  Heart, Sword, Shield, Lock, Mountain, Wind, Ghost, BookOpen, Sparkles,
  Plus, Zap, Flame, Snowflake, Eye, Footprints, CircleDot, DoorOpen,
  Star, Moon, Cat, Skull, VenetianMask, Gem,
  type LucideIcon,
} from "lucide-react";
import { RARITY_COLOR, type Rarity } from "@/lib/game";

/** Catalog of manual icon options usable by the DM. */
export const SKILL_ICON_OPTIONS: { key: string; icon: LucideIcon; labelKey: string }[] = [
  { key: "heart",    icon: Heart,         labelKey: "skills.iconOpts.heart" },
  { key: "cross",    icon: Plus,          labelKey: "skills.iconOpts.cross" },
  { key: "shield",   icon: Shield,        labelKey: "skills.iconOpts.shield" },
  { key: "sword",    icon: Sword,         labelKey: "skills.iconOpts.sword" },
  { key: "bolt",     icon: Zap,           labelKey: "skills.iconOpts.bolt" },
  { key: "flame",    icon: Flame,         labelKey: "skills.iconOpts.flame" },
  { key: "ice",      icon: Snowflake,     labelKey: "skills.iconOpts.ice" },
  { key: "eye",      icon: Eye,           labelKey: "skills.iconOpts.eye" },
  { key: "chain",    icon: Lock,          labelKey: "skills.iconOpts.chain" },
  { key: "wind",     icon: Wind,          labelKey: "skills.iconOpts.wind" },
  { key: "boots",    icon: Footprints,    labelKey: "skills.iconOpts.boots" },
  { key: "rune",     icon: CircleDot,     labelKey: "skills.iconOpts.rune" },
  { key: "portal",   icon: DoorOpen,      labelKey: "skills.iconOpts.portal" },
  { key: "book",     icon: BookOpen,      labelKey: "skills.iconOpts.book" },
  { key: "star",     icon: Star,          labelKey: "skills.iconOpts.star" },
  { key: "moon",     icon: Moon,          labelKey: "skills.iconOpts.moon" },
  { key: "claw",     icon: Cat,           labelKey: "skills.iconOpts.claw" },
  { key: "poison",   icon: Skull,         labelKey: "skills.iconOpts.poison" },
  { key: "mask",     icon: VenetianMask,  labelKey: "skills.iconOpts.mask" },
  { key: "crystal",  icon: Gem,           labelKey: "skills.iconOpts.crystal" },
  { key: "terrain",  icon: Mountain,      labelKey: "skills.iconOpts.terrain" },
  { key: "summon",   icon: Ghost,         labelKey: "skills.iconOpts.summon" },
];

const ICON_BY_KEY: Record<string, LucideIcon> = Object.fromEntries(
  SKILL_ICON_OPTIONS.map(o => [o.key, o.icon])
);

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

export function resolveSkillIcon(iconKey: string | null | undefined, type: string | null | undefined): LucideIcon {
  if (iconKey && ICON_BY_KEY[iconKey]) return ICON_BY_KEY[iconKey];
  return iconForType(type);
}

type Size = "sm" | "md" | "lg";
const SIZES: Record<Size, { box: number; icon: number }> = {
  sm: { box: 40, icon: 18 },
  md: { box: 56, icon: 26 },
  lg: { box: 72, icon: 34 },
};

export function SkillIconMedallion({
  type, rarity, size = "md", locked = false, iconKey = null,
}: { type: string | null; rarity: Rarity; size?: Size; locked?: boolean; iconKey?: string | null }) {
  const Icon = resolveSkillIcon(iconKey, type);
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
