-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create enum for payment methods
CREATE TYPE public.payment_method AS ENUM ('cash', 'upi', 'card', 'other');

-- Create profiles table for user management
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create items table
CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  image_url TEXT,
  category TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bills table
CREATE TABLE public.bills (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_no TEXT NOT NULL UNIQUE,
  total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
  discount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  payment_mode public.payment_method NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bill_items table
CREATE TABLE public.bill_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  total NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create expenses table
CREATE TABLE public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  category TEXT NOT NULL,
  note TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- RLS Policies for items
CREATE POLICY "Everyone can view active items" ON public.items FOR SELECT TO authenticated USING (is_active = true);
CREATE POLICY "Admins can manage items" ON public.items FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for bills
CREATE POLICY "Users can view all bills" ON public.bills FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create bills" ON public.bills FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can manage all bills" ON public.bills FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for bill_items
CREATE POLICY "Users can view bill items" ON public.bill_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create bill items" ON public.bill_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Admins can manage bill items" ON public.bill_items FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- RLS Policies for expenses
CREATE POLICY "Users can view all expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create expenses" ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Admins can manage all expenses" ON public.expenses FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'));

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for timestamp updates
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create profile when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to generate bill number
CREATE OR REPLACE FUNCTION public.generate_bill_number()
RETURNS TEXT AS $$
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
$$ LANGUAGE plpgsql;

-- Insert some sample items
INSERT INTO public.items (name, price, category) VALUES
  ('Room Service - Breakfast', 299.00, 'Food & Beverage'),
  ('Room Service - Lunch', 399.00, 'Food & Beverage'),
  ('Room Service - Dinner', 499.00, 'Food & Beverage'),
  ('Laundry Service', 150.00, 'Services'),
  ('Mini Bar - Soft Drink', 80.00, 'Beverages'),
  ('Mini Bar - Water Bottle', 30.00, 'Beverages'),
  ('Spa Service - 1 Hour', 1500.00, 'Wellness'),
  ('WiFi Premium', 200.00, 'Technology'),
  ('Airport Transfer', 800.00, 'Transportation'),
  ('Extra Towels', 50.00, 'Amenities');
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

-- First, let's update the role system to support super_admin, admin, and user roles
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Add hotel_name to profiles table for admin identification
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS hotel_name TEXT,
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted'));

-- Create categories table for item management
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users NOT NULL
);

-- Enable RLS on categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Categories policies - only admins and super_admins can manage categories
CREATE POLICY "Admins can manage categories" ON public.categories
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.user_id = auth.uid() 
        AND profiles.role IN ('admin', 'super_admin')
    )
);

-- Add sale_count to items table to track frequently billed items
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS sale_count INTEGER DEFAULT 0;

-- Add admin_id to scope data per admin (except for super_admin)
ALTER TABLE items 
ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES auth.users;

ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES auth.users;

ALTER TABLE bills 
ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES auth.users;

-- Update items policies for data isolation
DROP POLICY IF EXISTS "Everyone can view active items" ON public.items;
DROP POLICY IF EXISTS "Admins can manage items" ON public.items;

CREATE POLICY "Users can view items from their admin" ON public.items
FOR SELECT USING (
    is_active = true AND (
        admin_id = auth.uid() OR 
        admin_id IN (
            SELECT user_id FROM profiles 
            WHERE role = 'admin' AND user_id = (
                SELECT admin_id FROM profiles WHERE user_id = auth.uid()
            )
        ) OR
        EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin')
    )
);

CREATE POLICY "Admins can manage their items" ON public.items
FOR ALL USING (
    admin_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- Update expenses policies for data isolation
DROP POLICY IF EXISTS "Admins can manage all expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view all expenses" ON public.expenses;

CREATE POLICY "Users can view expenses from their admin" ON public.expenses
FOR SELECT USING (
    admin_id = auth.uid() OR 
    admin_id IN (
        SELECT user_id FROM profiles 
        WHERE role = 'admin' AND user_id = (
            SELECT admin_id FROM profiles WHERE user_id = auth.uid()
        )
    ) OR
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Admins can manage their expenses" ON public.expenses
FOR ALL USING (
    admin_id = auth.uid() OR 
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- Update bills policies for data isolation
DROP POLICY IF EXISTS "Admins can manage all bills" ON public.bills;
DROP POLICY IF EXISTS "Users can create bills" ON public.bills;
DROP POLICY IF EXISTS "Users can view all bills" ON public.bills;

CREATE POLICY "Users can view bills from their admin" ON public.bills
FOR SELECT USING (
    admin_id = created_by OR 
    admin_id IN (
        SELECT user_id FROM profiles 
        WHERE role = 'admin' AND user_id = (
            SELECT admin_id FROM profiles WHERE user_id = auth.uid()
        )
    ) OR
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Admins can manage their bills" ON public.bills
FOR ALL USING (
    admin_id = created_by OR 
    EXISTS (SELECT 1 FROM profiles WHERE user_id = auth.uid() AND role = 'super_admin')
);

-- Function to increment item sale count
CREATE OR REPLACE FUNCTION public.increment_item_sale_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE items 
    SET sale_count = sale_count + NEW.quantity,
        updated_at = now()
    WHERE id = NEW.item_id;
    RETURN NEW;
END;
$$;

-- Trigger to auto-increment sale count when bill items are added
DROP TRIGGER IF EXISTS increment_sale_count_trigger ON bill_items;
CREATE TRIGGER increment_sale_count_trigger
    AFTER INSERT ON bill_items
    FOR EACH ROW EXECUTE FUNCTION increment_item_sale_count();

-- Update the handle_new_user function to support hotel_name and admin assignment
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (user_id, name, role, hotel_name, status)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
        COALESCE(NEW.raw_user_meta_data->>'role', 'user')::app_role,
        NEW.raw_user_meta_data->>'hotel_name',
        CASE 
            WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'user') = 'admin' THEN 'paused'
            ELSE 'active'
        END
    );
    RETURN NEW;
END;
$$;

-- Set up the super admin account
-- First, we need to create a function to set a user as super admin
CREATE OR REPLACE FUNCTION public.set_super_admin(admin_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_uuid UUID;
BEGIN
    -- Find the user by email in auth.users
    SELECT id INTO user_uuid 
    FROM auth.users 
    WHERE email = admin_email;
    
    IF user_uuid IS NOT NULL THEN
        -- Update or insert the profile as super_admin
        INSERT INTO profiles (user_id, name, role, status, hotel_name)
        VALUES (user_uuid, 'Super Admin', 'super_admin', 'active', 'System Admin')
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            role = 'super_admin',
            status = 'active',
            hotel_name = 'System Admin',
            updated_at = now();
    END IF;
END;
$$;

-- Call the function to set the super admin (this will only work if the user exists)
-- The user with email bknqwe19@gmail.com will be set as super admin when they sign up
SELECT set_super_admin('bknqwe19@gmail.com');

-- Create a trigger function that automatically sets specific emails as super admin
CREATE OR REPLACE FUNCTION public.check_super_admin_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if the new user's email matches the super admin email
    IF NEW.email = 'bknqwe19@gmail.com' THEN
        -- Update the profile to super_admin role immediately
        UPDATE profiles 
        SET role = 'super_admin', 
            status = 'active', 
            hotel_name = 'System Admin',
            updated_at = now()
        WHERE user_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to automatically set super admin on signup
DROP TRIGGER IF EXISTS check_super_admin_trigger ON auth.users;
CREATE TRIGGER check_super_admin_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION check_super_admin_on_signup();

-- Add missing columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hotel_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Update the existing enum to include super_admin
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Update profiles table to use the app_role enum
ALTER TABLE profiles ALTER COLUMN role TYPE app_role USING role::app_role;

-- Create function to delete user and all related data
CREATE OR REPLACE FUNCTION public.delete_user_and_data(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete from all related tables in correct order
  DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE created_by = uid);
  DELETE FROM bills WHERE created_by = uid;
  DELETE FROM expenses WHERE created_by = uid;
  DELETE FROM profiles WHERE user_id = uid;
  
  -- Finally delete from auth.users
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Update the handle_new_user function to include hotel_name and status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role, hotel_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    CASE 
      WHEN NEW.email = 'bknqwe19@gmail.com' THEN 'super_admin'::app_role
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'user')::app_role
    END,
    COALESCE(NEW.raw_user_meta_data->>'hotel_name', NULL),
    CASE 
      WHEN NEW.email = 'bknqwe19@gmail.com' THEN 'active'
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'user') = 'admin' THEN 'paused'
      ELSE 'active'
    END
  );
  RETURN NEW;
