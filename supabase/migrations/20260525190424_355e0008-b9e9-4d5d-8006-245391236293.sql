-- Lock down sensitive tables (deny all public access; admin server fns bypass RLS)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_campaigns ENABLE ROW LEVEL SECURITY;

-- Storage: keep insert/select/update (upsert) but explicitly block deletes on these buckets
DROP POLICY IF EXISTS "avatars_no_delete" ON storage.objects;
CREATE POLICY "avatars_no_delete"
ON storage.objects AS RESTRICTIVE
FOR DELETE
TO public
USING (bucket_id <> 'avatars');

DROP POLICY IF EXISTS "backgrounds_no_delete" ON storage.objects;
CREATE POLICY "backgrounds_no_delete"
ON storage.objects AS RESTRICTIVE
FOR DELETE
TO public
USING (bucket_id <> 'backgrounds');