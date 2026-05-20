// Bestiary / monster templates — Phase 3.
// Permanent campaign-scoped library of enemies. DM only (client-side guard).

import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import type { CombatEncounter } from "@/lib/combat";
import { clampInitiative } from "@/lib/combat";

export type EnemyTier = "normal" | "elite" | "boss" | "minion" | "summon" | "hazard" | "special";
export type EnemyRole =
  | "damage" | "tank" | "support" | "control" | "skirmisher"
  | "summoner" | "terrain" | "hunter" | "protector";

export type EnemyTemplate = {
  id: string;
  campaign_id: string;
  name: string;
  tier: EnemyTier;
  role: EnemyRole;
  biome: string | null;
  icon_key: string;
  color: string;
  max_hp: number;
  defense: number;
  speed: string;
  base_damage: string | null;
  description: string | null;
  behavior_notes: string | null;
  weaknesses_text: string | null;
  immunities: string[];
  is_boss: boolean;
  is_elite: boolean;
  created_by_character_id: string | null;
  created_at: string;
  updated_at: string;
};

export type EnemyTemplateSkill = {
  id: string;
  enemy_template_id: string;
  campaign_id: string;
  name: string;
  rarity: "white" | "green" | "blue" | "purple" | "orange" | "red";
  skill_type: string | null;
  target_shape: string | null;
  targets: string | null;
  dice: string | null;
  range_text: string | null;
  effect: string | null;
  visual_brief: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export const TIER_OPTIONS: EnemyTier[] = ["normal", "elite", "boss", "minion", "summon", "hazard", "special"];
export const ROLE_OPTIONS: EnemyRole[] = [
  "damage", "tank", "support", "control", "skirmisher", "summoner", "terrain", "hunter", "protector",
];
export const SKILL_TYPES = ["impact", "healing", "support", "terrain", "control", "debuff", "summon", "reaction"];
export const SKILL_SHAPES = ["point", "touch", "line", "cone", "area", "self", "allies", "group"];
export const IMMUNITIES = [
  "poison", "burn", "freeze", "bleed", "stun", "fear", "sleep",
  "push", "knockdown", "blind", "silence", "mindControl", "defenseReduction", "movementRestriction",
];

export type EnemyTemplateDraft = Omit<EnemyTemplate, "id" | "created_at" | "updated_at" | "campaign_id">;
export type EnemyTemplateSkillDraft = Omit<EnemyTemplateSkill, "id" | "created_at" | "updated_at" | "campaign_id" | "enemy_template_id">;

// ─────────────── CRUD: templates ───────────────

export async function listTemplates(campaignId: string): Promise<EnemyTemplate[]> {
  const { data, error } = await (supabase as any)
    .from("enemy_templates")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("name", { ascending: true });
  if (error) return [];
  return (data as any) || [];
}

export async function listTemplateSkills(templateId: string): Promise<EnemyTemplateSkill[]> {
  const { data } = await (supabase as any)
    .from("enemy_template_skills")
    .select("*")
    .eq("enemy_template_id", templateId)
    .order("order_index", { ascending: true });
  return (data as any) || [];
}

export async function createTemplate(
  campaignId: string,
  draft: EnemyTemplateDraft,
  dm: { id: string; name: string; color: string },
) {
  const row = {
    campaign_id: campaignId,
    name: draft.name.trim(),
    tier: draft.tier,
    role: draft.role,
    biome: draft.biome,
    icon_key: draft.icon_key,
    color: draft.color,
    max_hp: Math.max(1, Math.floor(draft.max_hp)),
    defense: Math.max(0, Math.floor(draft.defense)),
    speed: draft.speed,
    base_damage: draft.base_damage,
    description: draft.description,
    behavior_notes: draft.behavior_notes,
    weaknesses_text: draft.weaknesses_text,
    immunities: draft.immunities,
    is_boss: draft.is_boss,
    is_elite: draft.is_elite,
    created_by_character_id: dm.id,
  };
  const { data, error } = await (supabase as any)
    .from("enemy_templates")
    .insert(row)
    .select("*")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message };
  await pushLog(campaignId, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: ` creó una plantilla de enemigo: ${row.name}.` },
  ]);
  return { ok: true as const, template: data as EnemyTemplate };
}

