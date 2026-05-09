ALTER PUBLICATION supabase_realtime ADD TABLE public.items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.characters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.achievements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_members;

ALTER TABLE public.items REPLICA IDENTITY FULL;
ALTER TABLE public.characters REPLICA IDENTITY FULL;
ALTER TABLE public.logs REPLICA IDENTITY FULL;
ALTER TABLE public.achievements REPLICA IDENTITY FULL;
ALTER TABLE public.campaigns REPLICA IDENTITY FULL;
ALTER TABLE public.campaign_members REPLICA IDENTITY FULL;

ALTER TABLE public.characters ADD COLUMN IF NOT EXISTS damage_boost integer NOT NULL DEFAULT 0;