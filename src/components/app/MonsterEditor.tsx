import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Edit3 } from "lucide-react";
import {
  type EnemyTemplate,
  type EnemyTemplateDraft,
  type EnemyTemplateSkill,
  type EnemyTemplateSkillDraft,
  PRIMARY_TIERS,
  ROLE_OPTIONS,
  BIOME_PRESETS,
  SKILL_TYPES,
  SKILL_SHAPES,
  IMMUNITIES,
  createTemplate,
  updateTemplate,
  listTemplateSkills,
  addTemplateSkill,
  updateTemplateSkill,
  deleteTemplateSkill,
  reorderTemplateSkill,
} from "@/lib/bestiary";
import { EnemyIconPicker, EnemyColorPicker, ENEMY_COLORS, ENEMY_ASSETS } from "@/components/app/EnemyIconPicker";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";

type Props = {
  campaignId: string;
  dm: { id: string; name: string; color: string };
  editing?: EnemyTemplate | null;
  onClose: () => void;
  onSaved?: (t: EnemyTemplate) => void;
};

const RARITIES = ["white", "green", "blue", "purple", "orange", "red"] as const;

/** Local skill draft used before the template is saved. id starts with "local-". */
type LocalSkill = EnemyTemplateSkillDraft & { id: string; _isLocal?: boolean };

const CUSTOM_BIOME = "__custom__";