END;
$$;

-- Add missing columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hotel_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Update the app_role enum to include super_admin
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Create the delete_user_and_data function
CREATE OR REPLACE FUNCTION public.delete_user_and_data(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete user's bills and related data
  DELETE FROM public.bill_items WHERE bill_id IN (
    SELECT id FROM public.bills WHERE created_by = uid
  );
  DELETE FROM public.bills WHERE created_by = uid;
  
  -- Delete user's expenses
  DELETE FROM public.expenses WHERE created_by = uid;
  
  -- Delete user's items (if they created any)
  DELETE FROM public.items WHERE id IN (
    SELECT i.id FROM public.items i 
    JOIN public.profiles p ON p.user_id = uid 
    WHERE p.role = 'admin'
  );
  
  -- Delete user's profile
  DELETE FROM public.profiles WHERE user_id = uid;
  
  -- Delete the user from auth.users
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Create a trigger function to automatically create profiles when users sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role, status, hotel_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'User'),
    COALESCE((new.raw_user_meta_data->>'role')::app_role, 'user'::app_role),
    CASE 
      WHEN COALESCE(new.raw_user_meta_data->>'role', 'user') = 'admin' THEN 'paused'
      ELSE 'active' 
    END,
    new.raw_user_meta_data->>'hotel_name'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Fix the handle_new_user trigger function to be more robust
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Insert into profiles with proper error handling
  INSERT INTO public.profiles (user_id, name, role, status, hotel_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email, 'User'),
    CASE 
      WHEN NEW.raw_user_meta_data->>'role' = 'admin' THEN 'admin'::app_role
      WHEN NEW.raw_user_meta_data->>'role' = 'super_admin' THEN 'super_admin'::app_role  
      ELSE 'user'::app_role
    END,
    CASE 
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'user') = 'admin' THEN 'paused'
      ELSE 'active' 
    END,
    NEW.raw_user_meta_data->>'hotel_name'
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block user creation
    RAISE LOG 'Error in handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure the trigger exists and is properly configured
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW 
  EXECUTE FUNCTION public.handle_new_user();

-- Add missing updated_at triggers for existing tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Add updated_at triggers where missing
DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_items_updated_at ON public.items;
CREATE TRIGGER update_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_expenses_updated_at ON public.expenses;
CREATE TRIGGER update_expenses_updated_at
  BEFORE UPDATE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

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

-- First, let's update the categories table to ensure it has all required columns
-- and add any missing columns if needed
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Create trigger for updating updated_at
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_categories_updated_at_trigger ON public.categories;
CREATE TRIGGER update_categories_updated_at_trigger
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION update_categories_updated_at();

-- Update RLS policies for categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Everyone can view active categories" ON public.categories;

-- Admin can manage all categories (including deleted ones)
CREATE POLICY "Admins can manage categories" 
ON public.categories FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'::app_role
  )
);

-- Everyone can view only active (non-deleted) categories
CREATE POLICY "Everyone can view active categories" 
ON public.categories FOR SELECT 
TO authenticated 
USING (is_deleted = false);

-- Create new table for item categories
CREATE TABLE public.item_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add Row Level Security (RLS) to item_categories
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;

-- Create policies for item_categories (same as existing categories)
CREATE POLICY "Admins can manage item categories" 
  ON public.item_categories 
  FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'::app_role
  ));

CREATE POLICY "Everyone can view active item categories" 
  ON public.item_categories 
  FOR SELECT 
  USING (is_deleted = false);

-- Rename existing categories table to expense_categories
ALTER TABLE public.categories RENAME TO expense_categories;

-- Create trigger for item_categories updated_at
CREATE TRIGGER update_item_categories_updated_at
  BEFORE UPDATE ON public.item_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_categories_updated_at();
