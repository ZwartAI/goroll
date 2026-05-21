import { useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { addEnemies, updateEnemy, type CombatEncounter, type CombatParticipant, type EnemyDraft, type InsertPosition } from "@/lib/combat";
import { EnemyIconPicker, EnemyColorPicker, ENEMY_COLORS, ENEMY_ASSETS } from "@/components/app/EnemyIconPicker";
import { NumberInput } from "@/components/app/NumberInput";
import { PRIMARY_TIERS, TIER_VISUALS, ROLE_OPTIONS, BIOME_PRESETS } from "@/lib/bestiary";

const CUSTOM_BIOME = "__custom__";


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
  const [tier, setTier] = useState<string>("normal");
  const [icon, setIcon] = useState(editing?.enemy_icon || "skull");
  const [color, setColor] = useState(editing?.enemy_color || ENEMY_COLORS[0]);
  const [initiative, setInitiative] = useState(editing?.initiative ?? 10);
  const [maxHp, setMaxHp] = useState(editing?.enemy_max_hp ?? 20);
  const [curHp, setCurHp] = useState(editing?.enemy_hp ?? (editing?.enemy_max_hp ?? 20));
  const [defense, setDefense] = useState(editing?.enemy_defense ?? 0);
  const [speed, setSpeed] = useState(editing?.enemy_speed || "30");
  const [notes, setNotes] = useState(editing?.enemy_notes || "");
  const [role, setRole] = useState<string>((editing as any)?.enemy_role || "damage");
  const initialBiome = (editing as any)?.enemy_biome || "";
  const isPreset = BIOME_PRESETS.includes(initialBiome);
  const [biomeChoice, setBiomeChoice] = useState<string>(initialBiome ? (isPreset ? initialBiome : CUSTOM_BIOME) : "");
  const [biomeCustom, setBiomeCustom] = useState(isPreset ? "" : initialBiome);
  const [baseDamage, setBaseDamage] = useState<string>((editing as any)?.enemy_base_damage || "");
  const [behavior, setBehavior] = useState<string>((editing as any)?.enemy_behavior || "");
  const [count, setCount] = useState(1);
  const [position, setPosition] = useState<InsertPosition>("byInitiative");
  const [busy, setBusy] = useState(false);


  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) { toast.error(t("combat.errNameRequired")); return; }
    if (maxHp <= 0) { toast.error(t("combat.errMaxHp")); return; }
    if (initiative < 1 || initiative > 20) { toast.error(t("combat.invalidInitiative")); return; }
    setBusy(true);
    const biome = biomeChoice === CUSTOM_BIOME ? biomeCustom.trim() : (biomeChoice || "");
    const draft: EnemyDraft = {
      name: trimmed, icon, color, initiative,
      max_hp: maxHp, current_hp: curHp,
      defense, speed, notes,
      role: role || null,
      biome: biome || null,
      base_damage: baseDamage.trim() || null,
      behavior: behavior.trim() || null,
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

        <Field label={t("bestiary.tier")}>
          <div className="grid grid-cols-4 gap-1">
            {PRIMARY_TIERS.map(tk => (
              <button key={tk} type="button"
                onClick={() => {
                  setTier(tk);
                  const vis = TIER_VISUALS[tk];
                  if (vis) { setIcon(vis.assetKey); setColor(vis.border); }
                }}
                className={`text-[10px] py-1 rounded border ${tier === tk ? "border-[var(--gold)] bg-[var(--gold)]/15 text-[var(--gold)]" : "border-border"}`}>
                {t(`bestiary.tier_${tk}`)}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("bestiary.role")}>
            <select className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm"
              value={role} onChange={e => setRole(e.target.value)}>
              {ROLE_OPTIONS.map(r => (
                <option key={r} value={r}>{t(`bestiary.role_${r}`)}</option>
              ))}
            </select>
          </Field>
          <Field label={t("bestiary.biome")}>
            <select className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm"
              value={biomeChoice} onChange={e => setBiomeChoice(e.target.value)}>
              <option value="">{t("bestiary.biomeNone")}</option>
              {BIOME_PRESETS.map(b => <option key={b} value={b}>{b}</option>)}
              <option value={CUSTOM_BIOME}>{t("bestiary.addAnotherRegion")}</option>
            </select>
          </Field>
        </div>
        {biomeChoice === CUSTOM_BIOME && (
          <Field label={t("bestiary.customRegion")}>
            <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm"
              value={biomeCustom} onChange={e => setBiomeCustom(e.target.value)} maxLength={60} />
          </Field>
        )}


        <Field label={t("bestiary.visualAsset")}>
          <div className="grid grid-cols-6 gap-1.5">
            {(["normal","elite","boss","god","hero_female","hero_male"] as const).map(k => {
              const key = `asset:${k}`;
              const sel = icon === key;
              return (
                <button key={k} type="button" onClick={() => setIcon(sel ? "skull" : key)}
                  className={`aspect-square rounded-md border overflow-hidden ${sel ? "border-[var(--gold)] ring-2 ring-[var(--gold)]/50" : "border-border hover:border-[var(--gold)]/50"}`}
                  title={t(`bestiary.asset_${k}`)}>
                  <img src={ENEMY_ASSETS[k]} alt={k} className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        </Field>

        <Field label={t("combat.icon")}>
          <EnemyIconPicker value={icon} onChange={setIcon} />
        </Field>

        <Field label={t("combat.color")}>
          <EnemyColorPicker value={color} onChange={setColor} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={t("combat.initiative")}>
            <NumberInput min={1} max={20} value={initiative} onChange={setInitiative} />
          </Field>
          <Field label={t("combat.defense")}>
            <NumberInput min={0} value={defense} onChange={setDefense} />
          </Field>
          <Field label={t("combat.maxHp")}>
            <NumberInput min={1} value={maxHp} onChange={(v) => { setMaxHp(v); if (!isEdit) setCurHp(v); }} />
          </Field>
          <Field label={t("combat.currentHp")}>
            <NumberInput min={0} value={curHp} onChange={setCurHp} />
          </Field>
          <Field label={t("combat.speed")}>
            <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm w-full" value={speed} onChange={e => setSpeed(e.target.value)} />
          </Field>
          {!isEdit && (
            <Field label={t("combat.count")}>
              <NumberInput min={1} max={20} value={count} onChange={setCount} />
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
