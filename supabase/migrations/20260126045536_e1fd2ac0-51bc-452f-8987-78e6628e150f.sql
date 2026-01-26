-- CRM Table for storing customer contacts
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  email TEXT,
  total_visits INTEGER DEFAULT 1,
  total_spent NUMERIC DEFAULT 0,
  last_visit_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(admin_id, phone)
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- RLS Policy for admin isolation
CREATE POLICY "Full customers access"
ON public.customers FOR ALL
USING (
  is_super_admin() OR 
  admin_id = get_user_admin_id() OR 
  admin_id IS NULL
);

-- Add bill_number_mode to shop_settings for bill numbering preference
ALTER TABLE public.shop_settings 
ADD COLUMN IF NOT EXISTS bill_number_mode TEXT DEFAULT 'overall',
ADD COLUMN IF NOT EXISTS bill_number_start INTEGER DEFAULT 1;

-- Add table_id to bills for table selection during billing
ALTER TABLE public.bills 
ADD COLUMN IF NOT EXISTS table_id UUID REFERENCES public.tables(id);

-- Add customer_id reference to bills
ALTER TABLE public.bills
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id);

-- Create updated_at trigger for customers
CREATE TRIGGER update_customers_updated_at
BEFORE UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster customer lookups
CREATE INDEX IF NOT EXISTS idx_customers_admin_phone ON public.customers(admin_id, phone);
CREATE INDEX IF NOT EXISTS idx_bills_table_id ON public.bills(table_id);