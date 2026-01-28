-- Create customers table for CRM
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES public.profiles(id),
  phone TEXT NOT NULL,
  name TEXT,
  visit_count INTEGER DEFAULT 1,
  total_spent NUMERIC DEFAULT 0,
  last_visit TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(admin_id, phone)
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Create proper RLS policy
CREATE POLICY "Proper customers access"
ON public.customers
FOR ALL
USING (
  is_super_admin() 
  OR admin_id = get_user_admin_id()
);

-- Add index for fast phone lookups
CREATE INDEX IF NOT EXISTS idx_customers_admin_phone ON public.customers(admin_id, phone);

-- Add timestamp trigger
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();