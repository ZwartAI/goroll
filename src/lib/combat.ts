// Combat / Initiative system — Phase 1 (players only).
//
// All actions go through this module so logs + validations stay consistent.
// The DB schema is permissive (RLS public_all) so client-side guards matter.

import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import type { Character } from "@/lib/game";
import { resetUsedThisTurn, clearEncounterSkillState } from "@/lib/combat-skills";

export type EncounterStatus = "collecting" | "active" | "ended";

export type CombatEncounter = {
  id: string;
  campaign_id: string;
  status: EncounterStatus;
  requested_by_character_id: string | null;
  current_turn_index: number;
  round_number: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
};

export type CombatTurnGroup = {
  id: string;
  encounter_id: string;
  campaign_id: string;
  leader_character_id: string;
  name: string | null;
  color: string | null;
  group_initiative: number;
  created_at: string;
};

export type CombatParticipant = {
  id: string;
  encounter_id: string;
  campaign_id: string;
  character_id: string | null;
  participant_type: "player" | "enemy";
  display_name: string;
  image_url: string | null;
  color: string | null;
  initiative: number;
  turn_group_id: string | null;
  is_leader: boolean;
  order_index: number;
  has_ended_turn: boolean;
  created_at: string;
  // Enemy fields (null for players)
  enemy_name: string | null;
  enemy_icon: string | null;
  enemy_color: string | null;
  enemy_hp: number | null;
  enemy_max_hp: number | null;
  enemy_defense: number | null;
  enemy_speed: string | null;
  enemy_notes: string | null;
  enemy_instance_number: number | null;
  enemy_template_id: string | null;
  is_enemy_visible: boolean;
  is_defeated: boolean;
};

export function isEnemy(p: CombatParticipant): boolean {
  return p.participant_type === "enemy";
}


export type TurnBlock =
  | { kind: "solo"; key: string; initiative: number; participant: CombatParticipant }
  | { kind: "group"; key: string; initiative: number; group: CombatTurnGroup; members: CombatParticipant[] };

/** Build the ordered turn blocks (high → low initiative). */
export function buildOrderedTurns(
  participants: CombatParticipant[],
  groups: CombatTurnGroup[],
): TurnBlock[] {
  const groupById = new Map(groups.map(g => [g.id, g]));
  const byGroup = new Map<string, CombatParticipant[]>();
  const solos: CombatParticipant[] = [];
  for (const p of participants) {
    if (p.turn_group_id && groupById.has(p.turn_group_id)) {
      const arr = byGroup.get(p.turn_group_id) || [];
      arr.push(p);
      byGroup.set(p.turn_group_id, arr);
    } else {
      solos.push(p);
    }
  }
  const blocks: TurnBlock[] = [];
  for (const s of solos) {
    blocks.push({ kind: "solo", key: `s:${s.id}`, initiative: s.initiative, participant: s });
  }
  for (const [gid, members] of byGroup) {
    const g = groupById.get(gid)!;
    members.sort((a, b) => (b.is_leader ? 1 : 0) - (a.is_leader ? 1 : 0) || a.created_at.localeCompare(b.created_at));
    blocks.push({ kind: "group", key: `g:${gid}`, initiative: g.group_initiative, group: g, members });
  }
  blocks.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    const ao = a.kind === "solo" ? a.participant.order_index : Math.min(...a.members.map(m => m.order_index));
    const bo = b.kind === "solo" ? b.participant.order_index : Math.min(...b.members.map(m => m.order_index));
    if (ao !== bo) return ao - bo;
    const ak = a.kind === "solo" ? a.participant.created_at : a.group.created_at;
    const bk = b.kind === "solo" ? b.participant.created_at : b.group.created_at;
    return ak.localeCompare(bk);
  });
  return blocks;
}


export function activeBlock(encounter: CombatEncounter | null, blocks: TurnBlock[]): TurnBlock | null {
  if (!encounter || encounter.status !== "active" || blocks.length === 0) return null;
  const idx = ((encounter.current_turn_index % blocks.length) + blocks.length) % blocks.length;
  return blocks[idx];
}

