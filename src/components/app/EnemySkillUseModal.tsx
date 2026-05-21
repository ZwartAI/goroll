import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import {
  logEnemySkillUse,
  type CombatEnemySkill,
  type CombatParticipant,
  type EnemySkillVisibility,
} from "@/lib/combat";
import { EnemyIcon } from "@/components/app/EnemyIconPicker";
import { StatText } from "@/components/app/StatText";

export function EnemySkillUseModal({
  participant, skill, onClose,
}: { participant: CombatParticipant; skill: CombatEnemySkill; onClose: () => void }) {
  const { t } = useT();
  const [resolvedTargets, setResolvedTargets] = useState("");
  const [rollResult, setRollResult] = useState("");
  const [dmNote, setDmNote] = useState("");
  const [visibility, setVisibility] = useState<EnemySkillVisibility>("full");
  const [busy, setBusy] = useState(false);

  const color = participant.enemy_color || "var(--loss)";
  const numericNoDice = !skill.dice && /\d/.test(skill.effect || "");

  const submit = async () => {
    if (participant.is_defeated) {
      if (!confirm(t("combat.enemy.defeatedWarn"))) return;
    }
    setBusy(true);
    await logEnemySkillUse(participant, skill, {
      visibility,
      resolvedTargets: resolvedTargets.trim() || undefined,
      rollResult: rollResult.trim() || undefined,
      dmNote: dmNote.trim() || undefined,
    });
    setBusy(false);
    toast.success(t("common.confirm"));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card max-w-md w-full max-h-[90vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full border-2 flex items-center justify-center"
            style={{ borderColor: color, color }}>
            <EnemyIcon name={participant.enemy_icon} size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("combat.enemy.useSkill")}</p>
            <p className="font-display text-sm truncate" style={{ color }}>{skill.name}</p>
            <p className="text-[10px] text-muted-foreground truncate">{participant.display_name}</p>
          </div>
        </div>

        <div className="text-[11px] space-y-0.5 bg-black/30 rounded p-2">
          {skill.dice && <p><span className="text-muted-foreground">{t("bestiary.dice")}: </span><span style={{ color: "var(--gold)" }}>{skill.dice}</span></p>}
          {skill.range_text && <p><span className="text-muted-foreground">{t("bestiary.range")}: </span><span style={{ color: "#60a5fa" }}>{skill.range_text}</span></p>}
          {skill.targets && <p><span className="text-muted-foreground">{t("bestiary.targets")}: </span><span style={{ color: "#34d399" }}>{skill.targets}</span></p>}
          {skill.effect && <p className="text-foreground/85"><StatText>{skill.effect}</StatText></p>}
          {skill.visual_brief && <p className="italic" style={{ color: "#c4b5fd" }}><StatText>{skill.visual_brief}</StatText></p>}
        </div>

        {numericNoDice && (
          <p className="text-[10px] text-[var(--gold)] bg-[var(--gold)]/10 border border-[var(--gold)]/40 rounded p-1.5">
            {t("combat.enemy.numericNoDiceWarn")}
          </p>
        )}

        <Field label={t("combat.enemy.resolvedTargets")}>
          <input value={resolvedTargets} onChange={e => setResolvedTargets(e.target.value)}
            className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" />
        </Field>
        <Field label={t("combat.enemy.rollResult")}>
          <input value={rollResult} onChange={e => setRollResult(e.target.value)}
            className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" />
        </Field>
        <Field label={t("combat.enemy.dmNote")}>
          <textarea value={dmNote} onChange={e => setDmNote(e.target.value)} rows={2}
            className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" />
        </Field>

        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{t("combat.enemy.visibility")}</p>
          {(["full", "nameAndEffect", "private"] as EnemySkillVisibility[]).map(v => (
            <label key={v} className="flex items-center gap-2 text-xs cursor-pointer">
              <input type="radio" name="vis" checked={visibility === v} onChange={() => setVisibility(v)} />
              {v === "full" && t("combat.enemy.showFullDetails")}
              {v === "nameAndEffect" && t("combat.enemy.showNameEffectOnly")}
              {v === "private" && t("combat.enemy.keepPrivate")}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-fantasy" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <button className="btn-fantasy" disabled={busy}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={submit}>{t("common.confirm")}</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
