import { useEffect, useMemo, useState } from "react";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";
import { Plus, Trash2, ArrowUp, ArrowDown, Edit3 } from "lucide-react";
import {
  addEnemies,
  updateEnemy,
  listEnemySkills,
  addEnemySkillToParticipants,
  updateEnemySkill,
  deleteEnemySkill,
  reorderEnemySkill,
  type CombatEncounter,
  type CombatParticipant,
  type CombatEnemySkill,
  type CombatEnemySkillDraft,
  type EnemyDraft,
  type InsertPosition,
} from "@/lib/combat";
import { EnemyIconPicker, EnemyColorPicker, ENEMY_COLORS, ENEMY_ASSETS, getEnemyAssetUrl } from "@/components/app/EnemyIconPicker";
import { EnemyImageEditor, type EnemyImageState } from "@/components/app/EnemyImageEditor";
import { NumberInput } from "@/components/app/NumberInput";
import { PRIMARY_TIERS, TIER_VISUALS, ROLE_OPTIONS, BIOME_PRESETS, SKILL_TYPES, SKILL_SHAPES } from "@/lib/bestiary";
import { ConfirmDialog } from "@/components/app/ConfirmDialog";

const CUSTOM_BIOME = "__custom__";
const RARITIES = ["white", "blue", "purple", "gold"] as const;

type LocalSkill = CombatEnemySkillDraft & { id: string; _isLocal: true };

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
  const [image, setImage] = useState<EnemyImageState>({
    url: (editing as any)?.image_url || "",
    offsetX: (editing as any)?.enemy_image_offset_x ?? 50,
    offsetY: (editing as any)?.enemy_image_offset_y ?? 50,
    scale: (editing as any)?.enemy_image_scale ?? 1,
  });
  const [busy, setBusy] = useState(false);

  // Skills (snapshot per enemy participant).
  const [savedSkills, setSavedSkills] = useState<CombatEnemySkill[]>([]);
  const [localSkills, setLocalSkills] = useState<LocalSkill[]>([]);
  const [editingSkill, setEditingSkill] = useState<CombatEnemySkill | LocalSkill | null>(null);
  const [addingSkill, setAddingSkill] = useState(false);
  const [confirmDeleteSkill, setConfirmDeleteSkill] = useState<CombatEnemySkill | LocalSkill | null>(null);

  useEffect(() => {
    if (editing) listEnemySkills(editing.id).then(setSavedSkills);
  }, [editing?.id]);

  const allSkills = useMemo<Array<CombatEnemySkill | LocalSkill>>(
    () => [...savedSkills, ...localSkills].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)),
    [savedSkills, localSkills],
  );

  const reloadSavedSkills = async (pid: string) => setSavedSkills(await listEnemySkills(pid));

  const handleSkillUpsertLocal = (draft: CombatEnemySkillDraft, existing: CombatEnemySkill | LocalSkill | null) => {
    if (existing && (existing as LocalSkill)._isLocal) {
      setLocalSkills(prev => prev.map(s => (s.id === existing.id ? { ...s, ...draft } : s)));
    } else {
      const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setLocalSkills(prev => [...prev, { id, _isLocal: true, ...draft }]);
    }
  };

  const handleConfirmDeleteSkill = async () => {
    const s = confirmDeleteSkill;
    if (!s) return;
    if ((s as LocalSkill)._isLocal) {
      setLocalSkills(prev => prev.filter(x => x.id !== s.id));
    } else {
      await deleteEnemySkill(s as CombatEnemySkill);
      if (editing) reloadSavedSkills(editing.id);
    }
    setConfirmDeleteSkill(null);
  };

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
      image_url: image.url || null,
      image_offset_x: image.offsetX,
      image_offset_y: image.offsetY,
      image_scale: image.scale,
    };

    if (isEdit && editing) {
      const r = await updateEnemy(editing, draft);
      if (!r.ok) { toast.error(t("combat.saveError")); setBusy(false); return; }
      toast.success(t("combat.saved"));
    } else {
      const r = await addEnemies(encounter, draft, count, position, dm);
      if (!r.ok) { toast.error(t("combat.saveError")); setBusy(false); return; }
      // Persist local skills onto every created participant.
      const newIds = r.ids ?? [];
      if (localSkills.length && newIds.length) {
        for (let i = 0; i < localSkills.length; i++) {
          const { id: _id, _isLocal: _l, ...payload } = localSkills[i];
          await addEnemySkillToParticipants(newIds, encounter.id, encounter.campaign_id, {
            ...payload,
            order_index: i,
          });
        }
      }
      toast.success(t("combat.enemyAdded"));
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

        <Field label={t("bestiary.baseDamage")}>
          <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm"
            placeholder="1d6 + mod" value={baseDamage} onChange={e => setBaseDamage(e.target.value)} maxLength={60} />
        </Field>

        <Field label={t("bestiary.behavior")}>
          <textarea className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm" rows={2}
            value={behavior} onChange={e => setBehavior(e.target.value)} />
        </Field>

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

        {/* Skills — manage per-enemy combat skills */}
        <div className="space-y-2 border-t border-border/50 pt-3">
          <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
            {t("bestiary.sectionSkills")}
          </p>
          <div className="space-y-1.5">
            {allSkills.length === 0 && <p className="text-xs text-muted-foreground">{t("bestiary.noSkills")}</p>}
            {allSkills.map((s, i) => {
              const isLocal = (s as LocalSkill)._isLocal;
              const saved = !isLocal ? (s as CombatEnemySkill) : null;
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
                      <button type="button" className="text-muted-foreground disabled:opacity-30" onClick={async () => { await reorderEnemySkill(saved, "up", savedSkills); if (editing) reloadSavedSkills(editing.id); }} disabled={i === 0}><ArrowUp size={14} /></button>
                      <button type="button" className="text-muted-foreground disabled:opacity-30" onClick={async () => { await reorderEnemySkill(saved, "down", savedSkills); if (editing) reloadSavedSkills(editing.id); }} disabled={i === allSkills.length - 1}><ArrowDown size={14} /></button>
                    </>
                  )}
                  <button type="button" className="text-muted-foreground" onClick={() => setEditingSkill(s)}><Edit3 size={14} /></button>
                  <button type="button" className="text-destructive" onClick={() => setConfirmDeleteSkill(s)}><Trash2 size={14} /></button>
                </div>
              );
            })}
            <button type="button" className="btn-fantasy w-full text-xs" onClick={() => setAddingSkill(true)}>
              <Plus size={12} className="inline mr-1" /> {t("bestiary.addSkill")}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button className="btn-fantasy" onClick={onClose} disabled={busy}>{t("common.cancel")}</button>
          <button className="btn-fantasy" disabled={busy}
            style={{ background: "var(--gradient-gold)", color: "oklch(0.15 0.03 25)" }}
            onClick={submit}>
            {isEdit ? t("combat.save") : t("combat.add")}
          </button>
        </div>
      </div>

      {(addingSkill || editingSkill) && (
        <EnemySkillEditor
          participantId={editing?.id || null}
          encounterId={encounter.id}
          campaignId={encounter.campaign_id}
          editing={editingSkill}
          nextOrder={allSkills.length}
          onClose={() => { setAddingSkill(false); setEditingSkill(null); }}
          onLocalSave={(draft) => handleSkillUpsertLocal(draft, editingSkill)}
          onSavedRefresh={() => editing && reloadSavedSkills(editing.id)}
        />
      )}

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