export function blockContainsCharacter(block: TurnBlock | null, characterId: string): boolean {
  if (!block) return false;
  if (block.kind === "solo") return block.participant.character_id === characterId;
  return block.members.some(m => m.character_id === characterId);
}

export function participantForCharacter(
  participants: CombatParticipant[],
  characterId: string,
): CombatParticipant | null {
  return participants.find(p => p.character_id === characterId) || null;
}

export function clampInitiative(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(1, Math.min(20, Math.floor(n)));
}

// ─────────────────────────── DM actions ────────────────────────────

export async function requestInitiative(campaignId: string, dm: { id: string; name: string; color: string }) {
  // Make sure there is no live encounter (just in case the unique index races).
  const { data: existing } = await supabase
    .from("combat_encounters" as any)
    .select("id,status")
    .eq("campaign_id", campaignId)
    .neq("status", "ended")
    .limit(1);
  if (existing && existing.length) return { ok: false, error: "encounter_exists" as const };

  const { data, error } = await supabase
    .from("combat_encounters" as any)
    .insert({
      campaign_id: campaignId,
      status: "collecting",
      requested_by_character_id: dm.id,
      current_turn_index: 0,
    })
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  await pushLog(campaignId, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: " pidió iniciativa." },
  ]);
  return { ok: true, encounter: data as unknown as CombatEncounter };
}

export async function cancelInitiative(encounter: CombatEncounter, dm: { id: string; name: string; color: string }) {
  const { error } = await supabase
    .from("combat_encounters" as any)
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", encounter.id);
  if (error) return { ok: false, error: error.message };
  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: " canceló la iniciativa." },
  ]);
  return { ok: true };
}

export async function startCombat(
  encounter: CombatEncounter,
  participants: CombatParticipant[],
  groups: CombatTurnGroup[],
  dm: { id: string; name: string; color: string },
) {
  if (encounter.status !== "collecting") return { ok: false, error: "wrong_status" };
  if (participants.length === 0) return { ok: false, error: "no_participants" };

  const blocks = buildOrderedTurns(participants, groups);
  // Persist order_index on participants based on the resulting block order.
  let order = 0;
  for (const b of blocks) {
    if (b.kind === "solo") {
      await supabase.from("combat_participants" as any).update({ order_index: order, has_ended_turn: false }).eq("id", b.participant.id);
    } else {
      for (const m of b.members) {
        await supabase.from("combat_participants" as any).update({ order_index: order, has_ended_turn: false }).eq("id", m.id);
      }
    }
    order++;
  }
  const { error } = await supabase
    .from("combat_encounters" as any)
    .update({ status: "active", current_turn_index: 0, started_at: new Date().toISOString() })
    .eq("id", encounter.id);
  if (error) return { ok: false, error: error.message };
  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: " inició el combate." },
  ]);
  return { ok: true };
}

export async function endCombat(
  encounter: CombatEncounter,
  dm: { id: string; name: string; color: string },
) {
  const { error } = await supabase
    .from("combat_encounters" as any)
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", encounter.id);
  if (error) return { ok: false, error: error.message };
  // Phase 5 cleanup: drop ephemeral skill-use counters and temporary effects.
  await clearEncounterSkillState(encounter.id);
  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: " terminó el combate." },
  ]);
  return { ok: true };
}

export async function dmShiftTurn(
  encounter: CombatEncounter,
  blocks: TurnBlock[],
  delta: 1 | -1,
) {
  if (encounter.status !== "active" || blocks.length === 0) return { ok: false };
  const next = ((encounter.current_turn_index + delta) % blocks.length + blocks.length) % blocks.length;
  // Wrap-around forward → reset has_ended_turn for everyone (new round) and bump round_number.
  const wrapped = delta === 1 && encounter.current_turn_index + 1 >= blocks.length;
  if (wrapped) {
    await supabase.from("combat_participants" as any)
      .update({ has_ended_turn: false })
      .eq("encounter_id", encounter.id);
  }
  await supabase
    .from("combat_encounters" as any)
    .update({
      current_turn_index: next,
      ...(wrapped ? { round_number: (encounter.round_number || 1) + 1 } : {}),
    })
    .eq("id", encounter.id);

  // Phase 5: any "used a white skill this turn" flag clears on turn change.
  await resetUsedThisTurn(encounter.id);

  // If we landed on an enemy block via DM advance, log its turn end implicitly when shifting away.
  return { ok: true };
}


