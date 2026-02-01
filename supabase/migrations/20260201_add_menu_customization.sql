-- Run this migration in Supabase SQL Editor
-- Add menu customization columns to shop_settings

ALTER TABLE shop_settings 
ADD COLUMN IF NOT EXISTS menu_primary_color TEXT DEFAULT '#f97316',
ADD COLUMN IF NOT EXISTS menu_secondary_color TEXT DEFAULT '#ea580c',
ADD COLUMN IF NOT EXISTS menu_background_color TEXT DEFAULT '#fffbeb',
ADD COLUMN IF NOT EXISTS menu_text_color TEXT DEFAULT '#1c1917',
ADD COLUMN IF NOT EXISTS menu_items_per_row INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS menu_show_category_header BOOLEAN DEFAULT true;

-- Comments for documentation
COMMENT ON COLUMN shop_settings.menu_primary_color IS 'Primary accent color for public menu (header, buttons)';
COMMENT ON COLUMN shop_settings.menu_secondary_color IS 'Secondary accent color for public menu (category pills)';
COMMENT ON COLUMN shop_settings.menu_background_color IS 'Background color for public menu';
COMMENT ON COLUMN shop_settings.menu_text_color IS 'Text color for public menu';
COMMENT ON COLUMN shop_settings.menu_items_per_row IS 'Number of items per row (1, 2, or 3)';
COMMENT ON COLUMN shop_settings.menu_show_category_header IS 'Show category headers in public menu';
