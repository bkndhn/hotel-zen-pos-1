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