// ─────────────────────── Player actions ───────────────────────────

export async function submitInitiative(
  encounter: CombatEncounter,
  character: Character,
  rawValue: number,
) {
  if (encounter.status !== "collecting") return { ok: false, error: "not_collecting" };
  const value = clampInitiative(rawValue);
  const { error } = await supabase
    .from("combat_participants" as any)
    .upsert(
      {
        encounter_id: encounter.id,
        campaign_id: encounter.campaign_id,
        character_id: character.id,
        participant_type: "player",
        display_name: character.name,
        image_url: character.image_url || null,
        color: character.color || null,
        initiative: value,
      },
      { onConflict: "encounter_id,character_id" },
    );
  if (error) return { ok: false, error: error.message };
  await pushLog(encounter.campaign_id, [
    { t: "char", v: character.name, color: character.color, id: character.id },
    { t: "text", v: ` se inscribió a la iniciativa (${value}).` },
  ]);
  return { ok: true };
}

export function groupForCharacter(
  participants: CombatParticipant[],
  groups: CombatTurnGroup[],
  characterId: string,
): { group: CombatTurnGroup; members: CombatParticipant[] } | null {
  const me = participants.find(p => p.character_id === characterId);
  if (!me || !me.turn_group_id) return null;
  const group = groups.find(g => g.id === me.turn_group_id);
  if (!group) return null;
  const members = participants.filter(p => p.turn_group_id === group.id);
  return { group, members };
}

export async function createLink(
  encounter: CombatEncounter,
  leader: Character,
  members: Character[], // does NOT include leader
  initiative: number,
) {
  if (encounter.status !== "collecting") return { ok: false, error: "not_collecting" };
  if (members.length === 0) return { ok: false, error: "no_members" };
  if (members.length + 1 > 3) return { ok: false, error: "too_many" };
  const value = clampInitiative(initiative);

  // Guard: refuse if any of the chosen characters is already in a link for this encounter.
  const allIds = [leader.id, ...members.map(m => m.id)];
  const { data: existing } = await (supabase as any)
    .from("combat_participants")
    .select("character_id,turn_group_id")
    .eq("encounter_id", encounter.id)
    .in("character_id", allIds);
  if ((existing || []).some((r: any) => r.turn_group_id)) {
    return { ok: false, error: "already_linked" };
  }

  const { data: group, error: gErr } = await supabase
    .from("combat_turn_groups" as any)
    .insert({
      encounter_id: encounter.id,
      campaign_id: encounter.campaign_id,
      leader_character_id: leader.id,
      name: `Enlace de ${leader.name}`,
      color: leader.color || null,
      group_initiative: value,
    })
    .select("*")
    .single();
  if (gErr || !group) return { ok: false, error: gErr?.message || "group_failed" };

  const rows = [leader, ...members].map(c => ({
    encounter_id: encounter.id,
    campaign_id: encounter.campaign_id,
    character_id: c.id,
    participant_type: "player",
    display_name: c.name,
    image_url: c.image_url || null,
    color: c.color || null,
    initiative: value,
    turn_group_id: (group as any).id,
    is_leader: c.id === leader.id,
  }));
  const { error: pErr } = await supabase
    .from("combat_participants" as any)
    .upsert(rows, { onConflict: "encounter_id,character_id" });
  if (pErr) return { ok: false, error: pErr.message };

  await pushLog(encounter.campaign_id, [
    { t: "char", v: leader.name, color: leader.color, id: leader.id },
    { t: "text", v: " creó un Enlace con " },
    ...members.flatMap((m, i) => [
      { t: "char" as const, v: m.name, color: m.color, id: m.id },
      ...(i < members.length - 1 ? [{ t: "text" as const, v: ", " }] : []),
    ]),
    { t: "text", v: `. (Iniciativa ${value})` },
  ]);
  return { ok: true };
}