-- Create function to generate unique bill numbers
CREATE OR REPLACE FUNCTION public.generate_bill_number()
RETURNS text
LANGUAGE plpgsql
SECURITY definer
AS $$
DECLARE
    bill_number text;
    counter integer;
    date_prefix text;
BEGIN
    -- Get today's date in YYYYMMDD format
    date_prefix := to_char(CURRENT_DATE, 'YYYYMMDD');
    
    -- Get count of bills created today and add 1
    SELECT COALESCE(COUNT(*) + 1, 1) INTO counter
    FROM bills 
    WHERE date = CURRENT_DATE;
    
    -- Format: YYYYMMDD001, YYYYMMDD002, etc.
    bill_number := date_prefix || LPAD(counter::text, 3, '0');
    
    RETURN bill_number;
END;
$$;

-- Create function to delete user and all related data
CREATE OR REPLACE FUNCTION public.delete_user_and_data(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
    -- Delete user preferences
    DELETE FROM user_preferences WHERE user_id = uid;
    
    -- Delete expenses created by this user
    DELETE FROM expenses WHERE created_by = uid;
    
    -- Delete bills created by this user (this will cascade to bill_items)
    DELETE FROM bills WHERE created_by = uid;
    
    -- Delete items created by this admin
    DELETE FROM items WHERE admin_id = uid;
    
    -- Delete expense categories (if admin)
    -- Note: We don't delete these as they might be used by other users
    
    -- Delete the profile
    DELETE FROM profiles WHERE user_id = uid;
    
    -- Note: We don't delete from auth.users as that's managed by Supabase Auth
    -- The auth user will be soft-deleted by Supabase's admin functions
END;
$$;
-- Fix security issues by setting search_path for functions

-- Update generate_bill_number function with proper search_path
CREATE OR REPLACE FUNCTION public.generate_bill_number()
RETURNS text
LANGUAGE plpgsql
SECURITY definer
SET search_path = public
AS $$
DECLARE
    bill_number text;
    counter integer;
    date_prefix text;
BEGIN
    -- Get today's date in YYYYMMDD format
    date_prefix := to_char(CURRENT_DATE, 'YYYYMMDD');
    
    -- Get count of bills created today and add 1
    SELECT COALESCE(COUNT(*) + 1, 1) INTO counter
    FROM bills 
    WHERE date = CURRENT_DATE;
    
    -- Format: YYYYMMDD001, YYYYMMDD002, etc.
    bill_number := date_prefix || LPAD(counter::text, 3, '0');
    
    RETURN bill_number;
END;
$$;

-- Update delete_user_and_data function with proper search_path
CREATE OR REPLACE FUNCTION public.delete_user_and_data(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY definer
SET search_path = public
AS $$
BEGIN
    -- Delete user preferences
    DELETE FROM user_preferences WHERE user_id = uid;
    
    -- Delete expenses created by this user
    DELETE FROM expenses WHERE created_by = uid;
    
    -- Delete bills created by this user (this will cascade to bill_items)
    DELETE FROM bills WHERE created_by = uid;
    
    -- Delete items created by this admin
    DELETE FROM items WHERE admin_id = uid;
    
    -- Delete expense categories (if admin)
    -- Note: We don't delete these as they might be used by other users
    
    -- Delete the profile
    DELETE FROM profiles WHERE user_id = uid;
    
    -- Note: We don't delete from auth.users as that's managed by Supabase Auth
    -- The auth user will be soft-deleted by Supabase's admin functions
END;
$$;
-- Activate the user account
UPDATE profiles 
SET status = 'active', updated_at = now()
WHERE user_id = '01deff0f-46bb-4a0a-af9f-d93d3c3eb7bb';
-- Add new fields to items table for enhanced item management
ALTER TABLE public.items 
ADD COLUMN description TEXT,
ADD COLUMN purchase_rate NUMERIC,
ADD COLUMN unit TEXT DEFAULT 'Piece (pc)',
ADD COLUMN base_value NUMERIC DEFAULT 1,  
ADD COLUMN stock_quantity NUMERIC DEFAULT 0,
ADD COLUMN minimum_stock_alert NUMERIC DEFAULT 0,
ADD COLUMN quantity_step NUMERIC DEFAULT 1;

-- Add comment to explain the new fields
COMMENT ON COLUMN public.items.description IS 'Item description for better identification';
COMMENT ON COLUMN public.items.purchase_rate IS 'Cost price or purchase rate of the item';
COMMENT ON COLUMN public.items.unit IS 'Unit of measurement (e.g., Piece, Kg, Liter)';
COMMENT ON COLUMN public.items.base_value IS 'Base value for unit calculations';
COMMENT ON COLUMN public.items.stock_quantity IS 'Current stock quantity available';
COMMENT ON COLUMN public.items.minimum_stock_alert IS 'Minimum stock level for alerts';
COMMENT ON COLUMN public.items.quantity_step IS 'Step increment for quantity adjustments in billing';
-- Create additional_charges table for custom charges configuration
CREATE TABLE public.additional_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('fixed', 'per_unit', 'percentage')),
  amount NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create display_settings table for billing page display configuration  
CREATE TABLE public.display_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  items_per_row INTEGER NOT NULL DEFAULT 3,
  category_order TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create storage bucket for item images
INSERT INTO storage.buckets (id, name, public) VALUES ('item-images', 'item-images', true);

-- Enable RLS on additional_charges
ALTER TABLE public.additional_charges ENABLE ROW LEVEL SECURITY;

-- Create policies for additional_charges
CREATE POLICY "Admins can manage additional charges" 
ON public.additional_charges 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.user_id = auth.uid() 
  AND profiles.role IN ('admin', 'super_admin')
));

CREATE POLICY "Everyone can view active additional charges" 
ON public.additional_charges 
FOR SELECT 
USING (is_active = true);

-- Enable RLS on display_settings
ALTER TABLE public.display_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for display_settings
CREATE POLICY "Users can manage their own display settings" 
ON public.display_settings 
FOR ALL 
USING (auth.uid() = user_id);

-- Create policies for item images storage
CREATE POLICY "Users can upload item images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'item-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Everyone can view item images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'item-images');

