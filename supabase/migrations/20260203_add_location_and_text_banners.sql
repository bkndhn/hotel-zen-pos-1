-- Migration: Add location and text-only banner support
-- Date: 2026-02-03
-- Description: Adds shop location coordinates to shop_settings and text-only banner fields to promo_banners

-- Add shop location columns to shop_settings
ALTER TABLE shop_settings
ADD COLUMN IF NOT EXISTS shop_latitude DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS shop_longitude DOUBLE PRECISION;

-- Add text-only banner fields to promo_banners
ALTER TABLE promo_banners
ADD COLUMN IF NOT EXISTS is_text_only BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS text_color VARCHAR(9) DEFAULT '#ffffff',
ADD COLUMN IF NOT EXISTS bg_color VARCHAR(9) DEFAULT '#22c55e';

-- Add comment for documentation
COMMENT ON COLUMN shop_settings.shop_latitude IS 'Shop latitude for Google Maps integration';
COMMENT ON COLUMN shop_settings.shop_longitude IS 'Shop longitude for Google Maps integration';
COMMENT ON COLUMN promo_banners.is_text_only IS 'Whether banner is text-only (no image)';
COMMENT ON COLUMN promo_banners.text_color IS 'Text color for text-only banners (hex)';
COMMENT ON COLUMN promo_banners.bg_color IS 'Background color for text-only banners (hex)';
