import { useState } from "react";
import { X, Sparkles } from "lucide-react";
import { RARITY_COLOR, type Rarity } from "@/lib/game";
import { useT } from "@/lib/i18n";
import { RarityBadge } from "./RarityBadge";
import { SkillIconMedallion } from "./SkillIconMedallion";
import { SkillCostBadge } from "./SkillCostBadge";
import { SkillDetailModal } from "./SkillDetailModal";
import type { CharacterSkill } from "./SkillCard";

type Props = {
  skills: CharacterSkill[];
  spBalance: number;
  onClose: () => void;
  onPurchase: (s: CharacterSkill) => Promise<void> | void;
};

export function SkillAcquireModal({ skills, spBalance, onClose, onPurchase }: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [peek, setPeek] = useState<CharacterSkill | null>(null);
  const [justBought, setJustBought] = useState<string | null>(null);

  async function buy(s: CharacterSkill) {
    if (busy) return;
    if (spBalance < s.cost) return;
    setBusy(s.id);
    try {
      await onPurchase(s);
      setJustBought(s.id);
      setTimeout(() => setJustBought(null), 1500);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-end sm:items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="ornate-card w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{ borderColor: "var(--gold)" }}
      >
        <div className="p-3 border-b border-border/60 flex items-center gap-2"
          style={{ background: "linear-gradient(180deg, color-mix(in oklab, var(--gold) 12%, transparent), transparent)" }}>
          <Sparkles size={18} className="text-[var(--gold)]" />
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg leading-tight text-[var(--gold)] truncate">{t("acquireSkills.title")}</h3>
            <p className="text-[11px] text-muted-foreground truncate">{t("acquireSkills.subtitle")}</p>
          </div>
          <div className="ornate-card px-2 py-1 flex items-center gap-1 text-xs">
            <span className="text-muted-foreground">SP</span>
            <span className="font-display text-[var(--gold)]">{spBalance}</span>
          </div>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {skills.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-10">{t("skills.noneShop")}</p>
          )}
          {skills.map(s => {
            const color = RARITY_COLOR[s.rarity as Rarity];
            const canBuy = spBalance >= s.cost;
            const isBusy = busy === s.id;
            const bought = justBought === s.id;
            return (
              <div
                key={s.id}
                className="rounded-xl p-2.5 flex gap-2.5 items-center"
                style={{
                  border: `1px solid color-mix(in oklab, ${color} 60%, transparent)`,
                  background: `linear-gradient(180deg, color-mix(in oklab, ${color} 8%, var(--card)), var(--card))`,
                }}
              >
                <SkillIconMedallion type={s.type} rarity={s.rarity as Rarity} size="sm" locked />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-display text-sm truncate flex-1" style={{ color }}>{s.name}</p>
                    <RarityBadge rarity={s.rarity as Rarity} />
                  </div>
                  {s.type && <p className="text-[10px] text-muted-foreground truncate">{s.type}</p>}
                  {s.effect && <p className="text-[10px] text-muted-foreground/80 line-clamp-1 mt-0.5">{s.effect}</p>}
                  <div className="flex items-center gap-2 mt-1.5">
                    <SkillCostBadge cost={s.cost} dim={!canBuy} />
                    <button
                      onClick={() => setPeek(s)}
                      className="text-[10px] underline text-muted-foreground hover:text-foreground"
                    >
                      {t("skills.viewDetails")}
                    </button>
                  </div>
                  {!canBuy && (
                    <p className="text-[10px] text-[var(--loss)] mt-0.5">
                      {t("skills.needMoreSp", { n: s.cost - spBalance })}
                    </p>
                  )}
                </div>
                <button
                  className="btn-fantasy text-xs px-3 py-2 shrink-0"
                  disabled={!canBuy || isBusy}
                  style={{
                    background: bought
                      ? "linear-gradient(135deg, oklch(0.55 0.15 145), oklch(0.40 0.13 145))"
                      : canBuy ? "var(--gradient-gold)" : undefined,
                    color: bought ? "white" : canBuy ? "oklch(0.15 0.03 25)" : undefined,
                    opacity: !canBuy ? 0.5 : 1,
                  }}
                  onClick={() => buy(s)}
                >
                  {bought ? t("skills.learned") : isBusy ? "…" : t("skills.learn")}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {peek && (
        <SkillDetailModal
          skill={peek}
          spBalance={spBalance}
          canAcquire={spBalance >= peek.cost && !peek.is_unlocked}
          onAcquire={!peek.is_unlocked ? async () => { await buy(peek); setPeek(null); } : undefined}
          onClose={() => setPeek(null)}
        />
      )}
    </div>
  );
}
