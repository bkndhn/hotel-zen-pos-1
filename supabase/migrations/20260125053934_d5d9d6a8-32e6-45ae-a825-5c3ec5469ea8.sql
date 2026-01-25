-- Create tables table for dine-in restaurant table management
CREATE TABLE public.tables (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES public.profiles(id),
  table_number TEXT NOT NULL,
  table_name TEXT,
  capacity INTEGER DEFAULT 4,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'reserved', 'cleaning')),
  current_bill_id UUID REFERENCES public.bills(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;

-- RLS Policy for tables
CREATE POLICY "Full tables access" ON public.tables FOR ALL 
  USING (is_super_admin() OR (admin_id = get_user_admin_id()) OR (admin_id IS NULL));

-- Add WhatsApp settings columns to shop_settings
ALTER TABLE public.shop_settings 
  ADD COLUMN IF NOT EXISTS whatsapp_bill_share_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_business_api_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_business_api_token TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_business_phone_id TEXT;

-- Add customer_mobile to bills for WhatsApp sharing
ALTER TABLE public.bills 
  ADD COLUMN IF NOT EXISTS customer_mobile TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at TIMESTAMP WITH TIME ZONE;

-- Trigger for updated_at on tables
CREATE TRIGGER update_tables_updated_at
  BEFORE UPDATE ON public.tables
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();