CREATE POLICY "Admins can update item images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'item-images' AND EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.user_id = auth.uid() 
  AND profiles.role IN ('admin', 'super_admin')
));

CREATE POLICY "Admins can delete item images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'item-images' AND EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.user_id = auth.uid() 
  AND profiles.role IN ('admin', 'super_admin')
));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_additional_charges_updated_at
BEFORE UPDATE ON public.additional_charges
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_display_settings_updated_at
BEFORE UPDATE ON public.display_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Add payment_details column to bills table to store split payment information
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}';

-- Add additional_charges column to bills table to store additional charges applied
ALTER TABLE bills ADD COLUMN IF NOT EXISTS additional_charges JSONB DEFAULT '[]';

-- Add comment for documentation
COMMENT ON COLUMN bills.payment_details IS 'Stores split payment information as JSON, e.g., {"cash": 100, "card": 50}';
COMMENT ON COLUMN bills.additional_charges IS 'Stores additional charges applied to the bill as JSON array';
-- Create user_permissions table for page-level access control
CREATE TABLE public.user_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  page_name TEXT NOT NULL,
  has_access BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, page_name)
);

-- Enable Row Level Security
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins can view all permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can insert permissions"
ON public.user_permissions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can update permissions"
ON public.user_permissions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete permissions"
ON public.user_permissions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Users can view their own permissions"
ON public.user_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_user_permissions_updated_at
BEFORE UPDATE ON public.user_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create bluetooth_settings table for printer configuration
CREATE TABLE public.bluetooth_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  printer_name TEXT,
  auto_print BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.bluetooth_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for bluetooth_settings
