import type { ReactNode } from "react";
import { RARITY_COLOR, type Segment } from "@/lib/game";
import { EnemyIcon } from "@/components/app/EnemyIconPicker";
import { StatText } from "@/components/app/StatText";

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
    if (i > 0 && s.t !== "enemy_skill" && s.t !== "enemy_speech" && s.t !== "player_skill") out.push(<span key={`sp${i}`}> </span>);
    if (s.t === "text") out.push(<span key={i} className="text-foreground/85"><StatText>{s.v}</StatText></span>);
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
    else if (s.t === "enemy_speech") {
      const p = s.v;
      const color = p.enemyColor || "var(--loss)";
      out.push(
        <span key={i} className="block my-1 rounded-md px-2 py-1.5 border"
          style={{ background: `color-mix(in oklab, ${color} 15%, var(--card))`, borderColor: `color-mix(in oklab, ${color} 55%, transparent)` }}>
          <span className="inline-flex items-center gap-1.5 align-middle">
            <span className="inline-flex w-5 h-5 rounded-full items-center justify-center border" style={{ borderColor: color, color }}>
              <EnemyIcon name={p.enemyIcon} size={11} />
            </span>
            <strong style={{ color }}>{p.enemyName}:</strong>
          </span>
          <span className="ml-1 italic text-foreground/90">"<StatText>{p.text}</StatText>"</span>
        </span>
      );
    }
    else if (s.t === "enemy_skill") {
      const p = s.v;
      const color = p.enemyColor || "var(--loss)";
      const rarityColor = (RARITY_COLOR as any)[p.rarity] || "var(--rarity-white)";
      const full = p.detail === "full";
      out.push(
        <span key={i} className="block my-1 rounded-md p-2 border-2"
          style={{
            background: "linear-gradient(180deg, oklch(0.18 0.02 280), oklch(0.12 0.02 280))",
            borderColor: `color-mix(in oklab, ${rarityColor} 65%, transparent)`,
          }}>
          <span className="flex items-center gap-2">
            <span className="inline-flex w-6 h-6 rounded-full items-center justify-center border" style={{ borderColor: color, color }}>
              <EnemyIcon name={p.enemyIcon} size={12} />
            </span>
            <strong style={{ color }} className="text-xs">{p.enemyName}</strong>
            <span className="text-[10px] text-muted-foreground">usó</span>
            <strong style={{ color: rarityColor }} className="text-xs">{p.skillName}</strong>
          </span>
          {full && (
            <span className="block mt-1 text-[10px] space-y-0.5">
              {p.dice && <span className="block"><span className="text-muted-foreground">Dados: </span><span style={{ color: "var(--gold)" }}>{p.dice}</span></span>}
              {p.rangeText && <span className="block"><span className="text-muted-foreground">Alcance: </span><span style={{ color: "#60a5fa" }}>{p.rangeText}</span></span>}
              {(p.resolvedTargets || p.targets) && <span className="block"><span className="text-muted-foreground">Objetivos: </span><span style={{ color: "#34d399" }}>{p.resolvedTargets || p.targets}</span></span>}
              {p.rollResult && <span className="block"><span className="text-muted-foreground">Tirada: </span><span style={{ color: "var(--gold)" }}>{p.rollResult}</span></span>}
            </span>
          )}
          {p.effect && <span className="block mt-1 text-[11px] text-foreground/90"><StatText>{p.effect}</StatText></span>}
          {full && p.visualBrief && <span className="block mt-0.5 text-[10px] italic" style={{ color: "#c4b5fd" }}><StatText>{p.visualBrief}</StatText></span>}
          {full && p.dmNote && <span className="block mt-0.5 text-[10px] text-muted-foreground">— <StatText>{p.dmNote}</StatText></span>}
        </span>
      );
    }
    else if (s.t === "player_skill") {
      const p = s.v;
      const color = p.charColor || "var(--gold)";
      const rarityColor = (RARITY_COLOR as any)[p.rarity] || "var(--rarity-white)";
      out.push(
        <span key={i} className="block my-1 rounded-md p-2 border-2"
          style={{
            background: "linear-gradient(180deg, oklch(0.18 0.02 280), oklch(0.12 0.02 280))",
            borderColor: `color-mix(in oklab, ${rarityColor} 65%, transparent)`,
          }}>
          <span className="flex items-center gap-2">
            <span className="inline-block w-6 h-6 rounded-full overflow-hidden border" style={{ borderColor: color }}>
              {p.charImage ? <img src={p.charImage} alt="" className="w-full h-full object-cover" /> : <span className="block w-full h-full bg-card" />}
            </span>
            <strong style={{ color }} className="text-xs">{p.charName}</strong>
            <span className="text-[10px] text-muted-foreground">✨</span>
            <strong style={{ color: rarityColor }} className="text-xs">{p.skillName}</strong>
          </span>
          {p.targetNames.length > 0 && (
            <span className="block mt-1 text-[10px]">
              <span className="text-muted-foreground">→ </span>
              <span style={{ color: "#34d399" }}>{p.targetNames.join(", ")}</span>
            </span>
          )}
          {p.rollResult && <span className="block text-[10px]"><span className="text-muted-foreground">🎲 </span><span style={{ color: "var(--gold)" }}>{p.rollResult}</span></span>}
          {p.damage.length > 0 && (
            <span className="block text-[10px] text-[var(--loss)]">
              {p.damage.map((d, k) => <span key={k} className="block">−{d.applied} {d.targetName}</span>)}
            </span>
          )}
          {p.heal.length > 0 && (
            <span className="block text-[10px] text-[var(--gain)]">
              {p.heal.map((d, k) => <span key={k} className="block">+{d.amount} {d.targetName}</span>)}
            </span>
          )}
          {p.shield.length > 0 && (
            <span className="block text-[10px]" style={{ color: "#60a5fa" }}>
              {p.shield.map((d, k) => <span key={k} className="block">🛡 +{d.amount} {d.targetName}</span>)}
            </span>
          )}
          {p.defeated.length > 0 && <span className="block text-[10px] text-muted-foreground">💀 {p.defeated.join(", ")}</span>}
          {p.note && <span className="block mt-0.5 text-[10px] italic text-foreground/80"><StatText>{p.note}</StatText></span>}
        </span>
      );
    }
  });
  return <span>{out}</span>;
}