function EnemySkillEditor({
  participantId, encounterId, campaignId, editing, nextOrder, onClose, onLocalSave, onSavedRefresh,
}: {
  participantId: string | null;
  encounterId: string;
  campaignId: string;
  editing: CombatEnemySkill | LocalSkill | null;
  nextOrder: number;
  onClose: () => void;
  onLocalSave: (draft: CombatEnemySkillDraft) => void;
  onSavedRefresh: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState(editing?.name || "");
  const [rarity, setRarity] = useState<string>((editing?.rarity as any) || "white");
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
    const draft: CombatEnemySkillDraft = {
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
    const isLocalEdit = editing && (editing as LocalSkill)._isLocal;
    // No participant yet (Add Enemy flow) OR editing a local-only draft → store locally.
    if (!participantId || isLocalEdit) {
      onLocalSave(draft);
      setBusy(false);
      onClose();
      return;
    }
    // Edit Enemy flow: persist directly.
    const r = editing
      ? await updateEnemySkill(editing as CombatEnemySkill, draft)
      : await addEnemySkillToParticipants([participantId], encounterId, campaignId, draft);
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
        <Field label={t("bestiary.name")}>
          <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("bestiary.rarity")}>
            <select className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm"
              value={rarity} onChange={e => setRarity(e.target.value)}>
              {RARITIES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label={t("bestiary.skillType")}>
            <select className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm"
              value={skillType} onChange={e => setSkillType(e.target.value)}>
              {SKILL_TYPES.map(v => <option key={v} value={v}>{t(`bestiary.skillType_${v}`)}</option>)}
            </select>
          </Field>
          <Field label={t("bestiary.castShape")}>
            <select className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm"
              value={shape} onChange={e => setShape(e.target.value)}>
              {SKILL_SHAPES.map(v => <option key={v} value={v}>{t(`bestiary.shape_${v}`)}</option>)}
            </select>
          </Field>
          <Field label={t("bestiary.targets")}>
            <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm" value={targets} onChange={e => setTargets(e.target.value)} placeholder="[Usuario]" />
          </Field>
          <Field label={t("bestiary.dice")}>
            <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm" value={dice} onChange={e => setDice(e.target.value)} placeholder="1d6" />
          </Field>
          <Field label={t("bestiary.range")}>
            <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm" value={rangeText} onChange={e => setRangeText(e.target.value)} placeholder="[MELEE]" />
          </Field>
        </div>
        <Field label={t("bestiary.effect")}>
          <textarea className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 text-sm" rows={2}
            value={effect} onChange={e => setEffect(e.target.value)} />
        </Field>
        <Field label={t("bestiary.visualBrief")}>
          <input className="w-full bg-secondary/40 border border-border rounded-md px-2 py-1.5 outline-none focus:border-[var(--gold)] text-sm" value={visual} onChange={e => setVisual(e.target.value)} />
        </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
