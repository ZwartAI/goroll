import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { applyEnemyDamage, healEnemy, type CombatParticipant } from "@/lib/combat";
import { NumberInput } from "@/components/app/NumberInput";

type Props = {
  participant: CombatParticipant;
  onClose: () => void;
  /** Which sections to show. Default "both". */
  mode?: "both" | "heal" | "damage";
};

export function EnemyDamageModal({ participant, onClose, mode = "both" }: Props) {
  const { t } = useT();
  const [heal, setHeal] = useState(0);
  const [directDmg, setDirectDmg] = useState(0);
  const [defDmg, setDefDmg] = useState(0);
  const [busy, setBusy] = useState(false);
  const def = participant.enemy_defense || 0;

  const defPreview = Math.max(0, defDmg - def);

  const doDirect = async () => {
    if (directDmg <= 0) return;
    setBusy(true);
    const r = await applyEnemyDamage(participant, directDmg, { useDefense: false });
    setBusy(false);
    if (!r.ok) toast.error(t("combat.saveError"));
    else toast.success(t("combat.damageApplied", { n: r.applied, def: 0 }));
    onClose();
  };

  const doWithDef = async () => {
    if (defDmg <= 0) return;
    setBusy(true);
    const r = await applyEnemyDamage(participant, defDmg, { useDefense: true });
    setBusy(false);
    if (!r.ok) toast.error(t("combat.saveError"));
    else toast.success(t("combat.damageApplied", { n: r.applied, def }));
    onClose();
  };

  const doHeal = async () => {
    if (heal <= 0) return;
    setBusy(true);
    const r = await healEnemy(participant, heal);
    setBusy(false);
    if (!r.ok) toast.error(t("combat.saveError"));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card max-w-sm w-full p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-[var(--gold)] text-base uppercase tracking-widest">
          {participant.display_name}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          HP {participant.enemy_hp}/{participant.enemy_max_hp} · {t("combat.defense")} {def}
        </p>

        {(mode === "both" || mode === "heal") && (
          <div className="space-y-2">
            <label className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
              {t("combat.heal")}
            </label>
            <NumberInput min={0} value={heal} onChange={setHeal} />
            <button
              className="btn-fantasy w-full"
              disabled={busy || heal <= 0}
              style={{ background: "var(--gain)", color: "white" }}
              onClick={doHeal}
            >
              {t("combat.heal")}
            </button>
          </div>
        )}

        {(mode === "both" || mode === "damage") && (
          <>
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                {t("combat.directDamage")}
              </label>
              <NumberInput min={0} value={directDmg} onChange={setDirectDmg} />
              <button
                className="btn-fantasy w-full"
                disabled={busy || directDmg <= 0}
                style={{ background: "var(--loss)", color: "white" }}
                onClick={doDirect}
              >
                {t("combat.applyDirectDamage")}
              </button>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                {t("combat.damageWithDefense")}
              </label>
              <NumberInput min={0} value={defDmg} onChange={setDefDmg} />
              <p className="text-[11px] text-muted-foreground">
                {defDmg} − DEF {def} → <span className="text-foreground font-display">{defPreview} HP</span>
              </p>
              <button
                className="btn-fantasy w-full"
                disabled={busy || defDmg <= 0}
                style={{ background: "var(--loss)", color: "white" }}
                onClick={doWithDef}
              >
                {t("combat.applyDamageWithDefense")}
              </button>
            </div>
          </>
        )}

        <button className="btn-fantasy w-full mt-1" onClick={onClose} disabled={busy}>
          {t("common.cancel")}
        </button>
      </div>
    </div>
  );
}
