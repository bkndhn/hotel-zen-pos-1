
-- Fix resolve_branch_menu to return profile.id directly (not user_id)
-- This allows unauthenticated public menu users to use the result directly
-- without needing to query the profiles table (which requires auth)
CREATE OR REPLACE FUNCTION public.resolve_branch_menu(p_shop_slug text, p_branch_code text)
 RETURNS TABLE(admin_id uuid, branch_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT p.id AS admin_id, b.id AS branch_id
  FROM shop_settings ss
  JOIN profiles p ON p.user_id = ss.user_id AND p.role = 'admin'
  JOIN branches b ON b.admin_id = p.id AND b.code = p_branch_code AND b.is_active = true
  WHERE ss.menu_slug = p_shop_slug
  LIMIT 1;
END;
$function$;
