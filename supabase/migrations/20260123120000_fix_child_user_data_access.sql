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
