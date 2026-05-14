import { supabase } from "@/integrations/supabase/client";
import { totals, type Character, type Item } from "./game";

/**
 * Recomputes max HP for a character based on currently equipped items
 * and adjusts current_hp preserving the damage taken (oldMax - currentHp).
 *
 * `oldMaxHint` MUST be the max HP BEFORE the equipment change. When provided,
 * damage is preserved exactly. When omitted, falls back to a simple clamp
 * (current_hp <= newMax) to avoid accidentally healing the character.
 */
export async function clampHpForOwner(ownerId: string | null | undefined, oldMaxHint?: number) {
  if (!ownerId) return;
  const [chRes, itRes] = await Promise.all([
    supabase.from("characters").select("*").eq("id", ownerId).maybeSingle(),
    supabase.from("items").select("*").eq("owner_character_id", ownerId).eq("equipped", true),
  ]);
  const ch = chRes.data as Character | null;
  if (!ch) return;
  const newMax = totals(ch, (itRes.data || []) as Item[]).maxHp;
  let nextHp: number;
  if (typeof oldMaxHint === "number") {
    const damage = Math.max(0, oldMaxHint - ch.current_hp);
    nextHp = Math.max(0, Math.min(newMax, newMax - damage));
  } else {
    nextHp = Math.min(ch.current_hp, newMax);
  }
  if (nextHp !== ch.current_hp) {
    await supabase.from("characters").update({ current_hp: nextHp }).eq("id", ownerId);
  }
}

/**
 * Compute new current HP after equipment change (equip OR unequip).
 *
 * The rule: equipment is NEVER a healing potion and unequipping NEVER erases damage.
 * We always preserve the damage taken:  damage = oldMax - currentHp
 *  newCurrent = clamp(newMax - damage, 0, newMax)
 *
 * Examples (per spec):
 *  - 58/60 → unequip → newMax 35 → 33/35
 *  - 36/60 → unequip → newMax 35 → 11/35
 *  - 33/35 → equip   → newMax 60 → 58/60   (damage 2 preserved, no free heal)
 */
export function nextHpOnEquipChange(currentHp: number, oldMax: number, newMax: number, _isEquipping: boolean): number {
  const damage = Math.max(0, oldMax - currentHp);
  return Math.max(0, Math.min(newMax, newMax - damage));
}
