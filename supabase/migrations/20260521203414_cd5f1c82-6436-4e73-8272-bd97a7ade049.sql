ALTER TABLE public.combat_participants
  ADD COLUMN IF NOT EXISTS enemy_role text,
  ADD COLUMN IF NOT EXISTS enemy_biome text,
  ADD COLUMN IF NOT EXISTS enemy_base_damage text,
  ADD COLUMN IF NOT EXISTS enemy_behavior text;