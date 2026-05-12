ALTER TABLE public.characters ALTER COLUMN backpack_slots SET DEFAULT 20;
UPDATE public.characters SET backpack_slots = 20 WHERE backpack_slots = 12;
ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
ALTER TABLE public.app_settings REPLICA IDENTITY FULL;