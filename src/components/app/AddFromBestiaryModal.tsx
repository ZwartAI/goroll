import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { spawnFromTemplate, type EnemyTemplate, type SpawnPosition } from "@/lib/bestiary";
import type { CombatEncounter } from "@/lib/combat";

type Props = {
  template: EnemyTemplate;
  encounter: CombatEncounter;
  dm: { id: string; name: string; color: string };
  onClose: () => void;
};

export function AddFromBestiaryModal({ template, encounter, dm, onClose }: Props) {
  const { t } = useT();
  const [count, setCount] = useState(1);
  const [initiative, setInitiative] = useState(10);
  const [position, setPosition] = useState<SpawnPosition>("byInitiative");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const r = await spawnFromTemplate(template, encounter, { count, initiative, position }, dm);
    setBusy(false);
    if (!r.ok) { toast.error(t("bestiary.spawnError")); return; }
    toast.success(t("bestiary.spawned"));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card max-w-sm w-full p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-[var(--gold)] text-sm uppercase tracking-widest">
          {t("bestiary.addToCombat")}: {template.name}
        </h3>
        <Field label={t("bestiary.quantity")}>
          <input type="number" min={1} max={20} value={count}
            onChange={e => setCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
            className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" />
        </Field>
        <Field label={t("bestiary.initiative")}>
          <input type="number" min={1} max={20} value={initiative}
            onChange={e => setInitiative(parseInt(e.target.value) || 0)}
            className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" />
        </Field>
        <Field label={t("combat.insertPosition")}>
          <select value={position} onChange={e => setPosition(e.target.value as SpawnPosition)}
            className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm">
            <option value="byInitiative">{t("combat.posByInitiative")}</option>
            <option value="afterCurrent">{t("combat.posAfterCurrent")}</option>
            <option value="end">{t("combat.posAtEnd")}</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2 pt-1">
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
