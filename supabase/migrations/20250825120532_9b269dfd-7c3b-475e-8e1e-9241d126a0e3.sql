
-- Create categories table for expense management
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on categories table
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for categories
CREATE POLICY "Everyone can view active categories" 
  ON public.categories 
  FOR SELECT 
  USING (is_deleted = false);

CREATE POLICY "Admins can manage categories" 
  ON public.categories 
  FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'::app_role
  ));

-- Create payments table for payment type management
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_type TEXT NOT NULL,
  is_disabled BOOLEAN DEFAULT FALSE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on payments table
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for payments
CREATE POLICY "Everyone can view active payments" 
  ON public.payments 
  FOR SELECT 
  USING (is_disabled = false);

CREATE POLICY "Admins can manage payments" 
  ON public.payments 
  FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'::app_role
  ));

-- Insert default payment types
INSERT INTO public.payments (payment_type, is_default) VALUES
  ('cash', true),
  ('upi', false),
  ('card', false),
  ('other', false);

-- Add expense_name field to expenses table
ALTER TABLE public.expenses ADD COLUMN expense_name TEXT;

-- Add triggers for updated_at columns
CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add is_deleted column to bills table for soft delete functionality
ALTER TABLE public.bills ADD COLUMN is_deleted BOOLEAN DEFAULT FALSE;