CREATE POLICY "Users can view their own bluetooth settings"
ON public.bluetooth_settings
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own bluetooth settings"
ON public.bluetooth_settings
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own bluetooth settings"
ON public.bluetooth_settings
FOR UPDATE
TO authenticated
USING (user_id = auth.uid());

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_bluetooth_settings_updated_at
BEFORE UPDATE ON public.bluetooth_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- Create a function to handle bill creation and stock deduction atomically
create or replace function create_bill_transaction(
  p_bill_no text,
  p_created_by uuid,
  p_date timestamp with time zone,
  p_discount numeric,
  p_payment_mode payment_method,
  p_payment_details jsonb,
  p_additional_charges jsonb,
  p_total_amount numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_bill_id uuid;
  v_item jsonb;
  v_current_stock numeric;
begin
  -- 1. Insert the bill
  insert into bills (
    bill_no,
    created_by,
    date,
    discount,
    payment_mode,
    payment_details,
    additional_charges,
    total_amount,
    is_deleted,
    is_edited
  ) values (
    p_bill_no,
    p_created_by,
    p_date,
    p_discount,
    p_payment_mode,
    p_payment_details,
    p_additional_charges,
    p_total_amount,
    false,
    false
  )
  returning id into v_bill_id;

  -- 2. Process each item
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Insert bill item
    insert into bill_items (
      bill_id,
      item_id,
      price,
      quantity,
      total
    ) values (
      v_bill_id,
      (v_item->>'item_id')::uuid,
      (v_item->>'price')::numeric,
      (v_item->>'quantity')::numeric,
      (v_item->>'total')::numeric
    );

    -- Deduct stock
    update items
    set stock_quantity = stock_quantity - (v_item->>'quantity')::numeric,
        sale_count = coalesce(sale_count, 0) + (v_item->>'quantity')::numeric
    where id = (v_item->>'item_id')::uuid;
  end loop;

  -- 3. Return the created bill id
  return jsonb_build_object('id', v_bill_id);
end;
$$;
-- Add admin_id column to profiles for sub-user hierarchy
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_admin_id ON public.profiles(admin_id);

-- Create a function to check if user or their parent admin is paused
CREATE OR REPLACE FUNCTION public.is_user_allowed_to_login(p_user_id uuid)
RETURNS TABLE(allowed boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_status text;
  v_user_role text;
  v_admin_id uuid;
  v_admin_status text;
BEGIN
  -- Get user's status and role
  SELECT status, role, admin_id INTO v_user_status, v_user_role, v_admin_id
  FROM public.profiles
  WHERE user_id = p_user_id;

  -- If no profile found
  IF v_user_status IS NULL THEN
    RETURN QUERY SELECT true, 'new_user'::text;
    RETURN;
  END IF;

  -- Check user's own status
  IF v_user_status = 'paused' THEN
    RETURN QUERY SELECT false, 'Account paused'::text;
    RETURN;
  END IF;

  IF v_user_status = 'deleted' THEN
    RETURN QUERY SELECT false, 'Account deleted'::text;
    RETURN;
  END IF;

  -- For sub-users, check if their parent admin is paused
  IF v_user_role = 'user' AND v_admin_id IS NOT NULL THEN
    SELECT status INTO v_admin_status
    FROM public.profiles
    WHERE id = v_admin_id;

    IF v_admin_status = 'paused' THEN
      RETURN QUERY SELECT false, 'Account paused by Super Admin'::text;
      RETURN;
    END IF;

    IF v_admin_status = 'deleted' THEN
      RETURN QUERY SELECT false, 'Parent admin account deleted'::text;
      RETURN;
    END IF;
  END IF;

  -- User is allowed
  RETURN QUERY SELECT true, 'active'::text;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_user_allowed_to_login(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_allowed_to_login(uuid) TO anon;
-- Add admin_id to bills table for data isolation
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_bills_admin_id ON public.bills(admin_id);

-- Add admin_id to item_categories for data isolation
ALTER TABLE public.item_categories ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_item_categories_admin_id ON public.item_categories(admin_id);

-- Add admin_id to expense_categories for data isolation  
ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_expense_categories_admin_id ON public.expense_categories(admin_id);

-- Add admin_id to additional_charges for data isolation
ALTER TABLE public.additional_charges ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_additional_charges_admin_id ON public.additional_charges(admin_id);

-- Add admin_id to payments for data isolation
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_admin_id ON public.payments(admin_id);

-- Helper function to get the admin_id for current user (handles both admins and sub-users)
CREATE OR REPLACE FUNCTION public.get_user_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- If user is an admin, return their profile id
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
    THEN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    -- If user is a sub-user, return their admin_id
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'user' AND admin_id IS NOT NULL)
    THEN (SELECT admin_id FROM public.profiles WHERE user_id = auth.uid())
    -- Super admin sees nothing via this function (they have separate policies)
    ELSE NULL
  END
$$;

-- Function to check if user is super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
$$;

-- Function to check if user is admin or super_admin
CREATE OR REPLACE FUNCTION public.is_admin_or_super()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
$$;

-- ====== UPDATE RLS POLICIES FOR DATA ISOLATION ======

-- ITEMS: Drop old policies and create new ones with admin isolation
DROP POLICY IF EXISTS "Admins can manage items" ON public.items;
DROP POLICY IF EXISTS "Everyone can view active items" ON public.items;

CREATE POLICY "Admins can manage their own items"
ON public.items FOR ALL
USING (
  admin_id = public.get_user_admin_id() 
  OR public.is_super_admin()
);

CREATE POLICY "Users can view their admin items"
ON public.items FOR SELECT
USING (
  is_active = true 
  AND (admin_id = public.get_user_admin_id() OR admin_id IS NULL)
);

-- BILLS: Drop old policies and create new ones with admin isolation
DROP POLICY IF EXISTS "Admins can manage all bills" ON public.bills;
DROP POLICY IF EXISTS "Users can create bills" ON public.bills;
DROP POLICY IF EXISTS "Users can view all bills" ON public.bills;

CREATE POLICY "Admins can manage their own bills"
ON public.bills FOR ALL
USING (
  admin_id = public.get_user_admin_id() 
  OR public.is_super_admin()
);

CREATE POLICY "Users can create bills for their admin"
ON public.bills FOR INSERT
WITH CHECK (
  auth.uid() = created_by
);

CREATE POLICY "Users can view their admin bills"
ON public.bills FOR SELECT
USING (
  admin_id = public.get_user_admin_id() 
  OR admin_id IS NULL 
  OR public.is_super_admin()
);

-- EXPENSES: Drop old policies and create new ones with admin isolation
DROP POLICY IF EXISTS "Admins can manage all expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view all expenses" ON public.expenses;

CREATE POLICY "Admins can manage their own expenses"
ON public.expenses FOR ALL
USING (
  admin_id = public.get_user_admin_id() 
  OR public.is_super_admin()
);

CREATE POLICY "Users can create expenses for their admin"
ON public.expenses FOR INSERT
WITH CHECK (
  auth.uid() = created_by
);

CREATE POLICY "Users can view their admin expenses"
ON public.expenses FOR SELECT
USING (
  admin_id = public.get_user_admin_id() 
  OR admin_id IS NULL 
  OR public.is_super_admin()
);

-- ITEM CATEGORIES: Update for admin isolation
DROP POLICY IF EXISTS "Admins can manage categories" ON public.item_categories;
DROP POLICY IF EXISTS "Everyone can view active categories" ON public.item_categories;

CREATE POLICY "Admins can manage their own categories"
ON public.item_categories FOR ALL
USING (
  admin_id = public.get_user_admin_id() 
  OR public.is_super_admin()
  OR admin_id IS NULL
);

CREATE POLICY "Users can view their admin categories"
ON public.item_categories FOR SELECT
USING (
  is_deleted = false 
  AND (admin_id = public.get_user_admin_id() OR admin_id IS NULL)
);

-- EXPENSE CATEGORIES: Update for admin isolation
DROP POLICY IF EXISTS "Admins can manage expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Everyone can view active expense categories" ON public.expense_categories;

CREATE POLICY "Admins can manage their own expense categories"
ON public.expense_categories FOR ALL
USING (
  admin_id = public.get_user_admin_id() 
  OR public.is_super_admin()
  OR admin_id IS NULL
);

CREATE POLICY "Users can view their admin expense categories"
ON public.expense_categories FOR SELECT
USING (
  is_deleted = false 
  AND (admin_id = public.get_user_admin_id() OR admin_id IS NULL)
);

-- ADDITIONAL CHARGES: Update for admin isolation
DROP POLICY IF EXISTS "Admins can manage additional charges" ON public.additional_charges;
DROP POLICY IF EXISTS "Everyone can view active additional charges" ON public.additional_charges;

CREATE POLICY "Admins can manage their own additional charges"
ON public.additional_charges FOR ALL
USING (
  admin_id = public.get_user_admin_id() 
  OR public.is_super_admin()
  OR admin_id IS NULL
);

CREATE POLICY "Users can view their admin additional charges"
ON public.additional_charges FOR SELECT
USING (
  is_active = true 
  AND (admin_id = public.get_user_admin_id() OR admin_id IS NULL)
);

-- PAYMENTS: Update for admin isolation
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Everyone can view active payments" ON public.payments;

CREATE POLICY "Admins can manage their own payments"
ON public.payments FOR ALL
USING (
  admin_id = public.get_user_admin_id() 
  OR public.is_super_admin()
  OR admin_id IS NULL
);

CREATE POLICY "Users can view their admin payments"
ON public.payments FOR SELECT
USING (
  is_disabled = false 
  AND (admin_id = public.get_user_admin_id() OR admin_id IS NULL)
);

-- ====== PROFILES POLICIES: Super Admin can manage admins ======
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- Super Admin can view all profiles
CREATE POLICY "Super admins can view all profiles"
ON public.profiles FOR SELECT
USING (
  public.is_super_admin()
);

-- Admins can view their own profile and sub-users
CREATE POLICY "Admins can view own and sub-user profiles"
ON public.profiles FOR SELECT
USING (
  user_id = auth.uid() 
  OR admin_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Users can view their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (user_id = auth.uid());

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Admins can insert sub-user profiles
CREATE POLICY "Admins can insert sub-user profiles"
ON public.profiles FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
USING (user_id = auth.uid());

-- Super Admin can update admin profiles (pause/delete)
CREATE POLICY "Super admins can update admin profiles"
ON public.profiles FOR UPDATE
USING (
  public.is_super_admin() AND role = 'admin'
);

-- Admins can update their sub-user profiles
CREATE POLICY "Admins can update sub-user profiles"
ON public.profiles FOR UPDATE
USING (
  admin_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_user_admin_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super() TO authenticated;
-- =============================================
-- FIX: Update RLS policies to be more permissive for data access
-- Applied on 2026-01-22
-- =============================================

-- Drop the restrictive profiles policies and recreate with proper access
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view own and sub-user profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Create a single comprehensive SELECT policy for profiles
CREATE POLICY "Users can view relevant profiles"
ON public.profiles FOR SELECT
USING (
  -- Super admins see all
  public.is_super_admin()
  -- Admins see themselves and their sub-users
  OR user_id = auth.uid()
  OR admin_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
);

-- Fix bills policies to handle NULL admin_id gracefully
DROP POLICY IF EXISTS "Admins can manage their own bills" ON public.bills;
DROP POLICY IF EXISTS "Users can view their admin bills" ON public.bills;
DROP POLICY IF EXISTS "Users can create bills for their admin" ON public.bills;

CREATE POLICY "Users can view and manage bills"
ON public.bills FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR (admin_id IS NULL AND created_by = auth.uid())
  OR (admin_id IS NULL AND public.is_admin_or_super())
);

-- Fix expenses policies
DROP POLICY IF EXISTS "Admins can manage their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view their admin expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create expenses for their admin" ON public.expenses;

CREATE POLICY "Users can view and manage expenses"
ON public.expenses FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = (SELECT user_id FROM public.profiles WHERE id = public.get_user_admin_id())
  OR (admin_id IS NULL AND created_by = auth.uid())
  OR (admin_id IS NULL AND public.is_admin_or_super())
  OR admin_id = auth.uid()
);

-- Fix items policies
DROP POLICY IF EXISTS "Admins can manage their own items" ON public.items;
DROP POLICY IF EXISTS "Users can view their admin items" ON public.items;

CREATE POLICY "Users can view and manage items"
ON public.items FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR admin_id IS NULL
);

-- Fix item_categories policies
DROP POLICY IF EXISTS "Admins can manage their own categories" ON public.item_categories;
DROP POLICY IF EXISTS "Users can view their admin categories" ON public.item_categories;

CREATE POLICY "Users can view and manage item categories"
ON public.item_categories FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR admin_id IS NULL
);

