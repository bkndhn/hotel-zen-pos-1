-- Fix security issues by setting proper search paths

-- Update the update_updated_at_column function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Update the handle_new_user function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    'user'
  );
  RETURN NEW;
END;
$$;

-- Update the generate_bill_number function
CREATE OR REPLACE FUNCTION public.generate_bill_number()
RETURNS TEXT 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  next_number INTEGER;
  bill_number TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(bill_no FROM 5) AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.bills
  WHERE bill_no LIKE 'BILL%';
  
  bill_number := 'BILL' || LPAD(next_number::TEXT, 6, '0');
  RETURN bill_number;
END;
$$;