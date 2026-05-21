import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { addEnemies, updateEnemy, type CombatEncounter, type CombatParticipant, type EnemyDraft, type InsertPosition } from "@/lib/combat";
import { EnemyIconPicker, EnemyColorPicker, ENEMY_COLORS, ENEMY_ASSETS } from "@/components/app/EnemyIconPicker";
import { NumberInput } from "@/components/app/NumberInput";
import { PRIMARY_TIERS, TIER_VISUALS } from "@/lib/bestiary";

type Props = {
  encounter: CombatEncounter;
  dm: { id: string; name: string; color: string };
  editing?: CombatParticipant | null;
  onClose: () => void;
};

export function EnemyEditorModal({ encounter, dm, editing, onClose }: Props) {
  const { t } = useT();
  const isEdit = !!editing;

  const [name, setName] = useState(editing?.enemy_name || "");
  const [icon, setIcon] = useState(editing?.enemy_icon || "skull");
  const [color, setColor] = useState(editing?.enemy_color || ENEMY_COLORS[0]);
  const [initiative, setInitiative] = useState(editing?.initiative ?? 10);
  const [maxHp, setMaxHp] = useState(editing?.enemy_max_hp ?? 20);
  const [curHp, setCurHp] = useState(editing?.enemy_hp ?? (editing?.enemy_max_hp ?? 20));
  const [defense, setDefense] = useState(editing?.enemy_defense ?? 0);
  const [speed, setSpeed] = useState(editing?.enemy_speed || "30");
  const [notes, setNotes] = useState(editing?.enemy_notes || "");
  const [count, setCount] = useState(1);
  const [position, setPosition] = useState<InsertPosition>("byInitiative");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error(t("combat.errNameRequired")); return; }
    if (maxHp <= 0) { toast.error(t("combat.errMaxHp")); return; }
    if (initiative < 1 || initiative > 20) { toast.error(t("combat.invalidInitiative")); return; }
    setBusy(true);
    const draft: EnemyDraft = {
      name: trimmed, icon, color, initiative,
      max_hp: maxHp, current_hp: curHp,
      defense, speed, notes,
    };
    if (isEdit && editing) {
      const r = await updateEnemy(editing, draft);
      if (!r.ok) toast.error(t("combat.saveError"));
      else toast.success(t("combat.saved"));
    } else {
      const r = await addEnemies(encounter, draft, count, position, dm);
      if (!r.ok) toast.error(t("combat.saveError"));
      else toast.success(t("combat.enemyAdded"));
    }
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card max-w-md w-full max-h-[90vh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <h3 className="font-display text-[var(--gold)] text-base uppercase tracking-widest">
          {isEdit ? t("combat.editEnemy") : t("combat.addEnemy")}
        </h3>

        <Field label={t("combat.name")}>
          <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
        </Field>

        <Field label={t("combat.icon")}>
          <EnemyIconPicker value={icon} onChange={setIcon} />
        </Field>

        <Field label={t("combat.color")}>
          <EnemyColorPicker value={color} onChange={setColor} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("combat.initiative")}>
            <input type="number" min={1} max={20} className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full"
              value={initiative} onChange={e => setInitiative(parseInt(e.target.value) || 0)} />
          </Field>
          <Field label={t("combat.defense")}>
            <input type="number" min={0} className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full"
              value={defense} onChange={e => setDefense(parseInt(e.target.value) || 0)} />
          </Field>
          <Field label={t("combat.maxHp")}>
            <input type="number" min={1} className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full"
              value={maxHp} onChange={e => {
                const v = parseInt(e.target.value) || 1;
                setMaxHp(v);
                if (!isEdit) setCurHp(v);
              }} />
          </Field>
          <Field label={t("combat.currentHp")}>
            <input type="number" min={0} className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full"
              value={curHp} onChange={e => setCurHp(parseInt(e.target.value) || 0)} />
          </Field>
          <Field label={t("combat.speed")}>
            <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full" value={speed} onChange={e => setSpeed(e.target.value)} />
          </Field>
          {!isEdit && (
            <Field label={t("combat.count")}>
              <input type="number" min={1} max={20} className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full"
                value={count} onChange={e => setCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))} />
            </Field>
          )}
        </div>

        <Field label={t("combat.notes")}>
          <textarea className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>

        {!isEdit && (
          <Field label={t("combat.insertPosition")}>
            <select className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full" value={position} onChange={e => setPosition(e.target.value as InsertPosition)}>
              <option value="byInitiative">{t("combat.posByInitiative")}</option>
              <option value="afterCurrent">{t("combat.posAfterCurrent")}</option>
              <option value="end">{t("combat.posAtEnd")}</option>
            </select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button className="btn-fantasy" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <button className="btn-fantasy" disabled={busy}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={submit}>
            {isEdit ? t("combat.save") : t("combat.add")}
          </button>
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
