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
  groupForCharacter,
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

export type SkillDistribution = "direct" | "defense" | "split" | "linkGroup";

export type ResolvePayload = {
  resolution: SkillResolution;
  amount?: number;
  applyDefense?: boolean;
  rollResult?: string;
  note?: string;
  durationRounds?: number;
  /** How the amount is applied across multiple targets. Defaults to "defense" for damage. */
  distribution?: SkillDistribution;
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

/**
 * Apply damage to a character: consume temporary shields first, then HP.
 * If applyDefense, subtract the character's total defense (from gear) before applying.
 */
async function applyDamageToCharacter(
  targetId: string,
  raw: number,
  applyDefense: boolean,
  encounterId: string,
): Promise<{ applied: number; def: number; absorbed: number } | null> {
  const [{ data: ch }, { data: its }, { data: shields }] = await Promise.all([
    supabase.from("characters").select("*").eq("id", targetId).maybeSingle(),
    supabase.from("items").select("*").eq("owner_character_id", targetId).eq("equipped", true),
    (supabase as any).from("combat_temporary_effects")
      .select("*")
      .eq("encounter_id", encounterId)
      .eq("target_character_id", targetId)
      .eq("effect_type", "shield")
      .order("created_at", { ascending: true }),
  ]);
  if (!ch) return null;
  const t = totals(ch as Character, (its || []) as Item[]);
  const def = applyDefense ? t.defense : 0;
  let remaining = Math.max(0, Math.floor(raw) - def);
  const totalRaw = remaining;
  let absorbed = 0;
  // Consume shields FIFO.
  for (const sh of (shields || []) as CombatTemporaryEffect[]) {
    if (remaining <= 0) break;
    const take = Math.min(sh.value || 0, remaining);
    if (take <= 0) continue;
    absorbed += take;
    remaining -= take;
    const next = (sh.value || 0) - take;
    if (next <= 0) {
      await (supabase as any).from("combat_temporary_effects").delete().eq("id", sh.id);
    } else {
      await (supabase as any).from("combat_temporary_effects").update({ value: next }).eq("id", sh.id);
    }
  }
  const cur = (ch as Character).current_hp;
  const newHp = Math.max(0, cur - remaining);
  await supabase.from("characters").update({ current_hp: newHp } as any).eq("id", targetId);
  return { applied: totalRaw, def, absorbed };
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

  const distribution: SkillDistribution = payload.distribution
    ?? (payload.applyDefense === false ? "direct" : "defense");

  // Helper: expand any enemy/ally target to its full link group (when distribution = linkGroup).
  function expandLinkGroup(list: SkillTarget[]): SkillTarget[] {
    if (distribution !== "linkGroup") return list;
    const seenEnemy = new Set<string>();
    const seenChar = new Set<string>();
    const out: SkillTarget[] = [];
    for (const tg of list) {
      if (tg.kind === "enemy") {
        const groupId = tg.participant.turn_group_id;
        if (groupId) {
          const mates = args.participants.filter(p => p.turn_group_id === groupId && isEnemy(p) && !p.is_defeated);
          for (const m of mates) {
            if (!seenEnemy.has(m.id)) { seenEnemy.add(m.id); out.push({ kind: "enemy", participant: m }); }
          }
        } else if (!seenEnemy.has(tg.participant.id)) {
          seenEnemy.add(tg.participant.id);
          out.push(tg);
        }
      } else if (tg.kind === "ally" || tg.kind === "self") {
        const link = groupForCharacter(args.participants, args.groups, tg.character.id);
        if (link) {
          for (const m of link.members) {
            if (m.character_id && !seenChar.has(m.character_id)) {
              seenChar.add(m.character_id);
              // We don't have the full Character object for link mates beyond source/allyChars;
              // we still apply the effect by character id. Use minimal Character-shaped object.
              const mate = m.character_id === tg.character.id
                ? tg.character
                : ({ id: m.character_id, name: m.display_name, color: m.color || tg.character.color } as Character);
              out.push({ kind: "ally", character: mate });
            }
          }
        } else if (!seenChar.has(tg.character.id)) {
          seenChar.add(tg.character.id);
          out.push(tg);
        }
      } else {
        out.push(tg);
      }
    }
    return out;
  }

  if (payload.resolution === "damage") {
    const expanded = expandLinkGroup(targets);
    const enemies = expanded.filter(t => t.kind === "enemy") as Extract<SkillTarget, { kind: "enemy" }>[];
    const allies = expanded.filter(t => t.kind === "ally" || t.kind === "self") as Extract<SkillTarget, { kind: "ally" | "self" }>[];
    if (enemies.length === 0 && allies.length === 0) return { ok: false, error: "no_enemy_target" as const };
    const bonus = (payload.linkBonus === 2 || payload.linkBonus === 3) ? payload.linkBonus : 0;
    const totalRaw = Math.max(0, Math.floor(payload.amount || 0)) + bonus;
    const totalTargets = enemies.length + allies.length;
    const applyDefense = distribution !== "direct";
    const perTarget = distribution === "split"
      ? Math.floor(totalRaw / Math.max(1, totalTargets))
      : totalRaw;
    const remainder = distribution === "split"
      ? totalRaw - perTarget * totalTargets
      : 0;
    let leftover = remainder;
    for (const tg of enemies) {
      const raw = perTarget + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover--;
      const r = await applyDamageToEnemy(tg.participant, raw, applyDefense);
      damageDetail.push({ raw, applied: r.applied, def: r.def, targetName: tg.participant.display_name });
      targetNames.push(tg.participant.display_name);
      if (r.defeated) defeatedNames.push(tg.participant.display_name);
    }
    for (const tg of allies) {
      const raw = perTarget + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover--;
      const r = await applyDamageToCharacter(tg.character.id, raw, applyDefense, encounter.id);
      if (r) {
        damageDetail.push({ raw, applied: r.applied, def: r.def, targetName: tg.character.name });
        targetNames.push(tg.character.name);
      }
    }
  } else if (payload.resolution === "heal") {
    const expanded = expandLinkGroup(targets);
    const allies = expanded.filter(t => t.kind === "ally" || t.kind === "self") as Extract<SkillTarget, { kind: "ally" | "self" }>[];
    if (allies.length === 0) return { ok: false, error: "no_ally_target" as const };
    const totalAmt = Math.max(0, Math.floor(payload.amount || 0));
    const per = distribution === "split" ? Math.floor(totalAmt / Math.max(1, allies.length)) : totalAmt;
    const rem0 = distribution === "split" ? totalAmt - per * allies.length : 0;
    let leftover = rem0;
    for (const tg of allies) {
      const amt = per + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover--;
      const r = await applyHealToCharacter(tg.character.id, amt);
      if (r) {
        healDetail.push({ amount: r.applied, targetName: tg.character.name });
        targetNames.push(tg.character.name);
      }
    }
  } else if (payload.resolution === "shield") {
    const expanded = expandLinkGroup(targets);
    const allies = expanded.filter(t => t.kind === "ally" || t.kind === "self") as Extract<SkillTarget, { kind: "ally" | "self" }>[];
    if (allies.length === 0) return { ok: false, error: "no_ally_target" as const };
    const totalAmt = Math.max(0, Math.floor(payload.amount || 0));
    const per = distribution === "split" ? Math.floor(totalAmt / Math.max(1, allies.length)) : totalAmt;
    const rem0 = distribution === "split" ? totalAmt - per * allies.length : 0;
    let leftover = rem0;
    for (const tg of allies) {
      const amt = per + (leftover > 0 ? 1 : 0);
      if (leftover > 0) leftover--;
      await createShield({
        encounter,
        source,
        sourceSkillId: skill.id,
        targetCharacterId: tg.character.id,
        targetEnemyParticipantId: null,
        value: amt,
        label: skill.name,
        durationRounds: payload.durationRounds,
      });
      shieldDetail.push({ amount: amt, targetName: tg.character.name });
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

/**
 * Tick an effect applied to an enemy: apply per-turn damage (bypassing defense),
 * push a log entry, then decrement / remove the effect.
 * Damage = effect.value when > 0.
 */
export async function tickEnemyEffect(effectId: string): Promise<void> {
  const { data: eff } = await (supabase as any)
    .from("combat_temporary_effects")
    .select("*")
    .eq("id", effectId)
    .maybeSingle();
  if (!eff) return;
  const fx = eff as CombatTemporaryEffect;
  const dmg = Math.max(0, Math.floor(fx.value || 0));
  let appliedDmg = 0;
  let participantName = "";
  let defeated = false;


  if (fx.target_enemy_participant_id) {
    const { data: p } = await (supabase as any)
      .from("combat_participants")
      .select("*")
      .eq("id", fx.target_enemy_participant_id)
      .maybeSingle();
    if (p) {
      const part = p as CombatParticipant;
      participantName = (part as any).enemy_name || part.display_name || "";
      if (dmg > 0 && !part.is_defeated) {
        const max = part.enemy_max_hp || 1;
        const newHp = Math.max(0, Math.min(max, (part.enemy_hp || 0) - dmg));
        appliedDmg = (part.enemy_hp || 0) - newHp;
        defeated = newHp <= 0;
        await (supabase as any).from("combat_participants")
          .update({ enemy_hp: newHp, is_defeated: defeated })
          .eq("id", part.id);
      }
    }
  }

  if (fx.campaign_id) {
    const label = fx.label || fx.effect_type || "";
    const segs: any[] = [];
    if (participantName) {
      segs.push({ t: "text", v: participantName + " " });
    }
    if (appliedDmg > 0) {
      segs.push({ t: "text", v: `${label} → ` });
      segs.push({ t: "loss", v: `-${appliedDmg} HP` });
      if (defeated) segs.push({ t: "text", v: " ☠️" });
    } else {
      segs.push({ t: "text", v: `${label} −1t` });
    }
    if (segs.length > 0) {
      await pushLog(fx.campaign_id, segs as any);
    }
  }

  const cur = typeof fx.duration_rounds === "number" ? fx.duration_rounds : 0;
  const next = cur - 1;
  if (next <= 0) {
    await (supabase as any).from("combat_temporary_effects").delete().eq("id", effectId);
  } else {
    await (supabase as any).from("combat_temporary_effects").update({ duration_rounds: next }).eq("id", effectId);
  }
}

/**
 * Tick ALL temporary effects attached to a given enemy participant.
 * Used by the centralized end-of-turn flow when the active block is an enemy
 * (or an enemy turn pin). Each effect applies its per-turn damage, then has
 * its duration reduced by 1 (expiring at 0). Safe to call when there are
 * no effects (no-op).
 */
export async function tickEnemyTurnEnd(participantId: string): Promise<void> {
  const { data } = await (supabase as any)
    .from("combat_temporary_effects")
    .select("id")
    .eq("target_enemy_participant_id", participantId);
  for (const row of (data || []) as Array<{ id: string }>) {
    await tickEnemyEffect(row.id);
  }
}

// ─────────────────────── DOT / turn-end tick (Phase 6) ───────────────────────

/**
 * Apply persistent damage (DOT) to a character.
 * Bypasses defense; consumes temporary shields FIFO before HP.
 * Returns the resolved breakdown.
 */
export async function applyDotToCharacter(
  characterId: string,
  amount: number,
  encounterId: string,
): Promise<{ absorbed: number; applied: number; defeated: boolean } | null> {
  const raw = Math.max(0, Math.floor(amount));
  if (raw <= 0) return { absorbed: 0, applied: 0, defeated: false };

  const [{ data: ch }, { data: shields }] = await Promise.all([
    supabase.from("characters").select("*").eq("id", characterId).maybeSingle(),
    (supabase as any)
      .from("combat_temporary_effects")
      .select("*")
      .eq("encounter_id", encounterId)
      .eq("target_character_id", characterId)
      .eq("effect_type", "shield")
      .order("created_at", { ascending: true }),
  ]);
  if (!ch) return null;

  let remaining = raw;
  let absorbed = 0;
  for (const sh of (shields || []) as CombatTemporaryEffect[]) {
    if (remaining <= 0) break;
    const take = Math.min(sh.value || 0, remaining);
    if (take <= 0) continue;
    absorbed += take;
    remaining -= take;
    const next = (sh.value || 0) - take;
    if (next <= 0) {
      await (supabase as any).from("combat_temporary_effects").delete().eq("id", sh.id);
    } else {
      await (supabase as any).from("combat_temporary_effects").update({ value: next }).eq("id", sh.id);
    }
  }

  const cur = (ch as Character).current_hp;
  const newHp = Math.max(0, cur - remaining);
  const applied = cur - newHp;
  await supabase.from("characters").update({ current_hp: newHp } as any).eq("id", characterId);
  return { absorbed, applied, defeated: newHp <= 0 };
}

function tplOne(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

/**
 * Tick all condition effects owned by a single character when their turn ends.
 *  - character_conditions (legacy): apply damage_per_turn (with shields), decrement turns_left.
 *  - combat_temporary_effects: shields/notes only decrement duration; debuff/control with value>0 deal DOT.
 *  - Buff with value>0 (e.g. flat shield) only decrements duration.
 *  - Effects with no duration just sit there untouched (defensive; nothing to tick).
 */
export async function tickPlayerTurnEnd(args: {
  characterId: string;
  campaignId: string;
  encounterId: string;
  i18n: {
    damaged: string;        // "{effect} hizo {amount} de daño a {target}."
    shieldAbsorbed: string; // "Escudo absorbió {absorbed}. {target} recibió {applied} de daño."
    expired: string;        // "{effect} expiró sobre {target}."
  };
}): Promise<void> {
  const { characterId, campaignId, encounterId, i18n } = args;

  // Character name for logs.
  const { data: chRow } = await supabase
    .from("characters")
    .select("name,color,id")
    .eq("id", characterId)
    .maybeSingle();
  const charName = (chRow as any)?.name || "";
  const charColor = (chRow as any)?.color || undefined;

  // 1) Legacy character_conditions
  const { data: condRows } = await (supabase as any)
    .from("character_conditions")
    .select("*")
    .eq("character_id", characterId);
  for (const c of (condRows || []) as Array<{
    id: string; label: string; icon: string; turns_left: number; damage_per_turn: number;
  }>) {
    const label = `${c.icon || ""} ${c.label || ""}`.trim();
    const dmg = Math.max(0, Math.floor(c.damage_per_turn || 0));
    if (dmg > 0) {
      const r = await applyDotToCharacter(characterId, dmg, encounterId);
      if (r) {
        const segs: any[] =
          r.absorbed > 0 && r.applied > 0
            ? [{ t: "text", v: tplOne(i18n.shieldAbsorbed, { absorbed: r.absorbed, target: charName, applied: r.applied }) }]
            : r.absorbed > 0 && r.applied === 0
              ? [{ t: "text", v: tplOne(i18n.shieldAbsorbed, { absorbed: r.absorbed, target: charName, applied: 0 }) }]
              : [
                  { t: "char", v: charName, color: charColor, id: characterId },
                  { t: "text", v: " " },
                  { t: "text", v: tplOne(i18n.damaged, { effect: label, amount: r.applied, target: charName }) },
                ];
        await pushLog(campaignId, segs as any);
      }
    }
    const next = (c.turns_left || 0) - 1;
    if (next <= 0) {
      await (supabase as any).from("character_conditions").delete().eq("id", c.id);
      await pushLog(campaignId, [
        { t: "text", v: tplOne(i18n.expired, { effect: label, target: charName }) },
      ] as any);
    } else {
      await (supabase as any).from("character_conditions").update({ turns_left: next }).eq("id", c.id);
    }
  }

  // 2) combat_temporary_effects (skip shields/notes for damage; tick duration on debuff/control/buff)
  const { data: tmpRows } = await (supabase as any)
    .from("combat_temporary_effects")
    .select("*")
    .eq("encounter_id", encounterId)
    .eq("target_character_id", characterId);
  for (const e of (tmpRows || []) as CombatTemporaryEffect[]) {
    const type = (e.effect_type || "").toLowerCase();
    if (type === "shield" || type === "note") {
      // Don't damage. Don't auto-decrement either (shields keep their own lifecycle).
      continue;
    }
    const dmg = Math.max(0, Math.floor(e.value || 0));
    const label = (e.label || type).trim();
    if (dmg > 0 && (type === "debuff" || type === "control")) {
      const r = await applyDotToCharacter(characterId, dmg, encounterId);
      if (r) {
        const segs: any[] =
          r.absorbed > 0
            ? [{ t: "text", v: tplOne(i18n.shieldAbsorbed, { absorbed: r.absorbed, target: charName, applied: r.applied }) }]
            : [
                { t: "char", v: charName, color: charColor, id: characterId },
                { t: "text", v: " " },
                { t: "text", v: tplOne(i18n.damaged, { effect: label, amount: r.applied, target: charName }) },
              ];
        await pushLog(campaignId, segs as any);
      }
    }
    // Decrement duration if it has one.
    if (typeof e.duration_rounds === "number") {
      const next = (e.duration_rounds || 0) - 1;
      if (next <= 0) {
        await (supabase as any).from("combat_temporary_effects").delete().eq("id", e.id);
      } else {
        await (supabase as any).from("combat_temporary_effects").update({ duration_rounds: next }).eq("id", e.id);
      }
    }
  }
}


// ─────────────────────── DM-driven effect application ───────────────────────

export type DMEffectKind = "shield" | "buff" | "debuff" | "control" | "note";

export type DMEffectTarget = {
  characterId?: string | null;
  enemyParticipantId?: string | null;
  displayName: string;
  color?: string | null;
};

/**
 * DM applies a buff / debuff / shield / control / note to one or more
 * participants. Inserts one row per target into combat_temporary_effects
 * and writes a single log entry summarizing the action.
 */
export async function dmApplyEffectsToTargets(args: {
  encounter: CombatEncounter;
  dm: { id: string; name: string; color: string };
  kind: DMEffectKind;
  label: string;
  emoji: string;
  value: number;
  durationRounds: number | null;
  targets: DMEffectTarget[];
}): Promise<{ ok: boolean }> {
  const { encounter, dm, kind, label, emoji, value, durationRounds, targets } = args;
  if (!targets.length) return { ok: false };

  const safeValue = Math.max(0, Math.floor(value || 0));
  const safeDuration = durationRounds && durationRounds > 0 ? Math.floor(durationRounds) : null;
  const composedLabel = `${emoji ? emoji + " " : ""}${label || ""}`.trim() || emoji || label || kind;

  const rows = targets.map(target => ({
    encounter_id: encounter.id,
    campaign_id: encounter.campaign_id,
    target_character_id: target.characterId || null,
    target_enemy_participant_id: target.enemyParticipantId || null,
    source_character_id: dm.id,
    source_skill_id: null,
    effect_type: kind,
    value: kind === "note" ? 0 : safeValue,
    label: composedLabel,
    duration_rounds: safeDuration,
  }));

  const { error } = await (supabase as any).from("combat_temporary_effects").insert(rows);
  if (error) return { ok: false };

  const targetNames = targets.map(t => t.displayName).join(", ");
  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    {
      t: "text",
      v: ` aplicó ${composedLabel}${kind !== "note" && safeValue > 0 ? ` (${kind === "shield" ? "+" : ""}${safeValue})` : ""}${safeDuration ? ` por ${safeDuration}t` : ""} a ${targetNames}.`,
    },
  ] as any);

  return { ok: true };
}