/**
 * Dissolve an Enlace: clear turn_group_id / is_leader on its members and delete the group row.
 * DM-only in practice (UI gates this).
 */
export async function dissolveLink(
  group: CombatTurnGroup,
  dm: { id: string; name: string; color: string },
) {
  await (supabase as any)
    .from("combat_participants")
    .update({ turn_group_id: null, is_leader: false })
    .eq("turn_group_id", group.id);
  const { error } = await (supabase as any)
    .from("combat_turn_groups")
    .delete()
    .eq("id", group.id);
  if (error) return { ok: false, error: error.message };
  await pushLog(group.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: ` disolvió un Enlace${group.name ? ` (${group.name})` : ""}.` },
  ]);
  return { ok: true };
}

export async function passTurn(
  encounter: CombatEncounter,
  blocks: TurnBlock[],
  character: Character,
) {
  if (encounter.status !== "active") return { ok: false, error: "not_active" };
  const block = activeBlock(encounter, blocks);
  if (!block) return { ok: false, error: "no_block" };
  if (!blockContainsCharacter(block, character.id)) return { ok: false, error: "not_your_turn" };

  const ids = block.kind === "solo" ? [block.participant.id] : block.members.map(m => m.id);
  await supabase.from("combat_participants" as any).update({ has_ended_turn: true }).in("id", ids);

  const nextIndex = encounter.current_turn_index + 1;
  const wrapped = nextIndex >= blocks.length;
  if (wrapped) {
    await supabase.from("combat_participants" as any)
      .update({ has_ended_turn: false })
      .eq("encounter_id", encounter.id);
  }
  await supabase
    .from("combat_encounters" as any)
    .update({
      current_turn_index: wrapped ? 0 : nextIndex,
      ...(wrapped ? { round_number: (encounter.round_number || 1) + 1 } : {}),
    })
    .eq("id", encounter.id);

  // Phase 5: clear white-skill-used-this-turn flags.
  await resetUsedThisTurn(encounter.id);




  if (block.kind === "solo") {
    await pushLog(encounter.campaign_id, [
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: " terminó su turno." },
    ]);
  } else {
    const leader = block.members.find(m => m.is_leader);
    await pushLog(encounter.campaign_id, [
      { t: "text", v: "El Enlace de " },
      { t: "char", v: leader?.display_name || character.name, color: leader?.color || character.color, id: leader?.character_id || character.id },
      { t: "text", v: " terminó su turno." },
    ]);
  }
  return { ok: true };
}

// ─────────────────────── Enemy actions (DM) ───────────────────────────

export type EnemyDraft = {
  name: string;
  icon: string;
  color: string;
  initiative: number;
  max_hp: number;
  current_hp: number;
  defense: number;
  speed: string;
  notes: string;
};

export type InsertPosition = "byInitiative" | "afterCurrent" | "end";

export function clampHp(n: number, max: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.floor(n), Math.floor(max)));
}

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
    .select("enemy_instance_number,enemy_name")
    .eq("encounter_id", encounterId)
    .eq("enemy_name", baseName);
  const max = (data || []).reduce((acc: number, r: any) => Math.max(acc, Number(r.enemy_instance_number || 0)), 0);
  return max + 1;
}