-- Fix expense_categories policies
DROP POLICY IF EXISTS "Admins can manage their own expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can view their admin expense categories" ON public.expense_categories;

CREATE POLICY "Users can view and manage expense categories"
ON public.expense_categories FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR admin_id IS NULL
);

-- Fix additional_charges policies
DROP POLICY IF EXISTS "Admins can manage their own additional charges" ON public.additional_charges;
DROP POLICY IF EXISTS "Users can view their admin additional charges" ON public.additional_charges;

CREATE POLICY "Users can view and manage additional charges"
ON public.additional_charges FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR admin_id IS NULL
);

-- Fix payments policies
DROP POLICY IF EXISTS "Admins can manage their own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view their admin payments" ON public.payments;

CREATE POLICY "Users can view and manage payments"
ON public.payments FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR admin_id IS NULL
);

-- =============================================
-- FIX: Correct foreign key constraints
-- items and expenses had FK pointing to auth.users instead of profiles
-- =============================================

ALTER TABLE public.items DROP CONSTRAINT IF EXISTS items_admin_id_fkey;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_admin_id_fkey;

-- Backfill admin_id for all tables
DO $$
DECLARE
  first_admin_id uuid;
BEGIN
  SELECT id INTO first_admin_id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1;
  
  UPDATE public.items SET admin_id = first_admin_id WHERE admin_id IS NULL;
  UPDATE public.item_categories SET admin_id = first_admin_id WHERE admin_id IS NULL;
  UPDATE public.expense_categories SET admin_id = first_admin_id WHERE admin_id IS NULL;
  UPDATE public.additional_charges SET admin_id = first_admin_id WHERE admin_id IS NULL;
  UPDATE public.payments SET admin_id = first_admin_id WHERE admin_id IS NULL;
  UPDATE public.expenses SET admin_id = first_admin_id WHERE admin_id IS NULL;
END $$;

-- Update bills based on creator
UPDATE public.bills b
SET admin_id = COALESCE(
  (SELECT p.admin_id FROM public.profiles p WHERE p.user_id = b.created_by AND p.role = 'user'),
  (SELECT p.id FROM public.profiles p WHERE p.user_id = b.created_by AND p.role = 'admin'),
  (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1)
)
WHERE admin_id IS NULL;

-- Add correct FK constraints
ALTER TABLE public.items 
ADD CONSTRAINT items_admin_id_fkey 
FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.expenses 
ADD CONSTRAINT expenses_admin_id_fkey 
FOREIGN KEY (admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- =============================================
-- FIX: Profiles RLS - Use SECURITY DEFINER functions
-- to avoid infinite recursion
-- =============================================

-- Drop all existing SELECT policies on profiles
DROP POLICY IF EXISTS "Super admins view all" ON public.profiles;
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins view sub-users" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can update admin profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can update sub-user profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view relevant profiles" ON public.profiles;

-- Create helper function to get current user's role WITHOUT triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Create helper function to get current user's profile id WITHOUT triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;

-- Create simple, non-recursive SELECT policies using SECURITY DEFINER functions

-- 1. Users can view their own profile (safe, no subquery needed)
CREATE POLICY "View own profile"
ON public.profiles FOR SELECT
USING (user_id = auth.uid());

-- 2. Super admins can view all profiles (uses function, no table subquery)
CREATE POLICY "Super admin view all"
ON public.profiles FOR SELECT
USING (public.get_my_role() = 'super_admin');

-- 3. Admins can view their sub-users' profiles (uses function, no table subquery)
CREATE POLICY "Admin view sub-users"
ON public.profiles FOR SELECT
USING (admin_id = public.get_my_profile_id());

-- Update policies using the same safe functions
CREATE POLICY "Super admin update any"
ON public.profiles FOR UPDATE
USING (public.get_my_role() = 'super_admin' AND role = 'admin');

CREATE POLICY "Admin update sub-users"
ON public.profiles FOR UPDATE
USING (admin_id = public.get_my_profile_id());
-- =============================================
-- Super Admin Complete Setup Migration
-- Created: 2026-01-23
-- Features:
--   1. Super Admin role with admin management capabilities
--   2. Pause cascade logic (paused admin blocks all sub-users)
--   3. Force logout via realtime subscription
--   4. New admin signups start as 'paused' pending approval
-- =============================================

-- Ensure the 'super_admin' value exists in app_role enum
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'super_admin' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'app_role')) THEN
        ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';
    END IF;
