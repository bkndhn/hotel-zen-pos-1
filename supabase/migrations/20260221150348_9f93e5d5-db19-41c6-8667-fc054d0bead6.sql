
-- RPC to resolve menu slug to admin profile ID (public access, no sensitive data exposed)
CREATE OR REPLACE FUNCTION public.resolve_menu_slug(p_slug text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM shop_settings ss
  JOIN profiles p ON p.user_id = ss.user_id
  WHERE ss.menu_slug = p_slug
  LIMIT 1;
$$;
