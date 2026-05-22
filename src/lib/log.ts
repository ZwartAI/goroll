import { supabase } from "@/integrations/supabase/client";
import type { Segment } from "./game";

/**
 * undo describes the inverse action so the DM can revert it from the log.
 * Supported kinds:
 *  - { kind: "item.update", id, prev: { ...fields } } — restore previous item state
 *  - { kind: "item.recreate", item: <full row> } — re-insert deleted item
 *  - { kind: "character.update", id, prev: { ...fields } } — restore character fields (hp, coins, stats...)
 *  - { kind: "achievement.delete", id } — remove an achievement granted by mistake
 *  - { kind: "achievement.recreate", row } — re-insert deleted achievement
 */
export type UndoAction =
  | { kind: "item.update"; id: string; prev: Record<string, any> }
  | { kind: "item.recreate"; item: Record<string, any> }
  | { kind: "character.update"; id: string; prev: Record<string, any> }
  | { kind: "achievement.delete"; id: string }
  | { kind: "achievement.recreate"; row: Record<string, any> }
  | { kind: "combat.duplicate.remove"; participantIds: string[] };

/**
 * pushLog inserts a log row visible to all players by default.
 * Pass `dmOnly: true` for spoilery DM-side events (creating an item, booster,
 * skill, or monster template) so only the DM sees the entry in the log feed.
 */
export async function pushLog(
  campaignId: string,
  segments: Segment[],
  undo?: UndoAction,
  opts?: { dmOnly?: boolean },
) {
  await supabase.from("logs").insert({
    campaign_id: campaignId,
    segments: segments as any,
    undo: (undo as any) ?? null,
    dm_only: !!opts?.dmOnly,
  } as any);
}