END $$;

-- =============================================
-- FUNCTION: is_user_allowed_to_login
-- Purpose: Check if a user can log in, considering:
--   1. Their own status (paused/deleted)
--   2. Their parent admin's status (for sub-users)
-- =============================================
CREATE OR REPLACE FUNCTION public.is_user_allowed_to_login(p_user_id uuid)
RETURNS TABLE(allowed boolean, reason text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_status text;
  v_user_role text;
  v_admin_id uuid;
  v_admin_status text;
BEGIN
  -- Get user's status and role
  SELECT status, role, admin_id INTO v_user_status, v_user_role, v_admin_id
  FROM public.profiles
  WHERE user_id = p_user_id;

  -- If no profile found - allow login for new users
  IF v_user_status IS NULL THEN
    RETURN QUERY SELECT true, 'new_user'::text;
    RETURN;
  END IF;

  -- Check user's own status
  IF v_user_status = 'paused' THEN
    RETURN QUERY SELECT false, 'Account paused'::text;
    RETURN;
  END IF;

  IF v_user_status = 'deleted' THEN
    RETURN QUERY SELECT false, 'Account deleted'::text;
    RETURN;
  END IF;

  -- For sub-users, check if their parent admin is paused
  IF v_user_role = 'user' AND v_admin_id IS NOT NULL THEN
    SELECT status INTO v_admin_status
    FROM public.profiles
    WHERE id = v_admin_id;

    IF v_admin_status = 'paused' THEN
      RETURN QUERY SELECT false, 'Account paused by Super Admin'::text;
      RETURN;
    END IF;

    IF v_admin_status = 'deleted' THEN
      RETURN QUERY SELECT false, 'Parent admin account deleted'::text;
      RETURN;
    END IF;
  END IF;

  -- User is allowed
  RETURN QUERY SELECT true, 'active'::text;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_user_allowed_to_login(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_user_allowed_to_login(uuid) TO anon;

-- =============================================
-- FUNCTION: is_super_admin
-- Purpose: Check if current user is a super admin
-- =============================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE user_id = auth.uid() AND role = 'super_admin'
  );
$$;

-- =============================================
-- FUNCTION: get_my_role
-- Purpose: Get current user's role without triggering RLS
-- =============================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.profiles WHERE user_id = auth.uid()
$$;

-- =============================================
-- FUNCTION: get_my_profile_id
-- Purpose: Get current user's profile ID without triggering RLS
-- =============================================
CREATE OR REPLACE FUNCTION public.get_my_profile_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid()
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;

-- =============================================
-- RLS POLICIES: Profiles table
-- Purpose: Control who can view/update profiles
-- =============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "View own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admin view all" ON public.profiles;
DROP POLICY IF EXISTS "Admin view sub-users" ON public.profiles;
DROP POLICY IF EXISTS "Super admin update any" ON public.profiles;
DROP POLICY IF EXISTS "Admin update sub-users" ON public.profiles;

-- 1. Users can view their own profile
CREATE POLICY "View own profile"
ON public.profiles FOR SELECT
USING (user_id = auth.uid());

-- 2. Super admins can view all profiles
CREATE POLICY "Super admin view all"
ON public.profiles FOR SELECT
USING (public.get_my_role() = 'super_admin');

-- 3. Admins can view their sub-users' profiles
CREATE POLICY "Admin view sub-users"
ON public.profiles FOR SELECT
USING (admin_id = public.get_my_profile_id());

-- 4. Super admins can update admin profiles (pause/unpause)
CREATE POLICY "Super admin update any"
ON public.profiles FOR UPDATE
USING (public.get_my_role() = 'super_admin' AND role = 'admin');

-- 5. Admins can update their sub-users' profiles
CREATE POLICY "Admin update sub-users"
ON public.profiles FOR UPDATE
USING (admin_id = public.get_my_profile_id());

-- 6. Users can update their own profile
CREATE POLICY "Users update own profile"
ON public.profiles FOR UPDATE
USING (user_id = auth.uid());

-- =============================================
-- Enable Realtime for profiles table
-- Purpose: Allow force logout when admin is paused
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;

-- =============================================
-- NOTES FOR APPLICATION:
-- 
-- 1. New admin signups should have status = 'paused' by default
--    (handled in AuthContext.tsx)
-- 
-- 2. Sub-users should inherit hotel_name from their admin
--    (handled in AuthContext.tsx fetchOrCreateProfile)
-- 
-- 3. Login page should only allow admin signup (no user/staff)
--    (handled in Auth.tsx - staff are added from inside app)
-- 
-- 4. Force logout via Supabase Realtime subscription when:
--    - User's own status changes to 'paused' or 'deleted'
--    - Parent admin's status changes to 'paused' or 'deleted'
--    (handled in AuthContext.tsx useEffect)
-- =============================================
-- =============================================
-- FIX: Allow child users to access their admin's data
-- The issue: Child users need to read their admin's profile to
-- inherit hotel_name and for RLS policies to work correctly
-- Applied on 2026-01-23
-- =============================================

-- Drop existing profiles SELECT policies
DROP POLICY IF EXISTS "View own profile" ON public.profiles;
DROP POLICY IF EXISTS "Super admin view all" ON public.profiles;
DROP POLICY IF EXISTS "Admin view sub-users" ON public.profiles;
DROP POLICY IF EXISTS "Users can view relevant profiles" ON public.profiles;
DROP POLICY IF EXISTS "Child users view admin profile" ON public.profiles;

-- Create helper function to get admin_id for child users WITHOUT triggering RLS
CREATE OR REPLACE FUNCTION public.get_my_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT admin_id FROM public.profiles WHERE user_id = auth.uid() AND role = 'user'
$$;

GRANT EXECUTE ON FUNCTION public.get_my_admin_id() TO authenticated;

-- Create comprehensive profiles SELECT policies

-- 1. Everyone can view their own profile
CREATE POLICY "View own profile"
ON public.profiles FOR SELECT
USING (user_id = auth.uid());

-- 2. Super admins can view all profiles
CREATE POLICY "Super admin view all"
ON public.profiles FOR SELECT
USING (public.get_my_role() = 'super_admin');

-- 3. Admins can view their sub-users' profiles
CREATE POLICY "Admin view sub-users"
ON public.profiles FOR SELECT
USING (admin_id = public.get_my_profile_id());

-- 4. Child users can view their admin's profile (uses SECURITY DEFINER function to avoid recursion)
CREATE POLICY "Child users view admin profile"
ON public.profiles FOR SELECT
USING (id = public.get_my_admin_id());

-- =============================================
-- FIX: Update data table policies to handle edge cases
-- =============================================

-- Drop and recreate items policy with proper handling
DROP POLICY IF EXISTS "Users can view and manage items" ON public.items;
DROP POLICY IF EXISTS "Admins can manage their own items" ON public.items;
DROP POLICY IF EXISTS "Users can view their admin items" ON public.items;

CREATE POLICY "Full items access"
ON public.items FOR ALL
USING (
  -- Super admins can see all
  public.is_super_admin()
  -- Match by admin_id (works for both admins and their sub-users)
  OR admin_id = public.get_user_admin_id()
  -- Fallback for items without admin_id
  OR admin_id IS NULL
);

-- Drop and recreate bills policy
DROP POLICY IF EXISTS "Users can view and manage bills" ON public.bills;
DROP POLICY IF EXISTS "Admins can manage their own bills" ON public.bills;
DROP POLICY IF EXISTS "Users can view their admin bills" ON public.bills;
DROP POLICY IF EXISTS "Users can create bills for their admin" ON public.bills;

CREATE POLICY "Full bills access"
ON public.bills FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR (admin_id IS NULL AND created_by = auth.uid())
  OR admin_id IS NULL
);

