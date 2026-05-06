
-- 1) STORAGE: Enforce ownership by admin folder prefix on UPDATE/DELETE for the three buckets
DROP POLICY IF EXISTS "Users can delete their item images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their item images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own item-media" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own item-media" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own promo-banners" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own promo-banners" ON storage.objects;

-- INSERT policies: also require ownership prefix
DROP POLICY IF EXISTS "Authenticated users can upload item images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to item-media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload to promo-banners" ON storage.objects;

CREATE POLICY "Admin-scoped upload to item-images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'item-images'
  AND public.get_user_admin_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_user_admin_id()::text
);

CREATE POLICY "Admin-scoped update to item-images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'item-images'
  AND (storage.foldername(name))[1] = public.get_user_admin_id()::text
);

CREATE POLICY "Admin-scoped delete from item-images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'item-images'
  AND (storage.foldername(name))[1] = public.get_user_admin_id()::text
);

CREATE POLICY "Admin-scoped upload to item-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'item-media'
  AND public.get_user_admin_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_user_admin_id()::text
);

CREATE POLICY "Admin-scoped update to item-media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'item-media'
  AND (storage.foldername(name))[1] = public.get_user_admin_id()::text
);

CREATE POLICY "Admin-scoped delete from item-media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'item-media'
  AND (storage.foldername(name))[1] = public.get_user_admin_id()::text
);

CREATE POLICY "Admin-scoped upload to promo-banners"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'promo-banners'
  AND public.get_user_admin_id() IS NOT NULL
  AND (storage.foldername(name))[1] = public.get_user_admin_id()::text
);

CREATE POLICY "Admin-scoped update to promo-banners"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'promo-banners'
  AND (storage.foldername(name))[1] = public.get_user_admin_id()::text
);

CREATE POLICY "Admin-scoped delete from promo-banners"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'promo-banners'
  AND (storage.foldername(name))[1] = public.get_user_admin_id()::text
);

-- 2) SECURITY DEFINER functions: revoke broad EXECUTE; grant only to roles that need them.
-- Trigger functions never need direct EXECUTE.
REVOKE EXECUTE ON FUNCTION public.enforce_branch_limit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_sub_user_limit() FROM PUBLIC, anon, authenticated;

-- Internal helpers: only authenticated users need them (called by RLS policies/RPC server-side)
REVOKE EXECUTE ON FUNCTION public.get_my_admin_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_profile_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_admin_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin_or_super() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_page_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_permissions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_user_allowed_to_login(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_has_branch_access(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.copy_items_to_branch(uuid, uuid, uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.seed_branch_defaults(uuid, uuid) FROM PUBLIC, anon;

-- Bill creation: must be authenticated
REVOKE EXECUTE ON FUNCTION public.create_bill_transaction(text, payment_method, jsonb, uuid, numeric, uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_bill_transaction(text, payment_method, jsonb, uuid, numeric, uuid, jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_bill_transaction(text, uuid, timestamptz, numeric, payment_method, jsonb, jsonb, numeric, jsonb) FROM PUBLIC, anon;

-- Public-facing functions kept callable by anon (used by public QR menu / table ordering):
--   get_public_shop_settings, get_public_shop_settings_by_profile,
--   resolve_branch_menu, resolve_menu_slug,
--   public_update_table_status, check_table_order_rate_limit, check_service_request_rate_limit
-- (no change)

-- 3) item_categories: replace broad public SELECT with scoped RPC; drop the over-permissive policy.
DROP POLICY IF EXISTS "Public can view item categories" ON public.item_categories;

CREATE OR REPLACE FUNCTION public.get_public_item_categories(p_admin_id uuid)
RETURNS TABLE(id uuid, name text, branch_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id, name, branch_id
  FROM public.item_categories
  WHERE admin_id = p_admin_id
    AND COALESCE(is_deleted, false) = false
  ORDER BY name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_item_categories(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_item_categories(uuid) TO anon, authenticated;