export async function addEnemies(
  encounter: CombatEncounter,
  draft: EnemyDraft,
  count: number,
  position: InsertPosition,
  dm: { id: string; name: string; color: string },
) {
  if (encounter.status === "ended") return { ok: false, error: "ended" };
  const name = (draft.name || "").trim();
  if (!name) return { ok: false, error: "no_name" };
  const max_hp = Math.max(1, Math.floor(draft.max_hp || 1));
  const current_hp = clampHp(draft.current_hp ?? max_hp, max_hp);
  const defense = Math.max(0, Math.floor(draft.defense || 0));
  const initiative = clampInitiative(draft.initiative || 1);
  const qty = Math.max(1, Math.min(20, Math.floor(count || 1)));

  let baseOrder = await nextOrderIndex(encounter.id);
  if (position === "afterCurrent" && encounter.status === "active") {
    baseOrder = encounter.current_turn_index + 1;
  }
  // For byInitiative we just append; buildOrderedTurns sorts by initiative anyway.

  const rows: any[] = [];
  for (let i = 0; i < qty; i++) {
    const instance = await nextInstanceNumber(encounter.id, name) + i;
    rows.push({
      encounter_id: encounter.id,
      campaign_id: encounter.campaign_id,
      character_id: null,
      participant_type: "enemy",
      display_name: qty > 1 ? `${name} ${instance}` : name,
      image_url: null,
      color: draft.color || null,
      initiative,
      order_index: baseOrder + i,
      enemy_name: name,
      enemy_icon: draft.icon || "skull",
      enemy_color: draft.color || null,
      enemy_hp: current_hp,
      enemy_max_hp: max_hp,
      enemy_defense: defense,
      enemy_speed: draft.speed || null,
      enemy_notes: draft.notes || null,
      enemy_instance_number: instance,
      is_enemy_visible: true,
      is_defeated: current_hp <= 0,
    });
  }
  const { error } = await (supabase as any).from("combat_participants").insert(rows);
  if (error) return { ok: false, error: error.message };

  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: qty > 1 ? ` añadió ${qty} enemigos al combate: ${name}.` : ` añadió enemigo al combate: ${name}.` },
  ]);
  return { ok: true };
}

export async function updateEnemy(participant: CombatParticipant, patch: Partial<EnemyDraft>) {
  if (!isEnemy(participant)) return { ok: false };
  const upd: any = {};
  if (patch.name !== undefined) {
    upd.enemy_name = patch.name.trim();
    upd.display_name = participant.enemy_instance_number && participant.enemy_instance_number > 1
      ? `${patch.name.trim()} ${participant.enemy_instance_number}`
      : patch.name.trim();
  }
  if (patch.icon !== undefined) upd.enemy_icon = patch.icon;
  if (patch.color !== undefined) { upd.enemy_color = patch.color; upd.color = patch.color; }
  if (patch.initiative !== undefined) upd.initiative = clampInitiative(patch.initiative);
  if (patch.max_hp !== undefined) upd.enemy_max_hp = Math.max(1, Math.floor(patch.max_hp));
  if (patch.current_hp !== undefined) {
    const max = upd.enemy_max_hp ?? participant.enemy_max_hp ?? 1;
    upd.enemy_hp = clampHp(patch.current_hp, max);
    upd.is_defeated = upd.enemy_hp <= 0;
  }
  if (patch.defense !== undefined) upd.enemy_defense = Math.max(0, Math.floor(patch.defense));
  if (patch.speed !== undefined) upd.enemy_speed = patch.speed;
  if (patch.notes !== undefined) upd.enemy_notes = patch.notes;
  const { error } = await (supabase as any).from("combat_participants").update(upd).eq("id", participant.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function applyEnemyDamage(
  participant: CombatParticipant,
  raw: number,
  opts: { useDefense: boolean },
) {
  if (!isEnemy(participant)) return { ok: false, applied: 0 };
  const def = participant.enemy_defense || 0;
  const applied = Math.max(0, Math.floor(raw) - (opts.useDefense ? def : 0));
  const max = participant.enemy_max_hp || 1;
  const newHp = clampHp((participant.enemy_hp || 0) - applied, max);
  const becameDefeated = newHp <= 0 && !participant.is_defeated;
  await (supabase as any).from("combat_participants")
    .update({ enemy_hp: newHp, is_defeated: newHp <= 0 })
    .eq("id", participant.id);
  if (becameDefeated) {
    await pushLog(participant.campaign_id, [
      { t: "text", v: `${participant.display_name} fue derrotado.` },
    ]);
  }
  return { ok: true, applied };
}

export async function healEnemy(participant: CombatParticipant, amount: number) {
  if (!isEnemy(participant)) return { ok: false };
  const max = participant.enemy_max_hp || 1;
  const newHp = clampHp((participant.enemy_hp || 0) + Math.floor(amount), max);
  await (supabase as any).from("combat_participants")
    .update({ enemy_hp: newHp, is_defeated: newHp <= 0 })
    .eq("id", participant.id);
  return { ok: true };
}

export async function duplicateEnemy(participant: CombatParticipant, encounter: CombatEncounter, dm: { id: string; name: string; color: string }) {
  if (!isEnemy(participant)) return { ok: false };
  const baseName = participant.enemy_name || participant.display_name;
  const instance = await nextInstanceNumber(encounter.id, baseName);
  const order = await nextOrderIndex(encounter.id);
  const { error } = await (supabase as any).from("combat_participants").insert({
    encounter_id: encounter.id,
    campaign_id: encounter.campaign_id,
    character_id: null,
    participant_type: "enemy",
    display_name: `${baseName} ${instance}`,
    image_url: null,
    color: participant.enemy_color || null,
    initiative: participant.initiative,
    order_index: order,
    enemy_name: baseName,
    enemy_icon: participant.enemy_icon,
    enemy_color: participant.enemy_color,
    enemy_hp: participant.enemy_max_hp,
    enemy_max_hp: participant.enemy_max_hp,
    enemy_defense: participant.enemy_defense || 0,
    enemy_speed: participant.enemy_speed,
    enemy_notes: participant.enemy_notes,
    enemy_instance_number: instance,
    is_enemy_visible: true,
    is_defeated: false,
  });
  if (error) return { ok: false, error: error.message };
  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: ` duplicó enemigo: ${baseName}.` },
  ]);
  return { ok: true };
}

