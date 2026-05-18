import type { ReactNode } from "react";
import { RARITY_COLOR, type Segment } from "@/lib/game";

type Override = { name: string; color: string };

export function LogSegments({
  segments,
  onItem,
  onBooster,
  onChar,
  /** Map of character_id → { name, color } used to display DMs as "DM" / "Co-DM N" in the log. */
  nameOverrides,
}: {
  segments: Segment[];
  onItem?: (id: string) => void;
  onBooster?: (id: string) => void;
  onChar?: (id: string) => void;
  nameOverrides?: Record<string, Override>;
}) {
  const out: ReactNode[] = [];
  segments.forEach((s, i) => {
    if (i > 0) out.push(<span key={`sp${i}`}> </span>);
    if (s.t === "text") out.push(<span key={i} className="text-foreground/85">{s.v}</span>);
    else if (s.t === "char") {
      const clickable = onChar && s.id;
      const ov = s.id ? nameOverrides?.[s.id] : undefined;
      out.push(
        <strong key={i}
          className={clickable ? "cursor-pointer hover:underline" : ""}
          onClick={clickable ? () => onChar!(s.id!) : undefined}
          style={{ color: ov?.color ?? s.color }}>{ov?.name ?? s.v}</strong>
      );
    } else if (s.t === "item") {
      const isBooster = s.kind === "booster";
      const handler = isBooster ? onBooster : onItem;
      const clickable = handler && s.id;
      out.push(
        <em key={i}
          className={`not-italic underline underline-offset-2 ${clickable ? "cursor-pointer" : ""}`}
          onClick={clickable ? () => handler!(s.id!) : undefined}
          style={{ color: RARITY_COLOR[s.rarity] }}>{s.v}</em>
      );
    }
    else if (s.t === "coins") out.push(<span key={i} style={{ color: "var(--gold)" }} className="font-semibold">🪙 {s.v}</span>);
    else if (s.t === "gain") out.push(<span key={i} style={{ color: "var(--gain)" }} className="font-semibold">{s.v}</span>);
    else if (s.t === "loss") out.push(<span key={i} style={{ color: "var(--loss)" }} className="font-semibold">{s.v}</span>);
  });
  return <span>{out}</span>;
}

