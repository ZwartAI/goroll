import { RARITY_COLOR, type Rarity } from "@/lib/game";
import { RarityBadge } from "./RarityBadge";
import { useT } from "@/lib/i18n";
import type { CharacterSkill } from "./SkillCard";

type Props = {
  skill: CharacterSkill;
  onClose: () => void;
  /** When provided, shows an "Acquire" button (player view, skill is locked). */
  onAcquire?: () => void;
  /** When provided, shows DM actions. */
  dmActions?: {
    onUnlockFree?: () => void;
    onDelete?: () => void;
  };
  canAcquire?: boolean;
  spBalance?: number;
};

export function SkillDetailModal({ skill, onClose, onAcquire, dmActions, canAcquire, spBalance }: Props) {
  const { t } = useT();
  const color = RARITY_COLOR[skill.rarity as Rarity];
  return (
    <div className="fixed inset-0 bg-black/85 z-[70] flex items-center justify-center p-4" onClick={onClose}>
      <div className="ornate-card p-4 max-w-sm w-full space-y-3 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        style={{ borderColor: color }}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("skills.skillLabel")}</p>
            <h3 className="font-display text-lg" style={{ color }}>{skill.name}</h3>
            {skill.type && <p className="text-[11px] text-muted-foreground">{skill.type}</p>}
          </div>
          <RarityBadge rarity={skill.rarity as Rarity} />
        </div>

        {skill.range_targets && (
          <Field label={t("skills.rangeTargets")} value={skill.range_targets} />
        )}
        {skill.dice && (
          <Field label={t("skills.dice")} value={skill.dice} />
        )}
        {skill.effect && (
          <Field label={t("skills.effect")} value={skill.effect} />
        )}
        {skill.visual_brief && (
          <Field label={t("skills.visualBrief")} value={skill.visual_brief} italic />
        )}

        <div className="flex items-center justify-between text-xs ornate-card p-2">
          <span className="text-muted-foreground">{t("skills.cost")}</span>
          <span className="font-display text-[var(--gold)]">{skill.cost} SP</span>
        </div>

        {onAcquire && (
          <button className="btn-fantasy w-full"
            disabled={!canAcquire}
            style={{ background: canAcquire ? "var(--gradient-gold)" : undefined, color: canAcquire ? "oklch(0.15 0.03 25)" : undefined, opacity: canAcquire ? 1 : 0.6 }}
            onClick={onAcquire}>
            {canAcquire ? t("skills.acquireFor", { n: skill.cost }) : t("skills.notEnoughSp", { have: spBalance ?? 0, need: skill.cost })}
          </button>
        )}

        {dmActions && (
          <div className="grid grid-cols-2 gap-2">
            {dmActions.onUnlockFree && !skill.is_unlocked && (
              <button className="btn-fantasy" onClick={dmActions.onUnlockFree}>{t("skills.unlockFree")}</button>
            )}
            {dmActions.onDelete && (
              <button className="btn-fantasy" style={{ background: "var(--gradient-blood)" }} onClick={dmActions.onDelete}>
                {t("common.delete")}
              </button>
            )}
          </div>
        )}

        <button className="text-xs text-muted-foreground underline w-full" onClick={onClose}>{t("common.close")}</button>
      </div>
    </div>
  );
}

function Field({ label, value, italic }: { label: string; value: string; italic?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">{label}</p>
      <p className={`text-xs whitespace-pre-wrap ${italic ? "italic text-muted-foreground" : ""}`}>{value}</p>
    </div>
  );
}
