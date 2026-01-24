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
