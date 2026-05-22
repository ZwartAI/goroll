// Phase 5 — Player skills inside combat.
//
// - Lazy-creates per-encounter usage rows the first time a skill is used.
// - Validates turn ownership, white-once-per-turn, remaining uses.
// - Applies damage / heal / shield / narrative and writes log segments.
// - Never mutates `character_skills.is_unlocked` (permanent unlock).

import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import {
  activeBlock,
  blockContainsCharacter,
  buildOrderedTurns,
  isEnemy,
  type CombatEncounter,
  type CombatParticipant,
  type CombatTurnGroup,
} from "@/lib/combat";
import type { Character, Item, Rarity } from "@/lib/game";
import { totals } from "@/lib/game";

export type CombatSkillUse = {
  id: string;
  encounter_id: string;
  campaign_id: string;
  character_id: string;
  character_skill_id: string;
  rarity: Rarity;
  max_uses: number | null;
  uses_remaining: number | null;
  used_this_turn: boolean;
  last_turn_index: number | null;
  created_at: string;
  updated_at: string;
};

export type CombatTemporaryEffect = {
  id: string;
  encounter_id: string;
  campaign_id: string;
  target_character_id: string | null;
  target_enemy_participant_id: string | null;
  source_character_id: string | null;
  source_skill_id: string | null;
  effect_type: "shield" | "buff" | "debuff" | "control" | "note";
  value: number;
  label: string | null;
  duration_rounds: number | null;
  expires_at_turn_index: number | null;
  created_at: string;
};

export const RARITY_MAX_USES: Record<Rarity, number | null> = {
  white: null, // infinite (limited by 1-per-turn rule)
  blue: 3,
  purple: 2,
  gold: 1,
};

export type SkillResolution = "log" | "damage" | "heal" | "shield" | "narrative";

export type ResolvePayload = {
  resolution: SkillResolution;
  amount?: number;
  applyDefense?: boolean;
  rollResult?: string;
  note?: string;
  durationRounds?: number;
  /** Link synergy bonus added to damage amount. 0, 2 or 3. */
  linkBonus?: 0 | 2 | 3;
  /** Names of link members credited with the synergy (for the log). */
  linkBonusMembers?: string[];
  /** Required short justification when linkBonus > 0. */
  linkBonusJustification?: string;
};

// ───────────────────────── Validation ─────────────────────────

export type TurnState = { isYourTurn: boolean; reason?: "ended" | "not_active" | "not_yours" };

export function computeTurnState(
  encounter: CombatEncounter | null,
  participants: CombatParticipant[],
  groups: CombatTurnGroup[],
  characterId: string | null,
): TurnState {
  if (!encounter || !characterId) return { isYourTurn: false, reason: "not_active" };
  if (encounter.status === "ended") return { isYourTurn: false, reason: "ended" };
  if (encounter.status !== "active") return { isYourTurn: false, reason: "not_active" };
  const blocks = buildOrderedTurns(participants, groups);
  const block = activeBlock(encounter, blocks);
  if (!block) return { isYourTurn: false, reason: "not_active" };
  return blockContainsCharacter(block, characterId)
    ? { isYourTurn: true }
    : { isYourTurn: false, reason: "not_yours" };
}

// ─────────────────────── Use record (lazy) ───────────────────────

export async function listSkillUses(encounterId: string, characterId: string): Promise<CombatSkillUse[]> {
  const { data } = await (supabase as any)
    .from("combat_skill_uses")
    .select("*")
    .eq("encounter_id", encounterId)
    .eq("character_id", characterId);
  return (data as any) || [];
}

export async function getOrCreateUseRecord(
  encounter: CombatEncounter,
  characterId: string,
  characterSkillId: string,
  rarity: Rarity,
): Promise<CombatSkillUse | null> {
  // Try to find existing row.
  const { data: existing } = await (supabase as any)
    .from("combat_skill_uses")
    .select("*")
    .eq("encounter_id", encounter.id)
    .eq("character_skill_id", characterSkillId)
    .maybeSingle();
  if (existing) return existing as CombatSkillUse;

  const max = RARITY_MAX_USES[rarity];
  const row = {
    encounter_id: encounter.id,
    campaign_id: encounter.campaign_id,
    character_id: characterId,
    character_skill_id: characterSkillId,
    rarity,
    max_uses: max,
    uses_remaining: max,
    used_this_turn: false,
    last_turn_index: encounter.current_turn_index,
  };
  const { data, error } = await (supabase as any)
    .from("combat_skill_uses")
    .insert(row)
    .select("*")
    .single();
  if (error) return null;
  return data as CombatSkillUse;
}

export type CanUseResult =
  | { ok: true }
  | { ok: false; reason: "not_unlocked" | "no_uses" | "white_used_this_turn" | "not_active" | "not_your_turn" };

