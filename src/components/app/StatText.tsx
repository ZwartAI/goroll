import React from "react";

/**
 * Highlights stat tokens (FUE, DES, CON, INT, SAB, CAR) inside arbitrary text
 * with muted colors that read well over the wine-colored card background.
 *
 * Matches whole-word occurrences (case sensitive — uppercase is the canonical form
 * used in the booster spreadsheets, e.g. "1d20 + mod SAB").
 */
const STAT_COLORS: Record<string, string> = {
  FUE: "var(--stat-fue)",
  DES: "var(--stat-des)",
  CON: "var(--stat-con)",
  INT: "var(--stat-int)",
  SAB: "var(--stat-sab)",
  CAR: "var(--stat-car)",
};

const STAT_RE = /\b(FUE|DES|CON|INT|SAB|CAR)\b/g;

export function StatText({ children, className }: { children?: string | null; className?: string }) {
  const text = children ?? "";
  if (!text) return null;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  STAT_RE.lastIndex = 0;
  let key = 0;
  while ((m = STAT_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <span key={key++} style={{ color: STAT_COLORS[m[1]], fontWeight: 600 }}>
        {m[1]}
      </span>
    );
    last = m.index + m[1].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}
