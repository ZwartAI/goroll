-- Remove permissive DELETE and UPDATE policies on avatars/backgrounds buckets.
-- The app never deletes or overwrites existing files (upload paths are timestamped),
-- so dropping these policies blocks anonymous tampering without breaking functionality.
DROP POLICY IF EXISTS avatars_public_delete ON storage.objects;
DROP POLICY IF EXISTS avatars_public_update ON storage.objects;
DROP POLICY IF EXISTS backgrounds_public_delete ON storage.objects;
DROP POLICY IF EXISTS backgrounds_public_update ON storage.objects;