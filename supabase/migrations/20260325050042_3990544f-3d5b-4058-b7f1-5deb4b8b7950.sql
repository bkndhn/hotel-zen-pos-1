
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS order_type text DEFAULT 'dine_in';

ALTER TABLE public.shop_settings ADD COLUMN IF NOT EXISTS show_order_type boolean DEFAULT false;