export function MonsterEditor({ campaignId, dm, editing, onClose, onSaved }: Props) {
  const { t } = useT();
  const isEdit = !!editing;

  const [name, setName] = useState(editing?.name || "");
  const [tier, setTier] = useState<string>(editing?.tier || "normal");
  const [role, setRole] = useState<string>(editing?.role || "damage");

  // Biome: selector with curated regions + "custom" fallback for free text.
  const initialBiome = editing?.biome || "";
  const isPreset = BIOME_PRESETS.includes(initialBiome);
  const [biomeChoice, setBiomeChoice] = useState<string>(
    initialBiome ? (isPreset ? initialBiome : CUSTOM_BIOME) : "",
  );
  const [biomeCustom, setBiomeCustom] = useState(isPreset ? "" : initialBiome);

  const [icon, setIcon] = useState(editing?.icon_key || "skull");
  const [color, setColor] = useState(editing?.color || ENEMY_COLORS[0]);
  const [maxHp, setMaxHp] = useState(editing?.max_hp ?? 20);
  const [defense, setDefense] = useState(editing?.defense ?? 0);
  const [speed, setSpeed] = useState(editing?.speed || "30");
  const [baseDamage, setBaseDamage] = useState(editing?.base_damage || "");
  const [description, setDescription] = useState(editing?.description || "");
  const [behavior, setBehavior] = useState(editing?.behavior_notes || "");
  const [weaknesses, setWeaknesses] = useState(editing?.weaknesses_text || "");
  const [immunities, setImmunities] = useState<string[]>(editing?.immunities || []);
  const [busy, setBusy] = useState(false);

  // Saved-side skills (when editing) + local-only skills (pre-save).
  const [savedSkills, setSavedSkills] = useState<EnemyTemplateSkill[]>([]);
  const [localSkills, setLocalSkills] = useState<LocalSkill[]>([]);
  const [editingSkill, setEditingSkill] = useState<EnemyTemplateSkill | LocalSkill | null>(null);
  const [addingSkill, setAddingSkill] = useState(false);
  const [confirmDeleteSkill, setConfirmDeleteSkill] = useState<EnemyTemplateSkill | LocalSkill | null>(null);

  useEffect(() => {
    if (editing) listTemplateSkills(editing.id).then(setSavedSkills);
  }, [editing?.id]);

  const toggleImmunity = (k: string) => {
    setImmunities(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };

  const resolvedBiome = useMemo(() => {
    if (!biomeChoice) return null;
    if (biomeChoice === CUSTOM_BIOME) return biomeCustom.trim() || null;
    return biomeChoice;
  }, [biomeChoice, biomeCustom]);

  const buildDraft = (): EnemyTemplateDraft => ({
    name: name.trim(),
    tier: tier as any,
    role: role as any,
    biome: resolvedBiome,
    icon_key: icon,
    color,
    max_hp: maxHp,
    defense,
    speed,
    base_damage: baseDamage.trim() || null,
    description: description.trim() || null,
    behavior_notes: behavior.trim() || null,
    weaknesses_text: weaknesses.trim() || null,
    immunities,
    // Mirror tier onto legacy boolean flags for compatibility.
    is_boss: tier === "boss" || tier === "god",
    is_elite: tier === "elite",
    created_by_character_id: dm.id,
  });

  /** All skills (saved + local) shown in the editor. */
  const allSkills = useMemo<Array<EnemyTemplateSkill | LocalSkill>>(
    () => [...savedSkills, ...localSkills].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [savedSkills, localSkills],
  );

  const reloadSavedSkills = async (tplId: string) => {
    setSavedSkills(await listTemplateSkills(tplId));
  };

  const handleSkillUpsert = (draft: EnemyTemplateSkillDraft, existing: EnemyTemplateSkill | LocalSkill | null) => {
    // Local-only path when no template yet.
    if (!editing) {
      if (existing && (existing as LocalSkill)._isLocal) {
        setLocalSkills(prev => prev.map(s => (s.id === existing.id ? { ...s, ...draft } : s)));
      } else {
        const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setLocalSkills(prev => [...prev, { id, _isLocal: true, ...draft }]);
      }
    }
  };

  const submit = async () => {
    if (!name.trim()) { toast.error(t("bestiary.errName")); return; }
    if (maxHp <= 0) { toast.error(t("bestiary.errHp")); return; }
    if (defense < 0) { toast.error(t("bestiary.errDef")); return; }
    if (biomeChoice === CUSTOM_BIOME && !biomeCustom.trim()) {
      toast.error(t("bestiary.errCustomBiome")); return;
    }
    setBusy(true);
    const draft = buildDraft();
    if (isEdit && editing) {
      const r = await updateTemplate(editing, draft);
      if (!r.ok) { toast.error(t("bestiary.saveError")); setBusy(false); return; }
      toast.success(t("bestiary.saved"));
      onSaved?.(editing);
      setBusy(false);
      onClose();
    } else {
      const r = await createTemplate(campaignId, draft, dm);
      if (!r.ok) { toast.error(t("bestiary.saveError")); setBusy(false); return; }
      // Persist any local skills.
      let failed = 0;
      for (let i = 0; i < localSkills.length; i++) {
        const s = localSkills[i];
        const { id: _id, _isLocal: _l, ...payload } = s;
        const res = await addTemplateSkill(r.template, { ...payload, order_index: i });
        if (!res.ok) failed++;
      }
      if (failed > 0) {
        toast.error(t("bestiary.skillsPartial"));
        setBusy(false);
        return; // keep modal open so the DM can retry
      }
      toast.success(t("bestiary.saved"));
      onSaved?.(r.template);
      setBusy(false);
      onClose();
    }
  };

  const handleConfirmDeleteSkill = async () => {
    const s = confirmDeleteSkill;
    if (!s) return;
    if ((s as LocalSkill)._isLocal) {
      setLocalSkills(prev => prev.filter(x => x.id !== s.id));
    } else {
      await deleteTemplateSkill(s as EnemyTemplateSkill);
      if (editing) reloadSavedSkills(editing.id);
    }
    setConfirmDeleteSkill(null);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card max-w-2xl w-full max-h-[92vh] overflow-y-auto p-4 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[var(--gold)] text-base uppercase tracking-widest">
            {isEdit ? t("bestiary.editMonster") : t("bestiary.createMonster")}
          </h3>
          <button className="text-muted-foreground" onClick={onClose}>✕</button>
        </div>

        {/* Identity */}
        <Section title={t("bestiary.sectionIdentity")}>
          <Field label={t("bestiary.name")}>
            <Input value={name} onChange={setName} maxLength={80} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("bestiary.tier")}>
              <Select value={tier} onChange={setTier} options={PRIMARY_TIERS.map(v => [v, t(`bestiary.tier_${v}`)])} />
            </Field>
            <Field label={t("bestiary.role")}>
              <Select value={role} onChange={setRole} options={ROLE_OPTIONS.map(v => [v, t(`bestiary.role_${v}`)])} />
            </Field>
            <Field label={t("bestiary.biome")}>
              <Select
                value={biomeChoice}
                onChange={setBiomeChoice}
                options={[
                  ["", t("bestiary.biomeNone")],
                  ...BIOME_PRESETS.map(b => [b, b] as [string, string]),
                  [CUSTOM_BIOME, t("bestiary.addAnotherRegion")],
                ]}
              />
            </Field>
            <div className="flex items-end">
              {biomeChoice === CUSTOM_BIOME && (
                <Input value={biomeCustom} onChange={setBiomeCustom} placeholder={t("bestiary.customRegion")} />
              )}
            </div>
          </div>
          <Field label={t("combat.icon")}>
            <EnemyIconPicker value={icon} onChange={setIcon} />
          </Field>
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
          <Field label={t("combat.color")}>
            <EnemyColorPicker value={color} onChange={setColor} />
          </Field>
        </Section>

        {/* Stats */}
        <Section title={t("bestiary.sectionStats")}>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("bestiary.maxHp")}>
              <Input type="number" value={String(maxHp)} onChange={v => setMaxHp(parseInt(v) || 0)} />
            </Field>
            <Field label={t("bestiary.defense")}>
              <Input type="number" value={String(defense)} onChange={v => setDefense(parseInt(v) || 0)} />
            </Field>
            <Field label={t("bestiary.speed")}>
              <Input value={speed} onChange={setSpeed} />
            </Field>
            <Field label={t("bestiary.baseDamage")}>
              <Input value={baseDamage} onChange={setBaseDamage} placeholder="1d6 + mod" />
            </Field>
          </div>
        </Section>

        {/* Description & behavior */}
        <Section title={t("bestiary.sectionDescription")}>
          <Field label={t("bestiary.description")}>
            <textarea className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" rows={2}
              value={description} onChange={e => setDescription(e.target.value)} />
          </Field>
          <Field label={t("bestiary.behavior")}>
            <textarea className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" rows={2}
              value={behavior} onChange={e => setBehavior(e.target.value)} />
          </Field>
        </Section>

        {/* Immunities */}
        <Section title={t("bestiary.sectionImmunities")}>
          <Field label={t("bestiary.immunities")}>
            <div className="flex flex-wrap gap-1">
              {IMMUNITIES.map(k => {
                const on = immunities.includes(k);
                return (
                  <button key={k} type="button" onClick={() => toggleImmunity(k)}
                    className={`text-[10px] px-2 py-1 rounded-md border ${on ? "bg-[var(--gold)]/20 border-[var(--gold)] text-[var(--gold)]" : "border-border text-foreground"}`}>
                    {t(`bestiary.immunity_${k}`)}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label={t("bestiary.weaknesses")}>
            <textarea className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" rows={2}
              value={weaknesses} onChange={e => setWeaknesses(e.target.value)} />
          </Field>
        </Section>

        {/* Skills — available before save */}
        <Section title={t("bestiary.sectionSkills")}>
          <div className="space-y-1.5">
            {allSkills.length === 0 && <p className="text-xs text-muted-foreground">{t("bestiary.noSkills")}</p>}
            {allSkills.map((s, i) => {
              const isLocal = (s as LocalSkill)._isLocal;
              const saved = !isLocal ? (s as EnemyTemplateSkill) : null;
              return (
                <div key={s.id} className="bg-secondary/40 rounded p-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display truncate">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {s.skill_type ? t(`bestiary.skillType_${s.skill_type}`) : "—"} · {s.dice || "—"}
                    </p>
                  </div>
                  {saved && (
                    <>
                      <button className="text-muted-foreground" onClick={async () => { await reorderTemplateSkill(saved, "up", savedSkills); if (editing) reloadSavedSkills(editing.id); }} disabled={i === 0}><ArrowUp size={14} /></button>
                      <button className="text-muted-foreground" onClick={async () => { await reorderTemplateSkill(saved, "down", savedSkills); if (editing) reloadSavedSkills(editing.id); }} disabled={i === allSkills.length - 1}><ArrowDown size={14} /></button>
                    </>
                  )}
                  <button className="text-muted-foreground" onClick={() => setEditingSkill(s)}><Edit3 size={14} /></button>
                  <button className="text-destructive" onClick={() => setConfirmDeleteSkill(s)}><Trash2 size={14} /></button>
                </div>
              );
            })}
            <button className="btn-fantasy w-full text-xs" onClick={() => setAddingSkill(true)}>
              <Plus size={12} className="inline mr-1" /> {t("bestiary.addSkill")}
            </button>
          </div>
          {(addingSkill || editingSkill) && (
            <SkillEditor
              template={editing || null}
              editing={editingSkill}
              nextOrder={allSkills.length}
              onClose={() => { setAddingSkill(false); setEditingSkill(null); }}
              onLocalSave={(draft) => handleSkillUpsert(draft, editingSkill)}
              onSavedRefresh={() => editing && reloadSavedSkills(editing.id)}
            />
          )}
        </Section>

        <div className="grid grid-cols-2 gap-2 pt-2 sticky bottom-0 bg-card/95 -mx-4 px-4 py-2 border-t border-border">
          <button className="btn-fantasy" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <button className="btn-fantasy" disabled={busy}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={submit}>
            {isEdit ? t("common.save") : t("bestiary.createMonster")}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDeleteSkill}
        title={t("bestiary.confirmDeleteSkillTitle")}
        description={t("bestiary.confirmDeleteSkill")}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        onConfirm={handleConfirmDeleteSkill}
        onCancel={() => setConfirmDeleteSkill(null)}
      />
    </div>
  );
}

function SkillEditor({
  template, editing, nextOrder, onClose, onLocalSave, onSavedRefresh,
}: {
  template: EnemyTemplate | null;
  editing: EnemyTemplateSkill | LocalSkill | null;
  nextOrder: number;
  onClose: () => void;
  onLocalSave: (draft: EnemyTemplateSkillDraft) => void;
  onSavedRefresh: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(editing?.name || "");
  const [rarity, setRarity] = useState<EnemyTemplateSkill["rarity"]>((editing?.rarity as any) || "white");
  const [skillType, setSkillType] = useState(editing?.skill_type || "impact");
  const [shape, setShape] = useState(editing?.target_shape || "point");
  const [targets, setTargets] = useState(editing?.targets || "");
  const [dice, setDice] = useState(editing?.dice || "");
  const [rangeText, setRangeText] = useState(editing?.range_text || "");
  const [effect, setEffect] = useState(editing?.effect || "");
  const [visual, setVisual] = useState(editing?.visual_brief || "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) { toast.error(t("bestiary.errSkillName")); return; }
    setBusy(true);
    const draft: EnemyTemplateSkillDraft = {
      name: name.trim(),
      rarity,
      skill_type: skillType,
      target_shape: shape,
      targets: targets.trim() || null,
      dice: dice.trim() || null,
      range_text: rangeText.trim() || null,
      effect: effect.trim() || null,
      visual_brief: visual.trim() || null,
      order_index: (editing as any)?.order_index ?? nextOrder,
    };
    // If template not yet persisted OR editing a local skill → local save.
    const isLocalEdit = editing && (editing as LocalSkill)._isLocal;
    if (!template || isLocalEdit) {
      onLocalSave(draft);
      setBusy(false);
      onClose();
      return;
    }
    const saved = editing as EnemyTemplateSkill;
    const r = editing
      ? await updateTemplateSkill(saved, draft)
      : await addTemplateSkill(template, draft);
    setBusy(false);
    if (!r.ok) { toast.error(t("bestiary.saveError")); return; }
    onSavedRefresh();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="ornate-card max-w-md w-full max-h-[90vh] overflow-y-auto p-4 space-y-2" onClick={e => e.stopPropagation()}>
        <h4 className="font-display text-[var(--gold)] text-sm uppercase tracking-widest">
          {editing ? t("bestiary.editSkill") : t("bestiary.addSkill")}
        </h4>
        <Field label={t("bestiary.name")}><Input value={name} onChange={setName} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("bestiary.rarity")}>
            <Select value={rarity} onChange={(v: any) => setRarity(v)} options={RARITIES.map(r => [r, r])} />
          </Field>
          <Field label={t("bestiary.skillType")}>
            <Select value={skillType} onChange={setSkillType} options={SKILL_TYPES.map(v => [v, t(`bestiary.skillType_${v}`)])} />
          </Field>
          <Field label={t("bestiary.castShape")}>
            <Select value={shape} onChange={setShape} options={SKILL_SHAPES.map(v => [v, t(`bestiary.shape_${v}`)])} />
          </Field>
          <Field label={t("bestiary.targets")}><Input value={targets} onChange={setTargets} placeholder="[Usuario]" /></Field>
          <Field label={t("bestiary.dice")}><Input value={dice} onChange={setDice} placeholder="1d6" /></Field>
          <Field label={t("bestiary.range")}><Input value={rangeText} onChange={setRangeText} placeholder="[MELEE]" /></Field>
        </div>
        <Field label={t("bestiary.effect")}>
          <textarea className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" rows={2}
            value={effect} onChange={e => setEffect(e.target.value)} />
        </Field>
        <Field label={t("bestiary.visualBrief")}><Input value={visual} onChange={setVisual} /></Field>
        <div className="grid grid-cols-2 gap-2 pt-2">
          <button className="btn-fantasy" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <button className="btn-fantasy" disabled={busy}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={submit}>{t("common.save")}</button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 border-t border-border/50 pt-3">
      <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">{title}</p>
      {children}
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
function Input({ value, onChange, type = "text", maxLength, placeholder }: {
  value: string; onChange: (v: string) => void; type?: string; maxLength?: number; placeholder?: string;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} maxLength={maxLength} placeholder={placeholder}
      className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm" />
  );
}
function Select({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm">
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
