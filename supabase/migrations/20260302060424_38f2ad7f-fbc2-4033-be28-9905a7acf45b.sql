
-- Add menu_slug column to branches for branch-specific public URLs
ALTER TABLE public.branches ADD COLUMN IF NOT EXISTS menu_slug text;

-- Create unique index on menu_slug (only for non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS branches_menu_slug_unique ON public.branches (menu_slug) WHERE menu_slug IS NOT NULL;

-- Create a function to resolve branch-specific menu URLs
-- Given a shop slug and branch code, returns the admin_id and branch_id
CREATE OR REPLACE FUNCTION public.resolve_branch_menu(p_shop_slug text, p_branch_code text)
RETURNS TABLE(admin_id uuid, branch_id uuid) AS $$
BEGIN
  RETURN QUERY
  SELECT ss.user_id AS admin_id, b.id AS branch_id
  FROM shop_settings ss
  JOIN profiles p ON p.user_id = ss.user_id AND p.role = 'admin'
  JOIN branches b ON b.admin_id = p.id AND b.code = p_branch_code AND b.is_active = true
  WHERE ss.menu_slug = p_shop_slug
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Grant execute to anon and authenticated
GRANT EXECUTE ON FUNCTION public.resolve_branch_menu(text, text) TO anon, authenticated;
