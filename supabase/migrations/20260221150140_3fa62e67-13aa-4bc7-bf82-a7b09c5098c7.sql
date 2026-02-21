
-- Fix 1: Remove overly permissive "Anonymous can view orders" policy on table_orders
-- Anonymous users don't need to read orders - only authenticated staff do
DROP POLICY IF EXISTS "Anonymous can view orders" ON table_orders;

-- Fix 2: Replace "Public can view shop settings" with a secure RPC for public menu access
-- The current policy exposes whatsapp_business_api_token to everyone
DROP POLICY IF EXISTS "Public can view shop settings" ON shop_settings;

-- Create an RPC that returns only safe public fields for QR menu
CREATE OR REPLACE FUNCTION public.get_public_shop_settings(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'shop_name', shop_name,
    'address', address,
    'contact_number', contact_number,
    'logo_url', logo_url,
    'menu_primary_color', menu_primary_color,
    'menu_secondary_color', menu_secondary_color,
    'menu_background_color', menu_background_color,
    'menu_text_color', menu_text_color,
    'menu_items_per_row', menu_items_per_row,
    'menu_show_address', menu_show_address,
    'menu_show_phone', menu_show_phone,
    'menu_show_shop_name', menu_show_shop_name,
    'menu_show_category_header', menu_show_category_header,
    'menu_slug', menu_slug,
    'gst_enabled', gst_enabled,
    'gstin', gstin,
    'is_composition_scheme', is_composition_scheme,
    'composition_rate', composition_rate,
    'facebook', facebook,
    'instagram', instagram,
    'whatsapp', whatsapp,
    'show_facebook', show_facebook,
    'show_instagram', show_instagram,
    'show_whatsapp', show_whatsapp
  )
  FROM shop_settings
  WHERE user_id = p_user_id
  LIMIT 1;
$$;
