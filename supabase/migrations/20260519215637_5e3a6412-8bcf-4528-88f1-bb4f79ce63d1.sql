
-- Unique index for global (campaign-less) condition effects, to allow idempotent seeding
CREATE UNIQUE INDEX IF NOT EXISTS condition_effects_catalog_global_key_uidx
  ON public.condition_effects_catalog (key)
  WHERE campaign_id IS NULL;

-- Seed: Master account (idempotent)
INSERT INTO public.app_users (id, username, pin, language)
VALUES ('52a925ac-edb0-49f9-9086-8b86ab68a9f8', 'MasterAcc1000', '1234', 'es')
ON CONFLICT (username) DO NOTHING;

-- Seed: global condition effects catalog
INSERT INTO public.condition_effects_catalog (key, label, icon, is_damage, damage_default, campaign_id) VALUES
  ('asleep',       'Dormido',           '😴', false, 0, NULL),
  ('bleeding',     'Sangrando',         '🩸', true,  1, NULL),
  ('blinded',      'Ciego',             '🙈', false, 0, NULL),
  ('burned',       'Quemado',           '🔥', true,  1, NULL),
  ('confused',     'Confundido',        '🌀', false, 0, NULL),
  ('dead',         'Muerto',            '💀', false, 0, NULL),
  ('deafened',     'Ensordecido',       '🔕', false, 0, NULL),
  ('depressed',    'Deprimido',         '🌧️', false, 0, NULL),
  ('dizzy',        'Mareado',           '😵‍💫', false, 0, NULL),
  ('drowning',     'Ahogado',           '🌊', true,  1, NULL),
  ('electrocuted', 'Electrocutado',     '⚡', false, 0, NULL),
  ('empowered',    'Potenciado',        '✨', false, 0, NULL),
  ('enraged',      'Con Rabia',         '😡', false, 0, NULL),
  ('fractured',    'Fracturado',        '🦴', true,  1, NULL),
  ('frightened',   'Asustado',          '😱', false, 0, NULL),
  ('frozen',       'Congelado',         '🧊', false, 0, NULL),
  ('furious',      'En Furia',          '🤬', false, 0, NULL),
  ('gluttony',     'Gula',              '🍖', false, 0, NULL),
  ('invisible',    'Invisible',         '👻', false, 0, NULL),
  ('paralyzed',    'Paralizado',        '🕸️', false, 0, NULL),
  ('poisoned',     'Envenenado',        '🐍', true,  1, NULL),
  ('slowed',       'Ralentizado',       '🐢', false, 0, NULL),
  ('strangled',    'Estrangulamiento',  '🪢', true,  1, NULL),
  ('stunned',      'Aturdido',          '💫', false, 0, NULL),
  ('unconscious',  'Inconsciente',      '😵', false, 0, NULL),
  ('weakened',     'Debilitado',        '🪫', false, 0, NULL),
  ('wounded',      'Herido',            '❤️‍🩹', true, 1, NULL)
ON CONFLICT (key) WHERE campaign_id IS NULL DO NOTHING;
