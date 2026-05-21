## Phase 5 — Player Skills in Combat

Integrate unlocked player skills into active combat with rarity-based uses, target selection, damage/heal/shield resolution, and visual log.

### Scope decisions

- **DM approval flow**: Use **Option B (simple)** — direct application with full log. DM can correct HP from existing controls. Rationale: faster to ship, less disruptive, matches existing pattern where DM already corrects HP via EnemyManagerDM. Approval flow can be added later if needed.
- **Shields**: store in new `combat_temporary_effects` table, display as visual badge on participant. Manual reduction by DM (no auto-absorption).
- **Skill uses**: lazy-create rows on first use per encounter (not eagerly on combat start) — lighter DB load.

### Database

New migration with two tables (RLS `public_all`, realtime enabled):

```
combat_skill_uses
  id, encounter_id, campaign_id, character_id, character_skill_id,
  rarity, max_uses (null=infinite), uses_remaining, used_this_turn bool,
  last_turn_index int, created_at, updated_at
  UNIQUE(encounter_id, character_skill_id)

combat_temporary_effects
  id, encounter_id, campaign_id,
  target_character_id nullable, target_enemy_participant_id nullable,
  source_character_id, source_skill_id nullable,
  effect_type text (shield|buff|debuff|control|note),
  value int, label text, duration_rounds int nullable,
  expires_at_turn_index int nullable, created_at
```

### Logic (`src/lib/combat-skills.ts` new)

- `getOrCreateSkillUse(encounterId, characterSkill)` — lazy init based on rarity (white: null/-1, blue:3, purple:2, gold:1).
- `canUseSkill({ encounter, participant, skill, uses })` → `{ ok, reason }`. Checks: combat active, turn ownership (self or group leader), unlocked, uses remaining, white-once-per-turn.
- `useSkill({ skill, encounter, character, targets, rollResult, resolution, amount, applyDefense })` — atomic flow: validate → apply effect → decrement uses → write log segment.
- `resetTurnFlags(encounterId)` — clear `used_this_turn` when turn advances (hook into existing `passTurn`).
- `clearEncounterSkillState(encounterId)` — called from `endCombat`.

### Effect resolution

- **damage**: required enemy target(s). If `applyDefense`, compute `max(0, raw - enemy.defense)`. Update `combat_participants.enemy_hp`. Mark `is_defeated` if HP≤0. Log includes raw + applied (DM-only sees DEF detail; public log shows "Damage applied: X").
- **heal**: required player/ally target. `current_hp = min(base_hp + bonuses, current_hp + amount)` via existing character HP update path.
- **shield**: insert row in `combat_temporary_effects`, surface badge in CombatList.
- **narrative**: just a note + optional temp effect row.
- **log_only**: just write log segment.

### UI Components

- **`PlayerCombatSkillsPanel.tsx`** (new) — embed in CharacterSheet skills section; shows combat banner ("In combat — your turn" / "Not your turn"), per-skill use counter chip, "Use" button.
- **`SkillUseModal.tsx`** (new) — header (icon/name/rarity/uses), mechanical data, target picker (tabs: Enemies / Allies / Self / None), roll result input, resolution radio (log/damage/heal/shield/narrative), conditional fields (amount, applyDefense), submit.
- **`SkillUseTargetPicker.tsx`** (new) — reusable, fetches active encounter participants.
- **`LogSegments.tsx`** edit — render new `player_skill` segment type (avatar, name, skill, rarity color, dice, targets, roll, effect summary).
- **`CombatList.tsx`** edit — show shield badge from `combat_temporary_effects` on each participant.
- Integrate panel into existing skills UI in `campaign.profile.tsx` (or wherever character skills render).

### Types & i18n

- Extend `Segment` union in `src/lib/game.ts` with `player_skill`.
- Add `combat.playerSkill.*` namespace in `es.ts` / `en.ts` covering all required strings.
- Regenerate types via migration.

### Files

**New**: migration sql, `src/lib/combat-skills.ts`, `src/components/app/PlayerCombatSkillsPanel.tsx`, `src/components/app/SkillUseModal.tsx`, `src/components/app/SkillUseTargetPicker.tsx`.

**Edited**: `src/lib/combat.ts` (passTurn → resetTurnFlags, endCombat → clearEncounterSkillState), `src/lib/game.ts` (Segment), `src/components/app/LogSegments.tsx` (renderer), `src/components/app/CombatList.tsx` (shield badge), `src/routes/campaign.profile.tsx` (mount panel in skills section), `src/integrations/supabase/types.ts` (auto), `src/lib/locales/{es,en}.ts`.

### Out of scope (explicit)

- DM approval workflow (using simple direct-apply).
- Auto-parsing skill dice text.
- Automatic shield absorption on incoming damage.
- Increasing max uses via items/buffs.
- Boss phases, rewards, AI.
