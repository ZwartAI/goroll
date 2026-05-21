-- Turn pins: extra turns for an existing enemy participant without duplicating HP.
CREATE TABLE public.combat_turn_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL,
  campaign_id uuid NOT NULL,
  linked_participant_id uuid NOT NULL,
  label text,
  order_index integer NOT NULL DEFAULT 0,
  initiative integer NOT NULL DEFAULT 10,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX combat_turn_pins_encounter_idx ON public.combat_turn_pins(encounter_id);
CREATE INDEX combat_turn_pins_linked_idx ON public.combat_turn_pins(linked_participant_id);

ALTER TABLE public.combat_turn_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public_all"
  ON public.combat_turn_pins
  FOR ALL
  USING (true)
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.combat_turn_pins;