export function canUseSkill(args: {
  encounter: CombatEncounter | null;
  turnState: TurnState;
  isUnlocked: boolean;
  rarity: Rarity;
  use: CombatSkillUse | null;
  uses: CombatSkillUse[];
}): CanUseResult {
  const { turnState, isUnlocked, rarity, use, uses } = args;
  if (!isUnlocked) return { ok: false, reason: "not_unlocked" };
  if (!turnState.isYourTurn) {
    return { ok: false, reason: turnState.reason === "ended" ? "not_active" : "not_your_turn" };
  }
  if (rarity === "white") {
    // already used a white this turn?
    if (uses.some(u => u.rarity === "white" && u.used_this_turn)) {
      return { ok: false, reason: "white_used_this_turn" };
    }
    return { ok: true };
  }
  if (use && use.uses_remaining !== null && use.uses_remaining <= 0) {
    return { ok: false, reason: "no_uses" };
  }
  return { ok: true };
}

// ─────────────────────── Apply effects ───────────────────────

async function applyDamageToEnemy(
  participant: CombatParticipant,
  raw: number,
  applyDefense: boolean,
): Promise<{ applied: number; defeated: boolean; def: number }> {
  const def = participant.enemy_defense || 0;
  const applied = Math.max(0, Math.floor(raw) - (applyDefense ? def : 0));
  const max = participant.enemy_max_hp || 1;
  const newHp = Math.max(0, Math.min(max, (participant.enemy_hp || 0) - applied));
  const defeated = newHp <= 0;
  await (supabase as any).from("combat_participants")
    .update({ enemy_hp: newHp, is_defeated: defeated })
    .eq("id", participant.id);
  return { applied, defeated: defeated && !participant.is_defeated, def };
}

async function applyHealToCharacter(targetId: string, amount: number): Promise<{ applied: number; newHp: number; max: number } | null> {
  const [{ data: ch }, { data: its }] = await Promise.all([
    supabase.from("characters").select("*").eq("id", targetId).maybeSingle(),
    supabase.from("items").select("*").eq("owner_character_id", targetId).eq("equipped", true),
  ]);
  if (!ch) return null;
  const max = totals(ch as Character, (its || []) as Item[]).maxHp;
  const cur = (ch as Character).current_hp;
  const newHp = Math.max(0, Math.min(max, cur + Math.max(0, Math.floor(amount))));
  const applied = newHp - cur;
  await supabase.from("characters").update({ current_hp: newHp } as any).eq("id", targetId);
  return { applied, newHp, max };
}

async function createShield(args: {
  encounter: CombatEncounter;
  source: Character;
  sourceSkillId: string | null;
  targetCharacterId: string | null;
  targetEnemyParticipantId: string | null;
  value: number;
  label: string | null;
  durationRounds?: number;
}) {
  await (supabase as any).from("combat_temporary_effects").insert({
    encounter_id: args.encounter.id,
    campaign_id: args.encounter.campaign_id,
    target_character_id: args.targetCharacterId,
    target_enemy_participant_id: args.targetEnemyParticipantId,
    source_character_id: args.source.id,
    source_skill_id: args.sourceSkillId,
    effect_type: "shield",
    value: Math.max(0, Math.floor(args.value)),
    label: args.label,
    duration_rounds: args.durationRounds ?? null,
  });
}

async function createNarrativeEffect(args: {
  encounter: CombatEncounter;
  source: Character;
  sourceSkillId: string | null;
  targetCharacterId: string | null;
  targetEnemyParticipantId: string | null;
  label: string;
  durationRounds?: number;
}) {
  await (supabase as any).from("combat_temporary_effects").insert({
    encounter_id: args.encounter.id,
    campaign_id: args.encounter.campaign_id,
    target_character_id: args.targetCharacterId,
    target_enemy_participant_id: args.targetEnemyParticipantId,
    source_character_id: args.source.id,
    source_skill_id: args.sourceSkillId,
    effect_type: "note",
    value: 0,
    label: args.label,
    duration_rounds: args.durationRounds ?? null,
  });
}

// ─────────────────────── Top-level: useSkill ───────────────────────

export type SkillSummary = {
  id: string;
  name: string;
  rarity: Rarity;
  type: string | null;
  dice: string | null;
  range_targets: string | null;
  effect: string | null;
  visual_brief: string | null;
  icon_key: string | null;
};

export type SkillTarget =
  | { kind: "enemy"; participant: CombatParticipant }
  | { kind: "ally"; character: Character }
  | { kind: "self"; character: Character }
  | { kind: "none" };

