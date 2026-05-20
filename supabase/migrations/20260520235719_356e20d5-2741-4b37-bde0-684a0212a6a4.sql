
CREATE TABLE public.combat_enemy_skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  encounter_id uuid NOT NULL,
  combat_participant_id uuid NOT NULL,
  template_skill_id uuid,
  name text NOT NULL,
  rarity item_rarity NOT NULL DEFAULT 'white',
  skill_type text,
  target_shape text,
  targets text,
  dice text,
  range_text text,
  effect text,
  visual_brief text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_combat_enemy_skills_participant ON public.combat_enemy_skills(combat_participant_id);
CREATE INDEX idx_combat_enemy_skills_encounter ON public.combat_enemy_skills(encounter_id);

ALTER TABLE public.combat_enemy_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY public_all ON public.combat_enemy_skills
  FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_enemy_skills;