export async function removeEnemy(participant: CombatParticipant, encounter: CombatEncounter, dm: { id: string; name: string; color: string }) {
  if (!isEnemy(participant)) return { ok: false };
  const { error } = await (supabase as any).from("combat_participants").delete().eq("id", participant.id);
  if (error) return { ok: false, error: error.message };
  // If the removed participant was before/at the current turn, adjust current_turn_index.
  if (encounter.status === "active") {
    const removedOrder = participant.order_index;
    if (removedOrder <= encounter.current_turn_index && encounter.current_turn_index > 0) {
      await (supabase as any).from("combat_encounters")
        .update({ current_turn_index: encounter.current_turn_index - 1 })
        .eq("id", encounter.id);
    }
  }
  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: ` eliminó enemigo: ${participant.display_name}.` },
  ]);
  return { ok: true };
}

export async function moveParticipant(
  encounter: CombatEncounter,
  blocks: TurnBlock[],
  blockKey: string,
  direction: "up" | "down" | "first" | "last",
) {
  if (encounter.status === "ended") return { ok: false };
  const idx = blocks.findIndex(b => b.key === blockKey);
  if (idx < 0) return { ok: false };
  let target = idx;
  if (direction === "up") target = Math.max(0, idx - 1);
  else if (direction === "down") target = Math.min(blocks.length - 1, idx + 1);
  else if (direction === "first") target = 0;
  else target = blocks.length - 1;
  if (target === idx) return { ok: true };

  const reordered = [...blocks];
  const [moved] = reordered.splice(idx, 1);
  reordered.splice(target, 0, moved);

  // Reassign order_index sequentially across all participants.
  let order = 0;
  for (const b of reordered) {
    if (b.kind === "solo") {
      await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", b.participant.id);
    } else {
      for (const m of b.members) {
        await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", m.id);
      }
    }
    order++;
  }

  if (encounter.status === "active") {
    // Keep current turn pointing at the same block.
    let newCurrent = encounter.current_turn_index;
    if (idx === encounter.current_turn_index) newCurrent = target;
    else if (idx < encounter.current_turn_index && target >= encounter.current_turn_index) newCurrent--;
    else if (idx > encounter.current_turn_index && target <= encounter.current_turn_index) newCurrent++;
    if (newCurrent !== encounter.current_turn_index) {
      await (supabase as any).from("combat_encounters")
        .update({ current_turn_index: newCurrent })
        .eq("id", encounter.id);
    }
  }
  return { ok: true };
}

/**
 * Reorder a block to a specific target index (used by drag-and-drop).
 */
