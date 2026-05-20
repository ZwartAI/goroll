-- Combat Phase 1: Initiative / Combat encounters, turn groups, and participants.

CREATE TABLE IF NOT EXISTS public.combat_encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'collecting',
  requested_by_character_id uuid,
  current_turn_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  CONSTRAINT combat_encounters_status_chk CHECK (status IN ('collecting','active','ended'))
);

-- Only one non-ended encounter per campaign at a time.
CREATE UNIQUE INDEX IF NOT EXISTS combat_encounters_one_active_per_campaign
  ON public.combat_encounters (campaign_id)
  WHERE status <> 'ended';

CREATE INDEX IF NOT EXISTS combat_encounters_campaign_idx
  ON public.combat_encounters (campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.combat_turn_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.combat_encounters(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL,
  leader_character_id uuid NOT NULL,
  name text,
  color text,
  group_initiative integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS combat_turn_groups_encounter_idx
  ON public.combat_turn_groups (encounter_id);

CREATE TABLE IF NOT EXISTS public.combat_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.combat_encounters(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL,
  character_id uuid NOT NULL,
  participant_type text NOT NULL DEFAULT 'player',
  display_name text NOT NULL DEFAULT '',
  image_url text,
  color text,
  initiative integer NOT NULL DEFAULT 0,
  turn_group_id uuid REFERENCES public.combat_turn_groups(id) ON DELETE SET NULL,
  is_leader boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL DEFAULT 0,
  has_ended_turn boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT combat_participants_initiative_chk CHECK (initiative >= 0 AND initiative <= 20),
  CONSTRAINT combat_participants_type_chk CHECK (participant_type IN ('player','enemy'))
);

CREATE UNIQUE INDEX IF NOT EXISTS combat_participants_unique_per_encounter
  ON public.combat_participants (encounter_id, character_id);

CREATE INDEX IF NOT EXISTS combat_participants_encounter_idx
  ON public.combat_participants (encounter_id, order_index);

-- RLS — match the project's public_all pattern.
ALTER TABLE public.combat_encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_turn_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.combat_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_all ON public.combat_encounters;
CREATE POLICY public_all ON public.combat_encounters FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS public_all ON public.combat_turn_groups;
CREATE POLICY public_all ON public.combat_turn_groups FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS public_all ON public.combat_participants;
CREATE POLICY public_all ON public.combat_participants FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_encounters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_turn_groups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_participants;