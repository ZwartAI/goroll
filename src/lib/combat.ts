// Combat / Initiative system — Phase 1 (players only).
//
// All actions go through this module so logs + validations stay consistent.
// The DB schema is permissive (RLS public_all) so client-side guards matter.

import { supabase } from "@/integrations/supabase/client";
import { pushLog } from "@/lib/log";
import type { Character } from "@/lib/game";

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
  // Wrap-around forward → reset has_ended_turn for everyone (new round).
  const wrapped = delta === 1 && encounter.current_turn_index + 1 >= blocks.length;
  if (wrapped) {
    await supabase.from("combat_participants" as any)
      .update({ has_ended_turn: false })
      .eq("encounter_id", encounter.id);
  }
  await supabase
    .from("combat_encounters" as any)
    .update({ current_turn_index: next })
    .eq("id", encounter.id);
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
    .update({ current_turn_index: wrapped ? 0 : nextIndex })
    .eq("id", encounter.id);

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
