import { supabase } from "@/integrations/supabase/client";
import { totals, type Character, type Item } from "./game";

/**
 * Recomputes max HP for a character based on currently equipped items
 * and clamps current_hp so it never exceeds the new max.
 * Use after item-owner changes (transfer, discard, reclaim).
 */
export async function clampHpForOwner(ownerId: string | null | undefined) {
  if (!ownerId) return;
  const [chRes, itRes] = await Promise.all([
    supabase.from("characters").select("*").eq("id", ownerId).maybeSingle(),
    supabase.from("items").select("*").eq("owner_character_id", ownerId).eq("equipped", true),
  ]);
  const ch = chRes.data as Character | null;
  if (!ch) return;
  const max = totals(ch, (itRes.data || []) as Item[]).maxHp;
  if (ch.current_hp > max) {
    await supabase.from("characters").update({ current_hp: max }).eq("id", ownerId);
  }
}

/**
 * Compute new current HP after equipment change.
 *  - Equipping while at FULL hp (current >= oldMax): bumps to newMax (sees the buff fully).
 *  - Otherwise (equipping while wounded, or unequipping): keeps current HP, only clamps
 *    if it now exceeds the new max. Equipment is NOT a healing potion.
 */
export function nextHpOnEquipChange(currentHp: number, oldMax: number, newMax: number, isEquipping: boolean): number {
  if (isEquipping && currentHp >= oldMax) return newMax;
  return Math.max(0, Math.min(newMax, currentHp));
}
