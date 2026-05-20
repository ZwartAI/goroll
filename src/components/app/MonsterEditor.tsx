import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Edit3 } from "lucide-react";
import {
  type EnemyTemplate,
  type EnemyTemplateDraft,
  type EnemyTemplateSkill,
  type EnemyTemplateSkillDraft,
  TIER_OPTIONS,
  ROLE_OPTIONS,
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
import { EnemyIconPicker, EnemyColorPicker, ENEMY_COLORS } from "@/components/app/EnemyIconPicker";

type Props = {
  campaignId: string;
  dm: { id: string; name: string; color: string };
  editing?: EnemyTemplate | null;
  onClose: () => void;
  onSaved?: (t: EnemyTemplate) => void;
};

const RARITIES = ["white", "green", "blue", "purple", "orange", "red"] as const;

export function MonsterEditor({ campaignId, dm, editing, onClose, onSaved }: Props) {
  const { t } = useT();
  const isEdit = !!editing;

  const [name, setName] = useState(editing?.name || "");
  const [tier, setTier] = useState<string>(editing?.tier || "normal");
  const [role, setRole] = useState<string>(editing?.role || "damage");
  const [biome, setBiome] = useState(editing?.biome || "");
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
  const [isBoss, setIsBoss] = useState(editing?.is_boss || false);
  const [isElite, setIsElite] = useState(editing?.is_elite || false);
  const [busy, setBusy] = useState(false);
  const [createdTemplate, setCreatedTemplate] = useState<EnemyTemplate | null>(editing || null);

  const [skills, setSkills] = useState<EnemyTemplateSkill[]>([]);
  const [editingSkill, setEditingSkill] = useState<EnemyTemplateSkill | null>(null);
  const [addingSkill, setAddingSkill] = useState(false);

  useEffect(() => {
    if (createdTemplate) {
      listTemplateSkills(createdTemplate.id).then(setSkills);
    }
  }, [createdTemplate?.id]);

  const toggleImmunity = (k: string) => {
    setImmunities(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  };

  const buildDraft = (): EnemyTemplateDraft => ({
    name: name.trim(),
    tier: tier as any,
    role: role as any,
    biome: biome.trim() || null,
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
    is_boss: isBoss,
    is_elite: isElite,
    created_by_character_id: dm.id,
  });

  const submit = async () => {
    if (!name.trim()) { toast.error(t("bestiary.errName")); return; }
    if (maxHp <= 0) { toast.error(t("bestiary.errHp")); return; }
    if (defense < 0) { toast.error(t("bestiary.errDef")); return; }
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
      toast.success(t("bestiary.saved"));
      setCreatedTemplate(r.template);
      onSaved?.(r.template);
      setBusy(false);
    }
  };

  const reloadSkills = async () => {
    if (createdTemplate) setSkills(await listTemplateSkills(createdTemplate.id));
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
              <Select value={tier} onChange={setTier} options={TIER_OPTIONS.map(v => [v, t(`bestiary.tier_${v}`)])} />
            </Field>
            <Field label={t("bestiary.role")}>
              <Select value={role} onChange={setRole} options={ROLE_OPTIONS.map(v => [v, t(`bestiary.role_${v}`)])} />
            </Field>
            <Field label={t("bestiary.biome")}>
              <Input value={biome} onChange={setBiome} />
            </Field>
            <div className="flex items-end gap-3">
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={isElite} onChange={e => setIsElite(e.target.checked)} className="accent-[var(--gold)]" />
                {t("bestiary.isElite")}
              </label>
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={isBoss} onChange={e => setIsBoss(e.target.checked)} className="accent-[var(--gold)]" />
                {t("bestiary.isBoss")}
              </label>
            </div>
          </div>
          <Field label={t("combat.icon")}>
            <EnemyIconPicker value={icon} onChange={setIcon} />
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

        {/* Skills (only after template exists / when editing) */}
        {createdTemplate && (
          <Section title={t("bestiary.sectionSkills")}>
            <div className="space-y-1.5">
              {skills.length === 0 && <p className="text-xs text-muted-foreground">{t("bestiary.noSkills")}</p>}
              {skills.map((s, i) => (
                <div key={s.id} className="bg-secondary/40 rounded p-2 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display truncate">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">
                      {s.skill_type ? t(`bestiary.skillType_${s.skill_type}`) : "—"} · {s.dice || "—"}
                    </p>
                  </div>
                  <button className="text-muted-foreground" onClick={async () => { await reorderTemplateSkill(s, "up", skills); reloadSkills(); }} disabled={i === 0}><ArrowUp size={14} /></button>
                  <button className="text-muted-foreground" onClick={async () => { await reorderTemplateSkill(s, "down", skills); reloadSkills(); }} disabled={i === skills.length - 1}><ArrowDown size={14} /></button>
                  <button className="text-muted-foreground" onClick={() => setEditingSkill(s)}><Edit3 size={14} /></button>
                  <button className="text-destructive" onClick={async () => {
                    if (!confirm(t("bestiary.confirmDeleteSkill"))) return;
                    await deleteTemplateSkill(s); reloadSkills();
                  }}><Trash2 size={14} /></button>
                </div>
              ))}
              <button className="btn-fantasy w-full text-xs" onClick={() => setAddingSkill(true)}>
                <Plus size={12} className="inline mr-1" /> {t("bestiary.addSkill")}
              </button>
            </div>
            {(addingSkill || editingSkill) && createdTemplate && (
              <SkillEditor
                template={createdTemplate}
                editing={editingSkill}
                nextOrder={skills.length}
                onClose={() => { setAddingSkill(false); setEditingSkill(null); }}
                onSaved={reloadSkills}
              />
            )}
          </Section>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2 sticky bottom-0 bg-card/95 -mx-4 px-4 py-2 border-t border-border">
          <button className="btn-fantasy" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <button className="btn-fantasy" disabled={busy}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={submit}>
            {isEdit || createdTemplate ? t("common.save") : t("bestiary.createMonster")}
          </button>
        </div>
      </div>
    </div>
  );
}

function SkillEditor({
  template, editing, nextOrder, onClose, onSaved,
}: {
  template: EnemyTemplate;
  editing: EnemyTemplateSkill | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(editing?.name || "");
  const [rarity, setRarity] = useState<EnemyTemplateSkill["rarity"]>(editing?.rarity || "white");
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
    // Soft validation: numeric effects need dice
    const needsDice = ["impact", "healing", "control", "debuff"].includes(skillType);
    if (needsDice && !dice.trim() && !confirm(t("bestiary.warnNoDice"))) return;
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
      order_index: editing?.order_index ?? nextOrder,
    };
    const r = editing
      ? await updateTemplateSkill(editing, draft)
      : await addTemplateSkill(template, draft);
    setBusy(false);
    if (!r.ok) { toast.error(t("bestiary.saveError")); return; }
    onSaved();
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
          <Field label={t("bestiary.targets")}><Input value={targets} onChange={setTargets} /></Field>
          <Field label={t("bestiary.dice")}><Input value={dice} onChange={setDice} placeholder="1d6" /></Field>
          <Field label={t("bestiary.range")}><Input value={rangeText} onChange={setRangeText} /></Field>
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