-- Drop and recreate item_categories policy
DROP POLICY IF EXISTS "Users can view and manage item categories" ON public.item_categories;
DROP POLICY IF EXISTS "Admins can manage their own categories" ON public.item_categories;
DROP POLICY IF EXISTS "Users can view their admin categories" ON public.item_categories;

CREATE POLICY "Full item categories access"
ON public.item_categories FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR admin_id IS NULL
);

-- Drop and recreate expense_categories policy
DROP POLICY IF EXISTS "Users can view and manage expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Admins can manage their own expense categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can view their admin expense categories" ON public.expense_categories;

CREATE POLICY "Full expense categories access"
ON public.expense_categories FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR admin_id IS NULL
);

-- Drop and recreate expenses policy
DROP POLICY IF EXISTS "Users can view and manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins can manage their own expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can view their admin expenses" ON public.expenses;
DROP POLICY IF EXISTS "Users can create expenses for their admin" ON public.expenses;

CREATE POLICY "Full expenses access"
ON public.expenses FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR (admin_id IS NULL AND created_by = auth.uid())
  OR admin_id IS NULL
);

-- Drop and recreate additional_charges policy
DROP POLICY IF EXISTS "Users can view and manage additional charges" ON public.additional_charges;
DROP POLICY IF EXISTS "Admins can manage their own additional charges" ON public.additional_charges;
DROP POLICY IF EXISTS "Users can view their admin additional charges" ON public.additional_charges;

CREATE POLICY "Full additional charges access"
ON public.additional_charges FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR admin_id IS NULL
);

-- Drop and recreate payments policy
DROP POLICY IF EXISTS "Users can view and manage payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can manage their own payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view their admin payments" ON public.payments;

CREATE POLICY "Full payments access"
ON public.payments FOR ALL
USING (
  public.is_super_admin()
  OR admin_id = public.get_user_admin_id()
  OR admin_id IS NULL
);

-- =============================================
-- Ensure all helper functions exist and have proper permissions
-- =============================================

-- Recreate get_user_admin_id with better logic
CREATE OR REPLACE FUNCTION public.get_user_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- If user is a super_admin, return NULL (they use separate policies)
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'super_admin')
    THEN NULL
    -- If user is an admin, return their profile id
    WHEN EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin')
    THEN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    -- If user is a sub-user, return their admin_id (the admin's profile id)
    ELSE (SELECT admin_id FROM public.profiles WHERE user_id = auth.uid())
  END
$$;

-- Ensure permissions are granted
GRANT EXECUTE ON FUNCTION public.get_user_admin_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_super() TO authenticated;
-- =============================================
-- FIX: Enable Realtime for instant force logout and permission updates
-- Applied on 2026-01-23
-- =============================================

-- Add tables to supabase_realtime publication for instant updates
-- profiles: for force logout when admin/user is paused
-- user_permissions: for instant page access updates

-- First drop if exists to avoid errors, then add
DO $$
BEGIN
  -- Add profiles to realtime
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- Table already in publication
  END;
  
  -- Add user_permissions to realtime
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_permissions;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- Table already in publication
  END;
END $$;
-- =============================================
-- FIX: Allow Super Admin to manage user_permissions
-- Applied on 2026-01-23
-- =============================================

-- Drop existing policies that restrict to just 'admin'
DROP POLICY IF EXISTS "Admins can view all permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can insert permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can update permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can delete permissions" ON user_permissions;

-- Re-create policies including 'super_admin'

-- 1. View: Admins and Super Admins can view all
CREATE POLICY "Admins and Super Admins can view all permissions" 
ON user_permissions FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);

-- 2. Insert: Admins and Super Admins can insert
CREATE POLICY "Admins and Super Admins can insert permissions" 
ON user_permissions FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);

-- 3. Update: Admins and Super Admins can update
CREATE POLICY "Admins and Super Admins can update permissions" 
ON user_permissions FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);

-- 4. Delete: Admins and Super Admins can delete
CREATE POLICY "Admins and Super Admins can delete permissions" 
ON user_permissions FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);