export async function reorderParticipantTo(
  encounter: CombatEncounter,
  blocks: TurnBlock[],
  fromKey: string,
  toIndex: number,
) {
  if (encounter.status === "ended") return { ok: false };
  const idx = blocks.findIndex(b => b.key === fromKey);
  if (idx < 0) return { ok: false };
  const target = Math.max(0, Math.min(blocks.length - 1, toIndex));
  if (target === idx) return { ok: true };

  const reordered = [...blocks];
  const [moved] = reordered.splice(idx, 1);
  reordered.splice(target, 0, moved);

  let order = 0;
  for (const b of reordered) {
    if (b.kind === "solo") {
      await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", b.participant.id);
    } else {
      for (const m of b.members) {
        await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", m.id);
      }
    }
    order++;
  }

  if (encounter.status === "active") {
    let newCurrent = encounter.current_turn_index;
    if (idx === encounter.current_turn_index) newCurrent = target;
    else if (idx < encounter.current_turn_index && target >= encounter.current_turn_index) newCurrent--;
    else if (idx > encounter.current_turn_index && target <= encounter.current_turn_index) newCurrent++;
    if (newCurrent !== encounter.current_turn_index) {
      await (supabase as any).from("combat_encounters")
        .update({ current_turn_index: newCurrent })
        .eq("id", encounter.id);
    }
  }
  return { ok: true };
}

export async function dmEndEnemyTurn(
  encounter: CombatEncounter,
  blocks: TurnBlock[],
) {
  const block = activeBlock(encounter, blocks);
  if (!block || block.kind !== "solo" || !isEnemy(block.participant)) return { ok: false };
  await pushLog(encounter.campaign_id, [
    { t: "text", v: `${block.participant.display_name} terminó su turno.` },
  ]);
  return dmShiftTurn(encounter, blocks, 1);
}

// ─────────────── Enemy skills (snapshot in combat) ───────────────

export type CombatEnemySkill = {
  id: string;
  campaign_id: string;
  encounter_id: string;
  combat_participant_id: string;
  template_skill_id: string | null;
  name: string;
  rarity: string;
  skill_type: string | null;
  target_shape: string | null;
  targets: string | null;
  dice: string | null;
  range_text: string | null;
  effect: string | null;
  visual_brief: string | null;
  order_index: number;
  created_at: string;
};

export async function listEnemySkills(participantId: string): Promise<CombatEnemySkill[]> {
  const { data } = await (supabase as any)
    .from("combat_enemy_skills")
    .select("*")
    .eq("combat_participant_id", participantId)
    .order("order_index", { ascending: true });
  return (data as any) || [];
}

export type EnemySkillVisibility = "private" | "nameAndEffect" | "full";

export async function logEnemySkillUse(
  participant: CombatParticipant,
  skill: CombatEnemySkill | {
    name: string; rarity: string; skill_type: string | null; target_shape: string | null;
    targets: string | null; dice: string | null; range_text: string | null;
    effect: string | null; visual_brief: string | null;
  },
  opts: { visibility: EnemySkillVisibility; resolvedTargets?: string; rollResult?: string; dmNote?: string },
) {
  if (opts.visibility === "private") return { ok: true };
  const payload = {
    enemyName: participant.display_name,
    enemyIcon: participant.enemy_icon,
    enemyColor: participant.enemy_color,
    skillName: skill.name,
    rarity: skill.rarity,
    skillType: skill.skill_type,
    targetShape: skill.target_shape,
    targets: skill.targets,
    dice: skill.dice,
    rangeText: skill.range_text,
    effect: skill.effect,
    visualBrief: skill.visual_brief,
    detail: opts.visibility,
    resolvedTargets: opts.resolvedTargets || null,
    rollResult: opts.rollResult || null,
    dmNote: opts.dmNote || null,
  };
  await pushLog(participant.campaign_id, [{ t: "enemy_skill", v: payload } as any]);
  return { ok: true };
}

export async function logEnemySpeech(participant: CombatParticipant, text: string) {
  const clean = (text || "").trim();
  if (!clean) return { ok: false, error: "empty" };
  const payload = {
    enemyName: participant.display_name,
    enemyIcon: participant.enemy_icon,
    enemyColor: participant.enemy_color,
    text: clean,
  };
  await pushLog(participant.campaign_id, [{ t: "enemy_speech", v: payload } as any]);
  return { ok: true };
}


