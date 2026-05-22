// Combat / Initiative system — Phase 1 (players only).
//
// All actions go through this module so logs + validations stay consistent.
// The DB schema is permissive (RLS public_all) so client-side guards matter.

import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import type { Character } from "@/lib/game";
import { resetUsedThisTurn, clearEncounterSkillState, tickPlayerTurnEnd } from "@/lib/combat-skills";

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
  enemy_role: string | null;
  enemy_biome: string | null;
  enemy_base_damage: string | null;
  enemy_behavior: string | null;

};

export function isEnemy(p: CombatParticipant): boolean {
  return p.participant_type === "enemy";
}


export type CombatTurnPin = {
  id: string;
  encounter_id: string;
  campaign_id: string;
  linked_participant_id: string;
  label: string | null;
  order_index: number;
  initiative: number;
  is_active: boolean;
  created_at: string;
};

export type TurnBlock =
  | { kind: "solo"; key: string; initiative: number; participant: CombatParticipant }
  | { kind: "group"; key: string; initiative: number; group: CombatTurnGroup; members: CombatParticipant[] }
  | { kind: "pin"; key: string; initiative: number; pin: CombatTurnPin; linked: CombatParticipant };


function blockOrder(b: TurnBlock): number {
  if (b.kind === "solo") return b.participant.order_index;
  if (b.kind === "group") return Math.min(...b.members.map(m => m.order_index));
  return b.pin.order_index;
}
function blockCreated(b: TurnBlock): string {
  if (b.kind === "solo") return b.participant.created_at;
  if (b.kind === "group") return b.group.created_at;
  return b.pin.created_at;
}

/** Build the ordered turn blocks (high → low initiative). Pins extend the order without HP. */
export function buildOrderedTurns(
  participants: CombatParticipant[],
  groups: CombatTurnGroup[],
  pins: CombatTurnPin[] = [],
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
  const partById = new Map(participants.map(p => [p.id, p]));
  for (const pin of pins) {
    const linked = partById.get(pin.linked_participant_id);
    if (!linked) continue;
    blocks.push({ kind: "pin", key: `p:${pin.id}`, initiative: pin.initiative, pin, linked });
  }
  blocks.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    const ao = blockOrder(a);
    const bo = blockOrder(b);
    if (ao !== bo) return ao - bo;
    return blockCreated(a).localeCompare(blockCreated(b));
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
  if (block.kind === "group") return block.members.some(m => m.character_id === characterId);
  return false;
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
    } else if (b.kind === "group") {
      for (const m of b.members) {
        await supabase.from("combat_participants" as any).update({ order_index: order, has_ended_turn: false }).eq("id", m.id);
      }
    } else {
      await (supabase as any).from("combat_turn_pins").update({ order_index: order }).eq("id", b.pin.id);
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
  // Walk forward/backward skipping blocks that are entirely defeated enemies,
  // so passing the turn of a downed enemy lands on the next live combatant.
  const isAllDefeated = (b: TurnBlock) => {
    if (b.kind === "solo") return isEnemy(b.participant) && b.participant.is_defeated;
    if (b.kind === "pin") return !b.pin.is_active || b.linked.is_defeated;
    return false;
  };
  let cur = encounter.current_turn_index;
  let next = cur;
  let wrapped = false;
  let bumpedRound = 0;
  // Cap iterations to avoid infinite loop if every block is defeated.
  for (let i = 0; i < blocks.length; i++) {
    const raw = next + delta;
    const w = delta === 1 ? raw >= blocks.length : raw < 0;
    if (w) { wrapped = true; bumpedRound += 1; }
    next = ((raw % blocks.length) + blocks.length) % blocks.length;
    if (!isAllDefeated(blocks[next])) break;
  }
  if (wrapped) {
    await supabase.from("combat_participants" as any)
      .update({ has_ended_turn: false })
      .eq("encounter_id", encounter.id);
  }
  await supabase
    .from("combat_encounters" as any)
    .update({
      current_turn_index: next,
      ...(bumpedRound > 0 ? { round_number: (encounter.round_number || 1) + bumpedRound } : {}),
    })
    .eq("id", encounter.id);

  // Phase 5: any "used a white skill this turn" flag clears on turn change.
  await resetUsedThisTurn(encounter.id);

  return { ok: true };
}


