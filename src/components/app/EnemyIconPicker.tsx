import {
  Skull, Sword, Shield, Eye, Flame, Bug, Crown, Ghost, PawPrint, Drama, Swords, Cloud,
  type LucideIcon,
} from "lucide-react";

export const ENEMY_ICONS: Record<string, LucideIcon> = {
  skull: Skull,
  sword: Sword,
  shield: Shield,
  eye: Eye,
  flame: Flame,
  bug: Bug,
  crown: Crown,
  ghost: Ghost,
  paw: PawPrint,
  mask: Drama,
  swords: Swords,
  shadow: Cloud,
};

export const ENEMY_COLORS = [
  "#ef4444", // red
  "#a855f7", // purple
  "#1e3a8a", // navy
  "#16a34a", // green
  "#eab308", // gold
  "#6b7280", // gray
  "#0f172a", // near-black
];

export function EnemyIcon({ name, size = 24, color }: { name: string | null | undefined; size?: number; color?: string }) {
  const Icon = ENEMY_ICONS[name || "skull"] || Skull;
  return <Icon size={size} color={color} />;
}

export function EnemyIconPicker({
  value, onChange,
}: { value: string; onChange: (key: string) => void }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {Object.entries(ENEMY_ICONS).map(([key, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`aspect-square rounded-md border flex items-center justify-center transition ${
            value === key ? "border-[var(--gold)] bg-[var(--gold)]/15" : "border-border bg-card hover:border-[var(--gold)]/50"
          }`}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
}

export function EnemyColorPicker({
  value, onChange,
}: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {ENEMY_COLORS.map(c => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 ${value === c ? "border-[var(--gold)]" : "border-border"}`}
          style={{ background: c }}
          aria-label={c}
        />
      ))}
    </div>
  );
}