export async function useSkill(args: {
  encounter: CombatEncounter;
  participants: CombatParticipant[];
  groups: CombatTurnGroup[];
  source: Character;
  skill: SkillSummary;
  targets: SkillTarget[];
  payload: ResolvePayload;
}) {
  const { encounter, source, skill, targets, payload } = args;

  // Re-validate turn ownership server-side via the data we got.
  const turn = computeTurnState(encounter, args.participants, args.groups, source.id);
  if (!turn.isYourTurn) return { ok: false, error: "not_your_turn" as const };

  // Lazy create / fetch use record + sibling uses.
  const [use, allUses] = await Promise.all([
    getOrCreateUseRecord(encounter, source.id, skill.id, skill.rarity),
    listSkillUses(encounter.id, source.id),
  ]);
  const can = canUseSkill({
    encounter,
    turnState: turn,
    isUnlocked: true,
    rarity: skill.rarity,
    use,
    uses: allUses,
  });
  if (!can.ok) return { ok: false, error: can.reason };

  // Apply effect.
  const targetNames: string[] = [];
  let damageDetail: { raw: number; applied: number; def: number; targetName: string }[] = [];
  let healDetail: { amount: number; targetName: string }[] = [];
  let shieldDetail: { amount: number; targetName: string }[] = [];
  let defeatedNames: string[] = [];

  if (payload.resolution === "damage") {
    const enemies = targets.filter(t => t.kind === "enemy") as Extract<SkillTarget, { kind: "enemy" }>[];
    if (enemies.length === 0) return { ok: false, error: "no_enemy_target" as const };
    const bonus = (payload.linkBonus === 2 || payload.linkBonus === 3) ? payload.linkBonus : 0;
    const raw = Math.max(0, Math.floor(payload.amount || 0)) + bonus;
    for (const tg of enemies) {
      const r = await applyDamageToEnemy(tg.participant, raw, !!payload.applyDefense);
      damageDetail.push({ raw, applied: r.applied, def: r.def, targetName: tg.participant.display_name });
      targetNames.push(tg.participant.display_name);
      if (r.defeated) defeatedNames.push(tg.participant.display_name);
    }
  } else if (payload.resolution === "heal") {
    const allies = targets.filter(t => t.kind === "ally" || t.kind === "self") as Extract<SkillTarget, { kind: "ally" | "self" }>[];
    if (allies.length === 0) return { ok: false, error: "no_ally_target" as const };
    const amount = Math.max(0, Math.floor(payload.amount || 0));
    for (const tg of allies) {
      const r = await applyHealToCharacter(tg.character.id, amount);
      if (r) {
        healDetail.push({ amount: r.applied, targetName: tg.character.name });
        targetNames.push(tg.character.name);
      }
    }
  } else if (payload.resolution === "shield") {
    const allies = targets.filter(t => t.kind === "ally" || t.kind === "self") as Extract<SkillTarget, { kind: "ally" | "self" }>[];
    if (allies.length === 0) return { ok: false, error: "no_ally_target" as const };
    const amount = Math.max(0, Math.floor(payload.amount || 0));
    for (const tg of allies) {
      await createShield({
        encounter,
        source,
        sourceSkillId: skill.id,
        targetCharacterId: tg.character.id,
        targetEnemyParticipantId: null,
        value: amount,
        label: skill.name,
        durationRounds: payload.durationRounds,
      });
      shieldDetail.push({ amount, targetName: tg.character.name });
      targetNames.push(tg.character.name);
    }
  } else if (payload.resolution === "narrative") {
    for (const tg of targets) {
      if (tg.kind === "enemy") {
        await createNarrativeEffect({
          encounter, source, sourceSkillId: skill.id,
          targetCharacterId: null,
          targetEnemyParticipantId: tg.participant.id,
          label: payload.note || skill.name,
          durationRounds: payload.durationRounds,
        });
        targetNames.push(tg.participant.display_name);
      } else if (tg.kind === "ally" || tg.kind === "self") {
        await createNarrativeEffect({
          encounter, source, sourceSkillId: skill.id,
          targetCharacterId: tg.character.id,
          targetEnemyParticipantId: null,
          label: payload.note || skill.name,
          durationRounds: payload.durationRounds,
        });
        targetNames.push(tg.character.name);
      }
    }
  } else {
    // log only — still record target names if any
    for (const tg of targets) {
      if (tg.kind === "enemy") targetNames.push(tg.participant.display_name);
      else if (tg.kind === "ally" || tg.kind === "self") targetNames.push(tg.character.name);
    }
  }

  // Decrement use.
  if (use) {
    const patch: any = { used_this_turn: true, last_turn_index: encounter.current_turn_index };
    if (skill.rarity !== "white" && use.uses_remaining !== null) {
      patch.uses_remaining = Math.max(0, use.uses_remaining - 1);
    }
    await (supabase as any).from("combat_skill_uses").update(patch).eq("id", use.id);
  }

  // Log segment.
  await pushLog(encounter.campaign_id, [
    {
      t: "player_skill" as any,
      v: {
        charId: source.id,
        charName: source.name,
        charColor: source.color,
        charImage: source.image_url || null,
        skillName: skill.name,
        rarity: skill.rarity,
        type: skill.type,
        dice: skill.dice,
        rangeTargets: skill.range_targets,
        effect: skill.effect,
        visualBrief: skill.visual_brief,
        rollResult: payload.rollResult || null,
        resolution: payload.resolution,
        targetNames,
        damage: damageDetail,
        heal: healDetail,
        shield: shieldDetail,
        defeated: defeatedNames,
        note: payload.note || null,
      },
    } as any,
  ]);

  // Optional synergy log right after the skill log.
  if ((payload.linkBonus === 2 || payload.linkBonus === 3) && (payload.linkBonusMembers?.length ?? 0) > 0) {
    const memberList = (payload.linkBonusMembers || []).join(", ");
    const just = (payload.linkBonusJustification || "").trim();
    await pushLog(encounter.campaign_id, [
      { t: "char", v: source.name, color: source.color, id: source.id },
      { t: "text", v: ` activó sinergia de Enlace (+${payload.linkBonus}) con ${memberList}${just ? `. Justificación: ${just}` : ""}.` },
    ]);
  }

  return { ok: true as const };
}

