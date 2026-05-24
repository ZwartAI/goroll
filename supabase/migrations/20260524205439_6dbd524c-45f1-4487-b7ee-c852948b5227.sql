CREATE TABLE public.effect_remove_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  character_id uuid NOT NULL,
  condition_id uuid NOT NULL,
  player_name text NOT NULL DEFAULT '',
  effect_label text NOT NULL DEFAULT '',
  effect_icon text NOT NULL DEFAULT '✨',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
ALTER TABLE public.effect_remove_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_all ON public.effect_remove_requests FOR ALL USING (true) WITH CHECK (true);
CREATE INDEX idx_err_campaign_status ON public.effect_remove_requests(campaign_id, status);
ALTER PUBLICATION supabase_realtime ADD TABLE public.effect_remove_requests;
ALTER TABLE public.effect_remove_requests REPLICA IDENTITY FULL;