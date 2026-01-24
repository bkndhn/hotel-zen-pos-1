
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