export async function updateTemplate(template: EnemyTemplate, patch: Partial<EnemyTemplateDraft>) {
  const upd: any = { ...patch };
  if (patch.name !== undefined) upd.name = patch.name.trim();
  if (patch.max_hp !== undefined) upd.max_hp = Math.max(1, Math.floor(patch.max_hp));
  if (patch.defense !== undefined) upd.defense = Math.max(0, Math.floor(patch.defense));
  const { error } = await (supabase as any)
    .from("enemy_templates")
    .update(upd)
    .eq("id", template.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function duplicateTemplate(template: EnemyTemplate, dm: { id: string; name: string; color: string }) {
  const skills = await listTemplateSkills(template.id);
  const { data, error } = await (supabase as any)
    .from("enemy_templates")
    .insert({
      campaign_id: template.campaign_id,
      name: `${template.name} (copia)`,
      tier: template.tier,
      role: template.role,
      biome: template.biome,
      icon_key: template.icon_key,
      color: template.color,
      max_hp: template.max_hp,
      defense: template.defense,
      speed: template.speed,
      base_damage: template.base_damage,
      description: template.description,
      behavior_notes: template.behavior_notes,
      weaknesses_text: template.weaknesses_text,
      immunities: template.immunities,
      is_boss: template.is_boss,
      is_elite: template.is_elite,
      created_by_character_id: dm.id,
    })
    .select("*")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message };
  if (skills.length) {
    const rows = skills.map(s => ({
      enemy_template_id: (data as any).id,
      campaign_id: template.campaign_id,
      name: s.name, rarity: s.rarity, skill_type: s.skill_type, target_shape: s.target_shape,
      targets: s.targets, dice: s.dice, range_text: s.range_text, effect: s.effect,
      visual_brief: s.visual_brief, order_index: s.order_index,
    }));
    await (supabase as any).from("enemy_template_skills").insert(rows);
  }
  return { ok: true as const, template: data as EnemyTemplate };
}

export async function deleteTemplate(template: EnemyTemplate) {
  const { error } = await (supabase as any)
    .from("enemy_templates")
    .delete()
    .eq("id", template.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

// ─────────────── CRUD: template skills ───────────────

export async function addTemplateSkill(template: EnemyTemplate, draft: EnemyTemplateSkillDraft) {
  const row = {
    enemy_template_id: template.id,
    campaign_id: template.campaign_id,
    name: draft.name.trim(),
    rarity: draft.rarity || "white",
    skill_type: draft.skill_type,
    target_shape: draft.target_shape,
    targets: draft.targets,
    dice: draft.dice,
    range_text: draft.range_text,
    effect: draft.effect,
    visual_brief: draft.visual_brief,
    order_index: Math.max(0, Math.floor(draft.order_index)),
  };
  const { data, error } = await (supabase as any)
    .from("enemy_template_skills")
    .insert(row)
    .select("*")
    .single();
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const, skill: data as EnemyTemplateSkill };
}

export async function updateTemplateSkill(skill: EnemyTemplateSkill, patch: Partial<EnemyTemplateSkillDraft>) {
  const upd: any = { ...patch };
  if (patch.name !== undefined) upd.name = patch.name.trim();
  const { error } = await (supabase as any)
    .from("enemy_template_skills")
    .update(upd)
    .eq("id", skill.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteTemplateSkill(skill: EnemyTemplateSkill) {
  const { error } = await (supabase as any)
    .from("enemy_template_skills")
    .delete()
    .eq("id", skill.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function reorderTemplateSkill(skill: EnemyTemplateSkill, direction: "up" | "down", siblings: EnemyTemplateSkill[]) {
  const sorted = [...siblings].sort((a, b) => a.order_index - b.order_index);
  const idx = sorted.findIndex(s => s.id === skill.id);
  if (idx < 0) return;
  const target = direction === "up" ? idx - 1 : idx + 1;
  if (target < 0 || target >= sorted.length) return;
  const a = sorted[idx], b = sorted[target];
  await (supabase as any).from("enemy_template_skills").update({ order_index: b.order_index }).eq("id", a.id);
  await (supabase as any).from("enemy_template_skills").update({ order_index: a.order_index }).eq("id", b.id);
}

// ─────────────── Spawn into combat ───────────────

export type SpawnPosition = "byInitiative" | "afterCurrent" | "end";

async function nextOrderIndex(encounterId: string): Promise<number> {
  const { data } = await (supabase as any)
    .from("combat_participants")
    .select("order_index")
    .eq("encounter_id", encounterId)
    .order("order_index", { ascending: false })
    .limit(1);
  const max = data && data[0] ? Number(data[0].order_index) : -1;
  return max + 1;
}

async function nextInstanceNumber(encounterId: string, baseName: string): Promise<number> {
  const { data } = await (supabase as any)
    .from("combat_participants")
    .select("enemy_instance_number")
    .eq("encounter_id", encounterId)
    .eq("enemy_name", baseName);
  const max = (data || []).reduce((acc: number, r: any) => Math.max(acc, Number(r.enemy_instance_number || 0)), 0);
  return max + 1;
}

export async function spawnFromTemplate(
  template: EnemyTemplate,
  encounter: CombatEncounter,
  options: { count: number; initiative: number; position: SpawnPosition },
  dm: { id: string; name: string; color: string },
) {
  if (encounter.status === "ended") return { ok: false as const, error: "ended" };
  const qty = Math.max(1, Math.min(20, Math.floor(options.count || 1)));
  const initiative = clampInitiative(options.initiative || 10);
  let baseOrder = await nextOrderIndex(encounter.id);
  if (options.position === "afterCurrent" && encounter.status === "active") {
    baseOrder = encounter.current_turn_index + 1;
  }
  const startInstance = await nextInstanceNumber(encounter.id, template.name);
  const rows: any[] = [];
  for (let i = 0; i < qty; i++) {
    const instance = startInstance + i;
    rows.push({
      encounter_id: encounter.id,
      campaign_id: encounter.campaign_id,
      character_id: null,
      participant_type: "enemy",
      display_name: qty > 1 || instance > 1 ? `${template.name} ${instance}` : template.name,
      image_url: null,
      color: template.color,
      initiative,
      order_index: baseOrder + i,
      enemy_name: template.name,
      enemy_icon: template.icon_key,
      enemy_color: template.color,
      enemy_hp: template.max_hp,
      enemy_max_hp: template.max_hp,
      enemy_defense: template.defense,
      enemy_speed: template.speed,
      enemy_notes: template.base_damage ? `Daño base: ${template.base_damage}` : null,
      enemy_instance_number: instance,
      enemy_template_id: template.id,
      is_enemy_visible: true,
      is_defeated: false,
    });
  }
  const { data: inserted, error } = await (supabase as any)
    .from("combat_participants").insert(rows).select("id");
  if (error) return { ok: false as const, error: error.message };

  // Snapshot skills for each new participant.
  const skills = await listTemplateSkills(template.id);
  if (skills.length && inserted && inserted.length) {
    const skillRows: any[] = [];
    for (const p of inserted) {
      for (const s of skills) {
        skillRows.push({
          campaign_id: encounter.campaign_id,
          encounter_id: encounter.id,
          combat_participant_id: p.id,
          template_skill_id: s.id,
          name: s.name,
          rarity: s.rarity,
          skill_type: s.skill_type,
          target_shape: s.target_shape,
          targets: s.targets,
          dice: s.dice,
          range_text: s.range_text,
          effect: s.effect,
          visual_brief: s.visual_brief,
          order_index: s.order_index,
        });
      }
    }
    await (supabase as any).from("combat_enemy_skills").insert(skillRows);
  }

  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: ` añadió ${qty > 1 ? `${qty} ` : ""}${template.name}${qty > 1 ? "s" : ""} desde Bestiario.` },
  ]);
  return { ok: true as const };
}

/** Load the template (for tier/role/etc.) and its skill list — used by EnemyCombatSheetModal. */
export async function loadTemplate(templateId: string): Promise<EnemyTemplate | null> {
  const { data } = await (supabase as any)
    .from("enemy_templates").select("*").eq("id", templateId).maybeSingle();
  return (data as any) || null;
}
