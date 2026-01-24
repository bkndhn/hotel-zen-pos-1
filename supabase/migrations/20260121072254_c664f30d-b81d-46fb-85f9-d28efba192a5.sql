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