// ─────────────────────── Player actions ───────────────────────────

export async function submitInitiative(
  encounter: CombatEncounter,
  character: Character,
  rawValue: number,
) {
  if (encounter.status !== "collecting" && encounter.status !== "active") {
    return { ok: false, error: "wrong_status" };
  }
  const value = clampInitiative(rawValue);
  // Late join (status === "active"): append at end of rotation and mark turn as ended
  // so the new participant waits until the next round.
  const lateJoin = encounter.status === "active";
  const extra: Record<string, unknown> = {};
  if (lateJoin) {
    extra.order_index = await nextOrderIndex(encounter.id);
    extra.has_ended_turn = true;
  }
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
        ...extra,
      },
      { onConflict: "encounter_id,character_id" },
    );
  if (error) return { ok: false, error: error.message };
  await pushLog(encounter.campaign_id, [
    { t: "char", v: character.name, color: character.color, id: character.id },
    { t: "text", v: lateJoin ? ` se unió al combate en curso (${value}).` : ` se inscribió a la iniciativa (${value}).` },
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

  const ids = block.kind === "solo" ? [block.participant.id] : block.kind === "group" ? block.members.map(m => m.id) : [];
  if (ids.length) await supabase.from("combat_participants" as any).update({ has_ended_turn: true }).in("id", ids);

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

  // Phase 6: auto-tick condition effects on the character(s) whose turn just ended.
  const affectedCharIds: string[] =
    block.kind === "solo"
      ? (block.participant.character_id ? [block.participant.character_id] : [])
      : block.kind === "group"
        ? block.members.map(m => m.character_id).filter((x): x is string => !!x)
        : [];
  const i18nTpl = {
    damaged: "{effect} hizo {amount} de daño a {target}.",
    shieldAbsorbed: "Escudo absorbió {absorbed}. {target} recibió {applied} de daño.",
    expired: "{effect} expiró sobre {target}.",
  };
  for (const cid of affectedCharIds) {
    await tickPlayerTurnEnd({
      characterId: cid,
      campaignId: encounter.campaign_id,
      encounterId: encounter.id,
      i18n: i18nTpl,
    });
  }





  if (block.kind === "solo") {
    await pushLog(encounter.campaign_id, [
      { t: "char", v: character.name, color: character.color, id: character.id },
      { t: "text", v: " terminó su turno." },
    ]);
  } else if (block.kind === "group") {
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
  role?: string | null;
  biome?: string | null;
  base_damage?: string | null;
  behavior?: string | null;
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
      enemy_role: draft.role || null,
      enemy_biome: draft.biome || null,
      enemy_base_damage: draft.base_damage || null,
      enemy_behavior: draft.behavior || null,
    });
  }

  const { data: inserted, error } = await (supabase as any)
    .from("combat_participants")
    .insert(rows)
    .select("id");
  if (error) return { ok: false as const, error: error.message };

  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: qty > 1 ? ` añadió ${qty} enemigos al combate: ${name}.` : ` añadió enemigo al combate: ${name}.` },
  ]);
  return { ok: true as const, ids: ((inserted as any[]) || []).map(r => r.id as string) };
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
  if (patch.role !== undefined) upd.enemy_role = patch.role;
  if (patch.biome !== undefined) upd.enemy_biome = patch.biome;
  if (patch.base_damage !== undefined) upd.enemy_base_damage = patch.base_damage;
  if (patch.behavior !== undefined) upd.enemy_behavior = patch.behavior;

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
  if (!isEnemy(participant)) return { ok: false as const };

  // Archive to bestiary BEFORE deleting so the enemy can be reused later.
  // Strategy:
  //   1. If the participant was spawned from an existing template (enemy_template_id), skip — the template already lives in the bestiary.
  //   2. Otherwise look for a template in this campaign with the same base name (case-insensitive). If found, skip duplicate.
  //   3. Otherwise create a new template from the participant's stats + snapshot its combat skills as template skills.
  let archived = false;
  try {
    if (!participant.enemy_template_id) {
      const baseName = (participant.enemy_name || participant.display_name || "").trim();
      if (baseName) {
        const { data: existing } = await (supabase as any)
          .from("enemy_templates")
          .select("id")
          .eq("campaign_id", participant.campaign_id)
          .ilike("name", baseName)
          .limit(1);
        if (!existing || existing.length === 0) {
          const tplRow: any = {
            campaign_id: participant.campaign_id,
            name: baseName,
            tier: "normal",
            role: (participant as any).enemy_role || "damage",
            biome: (participant as any).enemy_biome || null,
            icon_key: participant.enemy_icon || "skull",
            color: participant.enemy_color || "#ef4444",
            max_hp: Math.max(1, Math.floor(participant.enemy_max_hp || 1)),
            defense: Math.max(0, Math.floor(participant.enemy_defense || 0)),
            speed: participant.enemy_speed || "30",
            base_damage: (participant as any).enemy_base_damage || null,
            description: null,
            behavior_notes: (participant as any).enemy_behavior || null,
            weaknesses_text: null,
            immunities: [],
            is_boss: false,
            is_elite: false,
            created_by_character_id: dm.id,
          };
          const { data: tpl } = await (supabase as any)
            .from("enemy_templates")
            .insert(tplRow)
            .select("id")
            .single();
          if (tpl) {
            archived = true;
            // Copy combat enemy skills (if any) as template skills.
            const skills = await listEnemySkills(participant.id);
            if (skills.length) {
              const rows = skills.map(s => ({
                enemy_template_id: (tpl as any).id,
                campaign_id: participant.campaign_id,
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
              }));
              await (supabase as any).from("enemy_template_skills").insert(rows);
            }
          }
        }
      }
    }
  } catch {
    // Archival is best-effort — never block the removal itself.
  }

  const { error } = await (supabase as any).from("combat_participants").delete().eq("id", participant.id);
  if (error) return { ok: false as const, error: error.message };
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
    { t: "text", v: archived
        ? ` eliminó enemigo: ${participant.display_name}. Guardado en el Bestiario.`
        : ` eliminó enemigo: ${participant.display_name}.` },
  ]);
  return { ok: true as const, archived };
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
    } else if (b.kind === "group") {
      for (const m of b.members) {
        await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", m.id);
      }
    } else {
      await (supabase as any).from("combat_turn_pins").update({ order_index: order }).eq("id", b.pin.id);
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
    } else if (b.kind === "group") {
      for (const m of b.members) {
        await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", m.id);
      }
    } else {
      await (supabase as any).from("combat_turn_pins").update({ order_index: order }).eq("id", b.pin.id);
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

/**
 * Drag-and-drop reorder for the round turn list. Reorders blocks and
 * automatically adjusts the dragged enemy/pin initiative to match its new
 * neighbors so the order remains consistent with initiative values.
 *
 * - Dragged DOWN: initiative becomes equal to the upper neighbor.
 * - Dragged UP: initiative becomes lower neighbor + 1 (capped by upper).
 * - Players are reordered without changing their initiative.
 */
export async function reorderBlockWithAutoInitiative(
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

  const upper = target > 0 ? reordered[target - 1] : null;
  const lower = target < reordered.length - 1 ? reordered[target + 1] : null;
  const upperInit = upper ? upper.initiative : null;
  const lowerInit = lower ? lower.initiative : null;

  // Compute new initiative for the dragged block (enemies + pins only).
  let newInit: number | null = null;
  const isPlayerSolo = moved.kind === "solo" && !isEnemy(moved.participant);
  const isGroup = moved.kind === "group";
  if (!isPlayerSolo && !isGroup) {
    if (target > idx) {
      // Dragged down → tie with upper neighbor.
      if (upperInit != null) newInit = upperInit;
      else if (lowerInit != null) newInit = lowerInit;
    } else {
      // Dragged up → one above lower neighbor (clamped by upper).
      if (lowerInit != null) {
        newInit = lowerInit + 1;
        if (upperInit != null && newInit > upperInit) newInit = upperInit;
      } else if (upperInit != null) newInit = upperInit;
    }
  }

  // Persist initiative change first so the model stays consistent.
  if (newInit != null) {
    if (moved.kind === "solo") {
      await (supabase as any).from("combat_participants").update({ initiative: newInit }).eq("id", moved.participant.id);
    } else if (moved.kind === "pin") {
      await (supabase as any).from("combat_turn_pins").update({ initiative: newInit }).eq("id", moved.pin.id);
    }
  }

  // Persist new order_index sequentially.
  let order = 0;
  for (const b of reordered) {
    if (b.kind === "solo") {
      await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", b.participant.id);
    } else if (b.kind === "group") {
      for (const m of b.members) {
        await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", m.id);
      }
    } else {
      await (supabase as any).from("combat_turn_pins").update({ order_index: order }).eq("id", b.pin.id);
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
  return { ok: true, newInitiative: newInit };
}

export async function dmEndEnemyTurn(
  encounter: CombatEncounter,
  blocks: TurnBlock[],
) {
  const block = activeBlock(encounter, blocks);
  if (!block) return { ok: false };
  if (block.kind === "solo" && isEnemy(block.participant)) {
    await pushLog(encounter.campaign_id, [
      { t: "text", v: `${block.participant.display_name} terminó su turno.` },
    ]);
  } else if (block.kind === "pin") {
    await pushLog(encounter.campaign_id, [
      { t: "text", v: `${block.linked.display_name} terminó un turno adicional.` },
    ]);
  } else {
    return { ok: false };
  }
  return dmShiftTurn(encounter, blocks, 1);
}

// ─────────────── Turn pins (extra turns for an existing enemy) ───────────────

export async function addTurnPin(
  encounter: CombatEncounter,
  linked: CombatParticipant,
  opts?: { initiative?: number; label?: string | null },
) {
  if (!isEnemy(linked)) return { ok: false, error: "not_enemy" };
  if (encounter.status === "ended") return { ok: false, error: "ended" };
  const initiative = clampInitiative(opts?.initiative ?? linked.initiative ?? 10);
  // Append at the end of the order so it doesn't disrupt the current turn pointer.
  const order = await nextOrderIndex(encounter.id);
  const { error } = await (supabase as any).from("combat_turn_pins").insert({
    encounter_id: encounter.id,
    campaign_id: encounter.campaign_id,
    linked_participant_id: linked.id,
    label: opts?.label ?? null,
    order_index: order,
    initiative,
    is_active: true,
  });
  if (error) return { ok: false, error: error.message };
  await pushLog(encounter.campaign_id, [
    { t: "text", v: `Turno adicional añadido para ${linked.display_name}.` },
  ]);
  return { ok: true };
}

export async function deleteTurnPin(pin: CombatTurnPin) {
  const { error } = await (supabase as any)
    .from("combat_turn_pins")
    .delete()
    .eq("id", pin.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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

export type CombatEnemySkillDraft = {
  name: string;
  rarity?: string;
  skill_type?: string | null;
  target_shape?: string | null;
  targets?: string | null;
  dice?: string | null;
  range_text?: string | null;
  effect?: string | null;
  visual_brief?: string | null;
  order_index?: number;
};

/** Add a skill snapshot to one or more combat participants (enemies). */
export async function addEnemySkillToParticipants(
  participantIds: string[],
  encounterId: string,
  campaignId: string,
  draft: CombatEnemySkillDraft,
) {
  if (!participantIds.length) return { ok: false as const, error: "no_participants" };
  const rows = participantIds.map(pid => ({
    combat_participant_id: pid,
    encounter_id: encounterId,
    campaign_id: campaignId,
    template_skill_id: null,
    name: draft.name.trim(),
    rarity: (draft.rarity as any) || "white",
    skill_type: draft.skill_type ?? null,
    target_shape: draft.target_shape ?? null,
    targets: draft.targets ?? null,
    dice: draft.dice ?? null,
    range_text: draft.range_text ?? null,
    effect: draft.effect ?? null,
    visual_brief: draft.visual_brief ?? null,
    order_index: draft.order_index ?? 0,
  }));
  const { error } = await (supabase as any).from("combat_enemy_skills").insert(rows);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function updateEnemySkill(skill: CombatEnemySkill, patch: Partial<CombatEnemySkillDraft>) {
  const upd: any = {};
  for (const k of ["name","rarity","skill_type","target_shape","targets","dice","range_text","effect","visual_brief","order_index"] as const) {
    if ((patch as any)[k] !== undefined) upd[k] = (patch as any)[k];
  }
  const { error } = await (supabase as any).from("combat_enemy_skills").update(upd).eq("id", skill.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function deleteEnemySkill(skill: CombatEnemySkill) {
  const { error } = await (supabase as any).from("combat_enemy_skills").delete().eq("id", skill.id);
  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function reorderEnemySkill(skill: CombatEnemySkill, direction: "up" | "down", siblings: CombatEnemySkill[]) {
  const sorted = [...siblings].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const idx = sorted.findIndex(s => s.id === skill.id);
  if (idx < 0) return { ok: false as const };
  const swap = direction === "up" ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= sorted.length) return { ok: false as const };
  const a = sorted[idx], b = sorted[swap];
  await (supabase as any).from("combat_enemy_skills").update({ order_index: b.order_index }).eq("id", a.id);
  await (supabase as any).from("combat_enemy_skills").update({ order_index: a.order_index }).eq("id", b.id);
  return { ok: true as const };
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

// ─────────────────────── Enemy → Players damage ───────────────────────

import { totals } from "./game";
import type { Item } from "./game";

export type EnemyAttackDistribution = "individual" | "split";

export type EnemyAttackOptions = {
  damage: number;
  targetCharacterIds: string[];
  useDefense: boolean;
  distribution: EnemyAttackDistribution;
  /** If true, expand selected targets to include all members of their turn_group_id. */
  spreadToLinkGroup: boolean;
};

/**
 * The DM applies an enemy's attack to one or more player characters.
 * Per-target flow:
 *   1) Compute base hit (from distribution).
 *   2) Subtract that character's total defense (if useDefense).
 *   3) Reduce current_hp; clamp at 0.
 * Writes one consolidated log entry.
 */
export async function applyEnemyAttackToPlayers(
  enemy: CombatParticipant,
  participants: CombatParticipant[],
  opts: EnemyAttackOptions,
) {
  if (!isEnemy(enemy)) return { ok: false as const, reason: "not_enemy" };
  const baseDamage = Math.max(0, Math.floor(opts.damage));
  if (baseDamage <= 0) return { ok: false as const, reason: "no_damage" };

  // Expand to link groups if requested.
  let targetIds = Array.from(new Set(opts.targetCharacterIds));
  if (opts.spreadToLinkGroup) {
    const groupIds = new Set<string>();
    for (const id of targetIds) {
      const p = participants.find(pp => pp.character_id === id && pp.participant_type === "player");
      if (p?.turn_group_id) groupIds.add(p.turn_group_id);
    }
    if (groupIds.size > 0) {
      const extra = participants
        .filter(pp => pp.participant_type === "player" && pp.turn_group_id && groupIds.has(pp.turn_group_id))
        .map(pp => pp.character_id!)
        .filter(Boolean);
      targetIds = Array.from(new Set([...targetIds, ...extra]));
    }
  }
  if (targetIds.length === 0) return { ok: false as const, reason: "no_targets" };

  // Per-target hit pre-defense.
  const perHit = opts.distribution === "split"
    ? Math.max(1, Math.ceil(baseDamage / targetIds.length))
    : baseDamage;

  // Fetch characters + equipped items in parallel.
  const [chRes, itRes] = await Promise.all([
    supabase.from("characters").select("*").in("id", targetIds),
    supabase.from("items").select("*").in("owner_character_id", targetIds).eq("equipped", true),
  ]);
  const chars = (chRes.data || []) as Character[];
  const items = (itRes.data || []) as Item[];

  const results: { name: string; color: string | null; id: string; applied: number; def: number; defeated: boolean }[] = [];

  for (const ch of chars) {
    const equipped = items.filter(i => i.owner_character_id === ch.id);
    const def = totals(ch, equipped).defense;
    const applied = Math.max(0, perHit - (opts.useDefense ? def : 0));
    const newHp = Math.max(0, ch.current_hp - applied);
    if (applied > 0) {
      await supabase.from("characters").update({ current_hp: newHp } as any).eq("id", ch.id);
    }
    results.push({
      name: ch.name,
      color: ch.color,
      id: ch.id,
      applied,
      def: opts.useDefense ? def : 0,
      defeated: newHp <= 0 && ch.current_hp > 0,
    });
  }

  // Log: "<Enemy> atacó: [name] -X (DEF Y), [name] -X (DEF Y)..."
  const segs: any[] = [
    { t: "text", v: `${enemy.display_name} atacó: ` },
  ];
  results.forEach((r, i) => {
    if (i > 0) segs.push({ t: "text", v: ", " });
    segs.push({ t: "char", v: r.name, color: r.color || undefined, id: r.id });
    segs.push({ t: "text", v: ` -${r.applied}${opts.useDefense ? ` (DEF ${r.def})` : ""}${r.defeated ? " ☠" : ""}` });
  });
  await pushLog(enemy.campaign_id, segs as any);

  return { ok: true as const, results };
}


// ─────────────── Guided multi-duplicate ───────────────

export type DuplicatePlacement =
  | "afterOriginal"
  | "atBeginning"
  | "atEnd"
  | "distributePlayers"
  | "randomMix"
  | "sameInitiative";

/**
 * Duplicate an enemy already in combat N times with a chosen placement.
 * Creates independent instances with their own HP. Does NOT touch the bestiary.
 * Snapshots existing combat skills onto each copy.
 */
export async function duplicateEnemyMulti(
  participant: CombatParticipant,
  encounter: CombatEncounter,
  blocks: TurnBlock[],
  count: number,
  placement: DuplicatePlacement,
  dm: { id: string; name: string; color: string },
): Promise<{ ok: boolean; created?: number; error?: string }> {
  if (encounter.status === "ended") return { ok: false, error: "ended" };
  if (!isEnemy(participant)) return { ok: false, error: "not_enemy" };
  const qty = Math.max(1, Math.min(20, Math.floor(count || 1)));
  const baseName = participant.enemy_name || participant.display_name;
  const startInstance = await nextInstanceNumber(encounter.id, baseName);
  const startOrder = await nextOrderIndex(encounter.id);

  const rows: any[] = [];
  for (let i = 0; i < qty; i++) {
    rows.push({
      encounter_id: encounter.id,
      campaign_id: encounter.campaign_id,
      character_id: null,
      participant_type: "enemy",
      display_name: `${baseName} ${startInstance + i}`,
      image_url: null,
      color: participant.enemy_color || null,
      initiative: participant.initiative,
      order_index: startOrder + i, // provisional; reassigned below
      enemy_name: baseName,
      enemy_icon: participant.enemy_icon,
      enemy_color: participant.enemy_color,
      enemy_hp: participant.enemy_max_hp,
      enemy_max_hp: participant.enemy_max_hp,
      enemy_defense: participant.enemy_defense || 0,
      enemy_speed: participant.enemy_speed,
      enemy_notes: participant.enemy_notes,
      enemy_instance_number: startInstance + i,
      is_enemy_visible: true,
      is_defeated: false,
      enemy_role: (participant as any).enemy_role || null,
      enemy_biome: (participant as any).enemy_biome || null,
      enemy_base_damage: (participant as any).enemy_base_damage || null,
      enemy_behavior: (participant as any).enemy_behavior || null,
      enemy_template_id: (participant as any).enemy_template_id || null,
    });
  }

  const { data: inserted, error } = await (supabase as any)
    .from("combat_participants")
    .insert(rows)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const newIds: string[] = ((inserted as any[]) || []).map(r => r.id as string);

  // Clone combat skills snapshot to each copy.
  try {
    const srcSkills = await listEnemySkills(participant.id);
    if (srcSkills.length && newIds.length) {
      const skillRows: any[] = [];
      for (const id of newIds) {
        for (const s of srcSkills) {
          skillRows.push({
            encounter_id: encounter.id,
            campaign_id: encounter.campaign_id,
            combat_participant_id: id,
            template_skill_id: s.template_skill_id,
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
  } catch {
    // Skill clone is best-effort.
  }

  // sameInitiative: keep copies at the end with the same initiative; buildOrderedTurns
  // resolves order. No reorder needed.
  if (placement !== "sameInitiative") {
    type Entry = { type: "block"; block: TurnBlock } | { type: "copy"; id: string };
    const existing: Entry[] = blocks.map(b => ({ type: "block" as const, block: b }));
    const copies: Entry[] = newIds.map(id => ({ type: "copy" as const, id }));

    let arr: Entry[] = [];
    if (placement === "atBeginning") {
      arr = [...copies, ...existing];
    } else if (placement === "atEnd") {
      arr = [...existing, ...copies];
    } else if (placement === "afterOriginal") {
      const idx = existing.findIndex(
        e => e.type === "block" && e.block.kind === "solo" && e.block.participant.id === participant.id,
      );
      if (idx < 0) arr = [...existing, ...copies];
      else arr = [...existing.slice(0, idx + 1), ...copies, ...existing.slice(idx + 1)];
    } else if (placement === "distributePlayers") {
      arr = [...existing];
      const playerSlots: number[] = [];
      arr.forEach((e, i) => {
        if (e.type !== "block") return;
        const b = e.block;
        if (b.kind === "group") playerSlots.push(i);
        else if (b.kind === "solo" && b.participant.participant_type === "player") playerSlots.push(i);
      });
      if (playerSlots.length === 0) {
        // No players — spread evenly across the whole list.
        const total = arr.length;
        for (let i = 0; i < copies.length; i++) {
          const target = Math.round(((i + 1) * (total + i + 1)) / (copies.length + 1));
          const pos = Math.max(0, Math.min(arr.length, target));
          arr.splice(pos, 0, copies[i]);
        }
      } else {
        // Cycle through player slots so copies are interleaved, not bunched.
        const shifts = new Map<number, number>();
        for (let i = 0; i < copies.length; i++) {
          const slotIdx = playerSlots[i % playerSlots.length];
          let extra = 0;
          shifts.forEach((v, k) => { if (k <= slotIdx) extra += v; });
          const pos = slotIdx + 1 + extra;
          arr.splice(pos, 0, copies[i]);
          shifts.set(slotIdx, (shifts.get(slotIdx) || 0) + 1);
        }
      }
    } else if (placement === "randomMix") {
      // Mix copies into existing entries with truly uniform random positions
      // (including the absolute first and last slots).
      arr = [...existing];
      const shuffled = [...copies].sort(() => Math.random() - 0.5);
      for (const c of shuffled) {
        const pos = Math.floor(Math.random() * (arr.length + 1));
        arr.splice(pos, 0, c);
      }
    }

    // Track active block to keep current_turn_index correct.
    const oldCurrent = encounter.current_turn_index;
    const activeKey =
      encounter.status === "active" && oldCurrent >= 0 && oldCurrent < blocks.length
        ? blocks[oldCurrent].key
        : null;
    let newActiveIndex = oldCurrent;

    let order = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.type === "block") {
        if (activeKey && e.block.key === activeKey) newActiveIndex = i;
        const b = e.block;
        if (b.kind === "solo") {
          await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", b.participant.id);
        } else if (b.kind === "group") {
          for (const m of b.members) {
            await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", m.id);
          }
        } else {
          await (supabase as any).from("combat_turn_pins").update({ order_index: order }).eq("id", b.pin.id);
        }
      } else {
        await (supabase as any).from("combat_participants").update({ order_index: order }).eq("id", e.id);
      }
      order++;
    }

    if (encounter.status === "active" && activeKey && newActiveIndex !== oldCurrent) {
      await (supabase as any)
        .from("combat_encounters")
        .update({ current_turn_index: newActiveIndex })
        .eq("id", encounter.id);
    }
  }

  await pushLog(encounter.campaign_id, [
    { t: "char", v: dm.name, color: dm.color, id: dm.id },
    { t: "text", v: ` duplicó ${baseName} x${qty}.` },
  ], { kind: "combat.duplicate.remove", participantIds: newIds });

  return { ok: true, created: qty };
}




