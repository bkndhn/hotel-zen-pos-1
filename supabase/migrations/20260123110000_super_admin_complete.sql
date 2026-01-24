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