// Reset used_this_turn flags for an encounter (used when turn advances).
export async function resetUsedThisTurn(encounterId: string) {
  await (supabase as any)
    .from("combat_skill_uses")
    .update({ used_this_turn: false })
    .eq("encounter_id", encounterId)
    .eq("used_this_turn", true);
}

// Clear all encounter skill state (used on endCombat — optional cleanup).
export async function clearEncounterSkillState(encounterId: string) {
  await (supabase as any).from("combat_skill_uses").delete().eq("encounter_id", encounterId);
  await (supabase as any).from("combat_temporary_effects").delete().eq("encounter_id", encounterId);
}

// ─────────────────────── Shields helper ───────────────────────

export async function listShieldsForEncounter(encounterId: string): Promise<CombatTemporaryEffect[]> {
  const { data } = await (supabase as any)
    .from("combat_temporary_effects")
    .select("*")
    .eq("encounter_id", encounterId)
    .eq("effect_type", "shield");
  return (data as any) || [];
}

export function totalShieldForCharacter(effects: CombatTemporaryEffect[], characterId: string): number {
  return effects
    .filter(e => e.effect_type === "shield" && e.target_character_id === characterId)
    .reduce((acc, e) => acc + Math.max(0, e.value || 0), 0);
}

export async function reduceShield(effectId: string, amount: number) {
  const { data } = await (supabase as any).from("combat_temporary_effects").select("*").eq("id", effectId).maybeSingle();
  if (!data) return;
  const next = Math.max(0, (data.value || 0) - Math.max(0, amount));
  if (next <= 0) {
    await (supabase as any).from("combat_temporary_effects").delete().eq("id", effectId);
  } else {
    await (supabase as any).from("combat_temporary_effects").update({ value: next }).eq("id", effectId);
  }
}

export async function removeEffect(effectId: string) {
  await (supabase as any).from("combat_temporary_effects").delete().eq("id", effectId);
}

// ─────────────────────── Per-target effects (Phase 1) ───────────────────────

export async function listEffectsForEnemy(participantId: string): Promise<CombatTemporaryEffect[]> {
  const { data } = await (supabase as any)
    .from("combat_temporary_effects")
    .select("*")
    .eq("target_enemy_participant_id", participantId)
    .order("created_at", { ascending: true });
  return (data as any) || [];
}

export async function listEffectsForCharacter(characterId: string): Promise<CombatTemporaryEffect[]> {
  const { data } = await (supabase as any)
    .from("combat_temporary_effects")
    .select("*")
    .eq("target_character_id", characterId)
    .order("created_at", { ascending: true });
  return (data as any) || [];
}

/**
 * Decrement an effect's remaining duration by 1.
 * If duration reaches 0 (or is already null/0), the effect is deleted.
 */
export async function decrementEffectDuration(effectId: string) {
  const { data } = await (supabase as any)
    .from("combat_temporary_effects")
    .select("duration_rounds")
    .eq("id", effectId)
    .maybeSingle();
  if (!data) return;
  const cur = typeof data.duration_rounds === "number" ? data.duration_rounds : 0;
  const next = cur - 1;
  if (next <= 0) {
    await (supabase as any).from("combat_temporary_effects").delete().eq("id", effectId);
  } else {
    await (supabase as any).from("combat_temporary_effects").update({ duration_rounds: next }).eq("id", effectId);
  }
}

