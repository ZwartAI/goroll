CREATE TABLE IF NOT EXISTS public.skill_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  user_id uuid NOT NULL,
  external_id text,
  name text NOT NULL,
  description text,
  tipo text,
  modo_lanzamiento text,
  distancia text,
  objetivos text,
  dados text,
  efecto text,
  rarity item_rarity NOT NULL DEFAULT 'white',
  unlocked boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.skill_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_all ON public.skill_templates;
CREATE POLICY public_all ON public.skill_templates FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS skill_templates_user_idx ON public.skill_templates(user_id, campaign_id);

ALTER TABLE public.login_attempts ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE public.login_attempts REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_members REPLICA IDENTITY FULL;
ALTER TABLE public.skill_templates REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='skill_templates') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.skill_templates';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='login_attempts') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.login_attempts';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='campaign_members') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_members';
  END IF;
END $$;