import { Gem } from "lucide-react";

export function SkillCostBadge({ cost, dim = false }: { cost: number; dim?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-display"
      style={{
        color: dim ? "var(--muted-foreground)" : "var(--gold)",
        border: `1px solid color-mix(in oklab, var(--gold) ${dim ? 25 : 55}%, transparent)`,
        background: `color-mix(in oklab, var(--gold) ${dim ? 6 : 12}%, transparent)`,
      }}
    >
      <Gem size={12} />
      {cost}
    </span>
  );
}
