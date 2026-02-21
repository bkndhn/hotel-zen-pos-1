
-- Create RPC to get public shop settings by profile ID (no need to query profiles table directly)
CREATE OR REPLACE FUNCTION public.get_public_shop_settings_by_profile(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'shop_name', ss.shop_name,
    'address', ss.address,
    'contact_number', ss.contact_number,
    'logo_url', ss.logo_url,
    'menu_primary_color', ss.menu_primary_color,
    'menu_secondary_color', ss.menu_secondary_color,
    'menu_background_color', ss.menu_background_color,
    'menu_text_color', ss.menu_text_color,
    'menu_items_per_row', ss.menu_items_per_row,
    'menu_show_address', ss.menu_show_address,
    'menu_show_phone', ss.menu_show_phone,
    'menu_show_shop_name', ss.menu_show_shop_name,
    'menu_show_category_header', ss.menu_show_category_header,
    'menu_slug', ss.menu_slug,
    'gst_enabled', ss.gst_enabled,
    'gstin', ss.gstin,
    'is_composition_scheme', ss.is_composition_scheme,
    'composition_rate', ss.composition_rate,
    'facebook', ss.facebook,
    'instagram', ss.instagram,
    'whatsapp', ss.whatsapp,
    'show_facebook', ss.show_facebook,
    'show_instagram', ss.show_instagram,
    'show_whatsapp', ss.show_whatsapp
  )
  FROM shop_settings ss
  JOIN profiles p ON p.user_id = ss.user_id
  WHERE p.id = p_profile_id
  LIMIT 1;
$$;

-- Drop the overly permissive public profile policy that exposes ALL profile data
DROP POLICY IF EXISTS "Public can view profile user_id" ON public.profiles;
