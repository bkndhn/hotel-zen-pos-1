-- Add max_sub_users to profiles for admin quota
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_sub_users integer NOT NULL DEFAULT 5;

-- Trigger to enforce sub-user limit when admin creates a sub-user profile
CREATE OR REPLACE FUNCTION public.enforce_sub_user_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max integer;
  v_count integer;
  v_caller_role text;
BEGIN
  -- Only enforce for sub-user (role='user') inserts that have an admin_id
  IF NEW.role <> 'user' OR NEW.admin_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role::text INTO v_caller_role FROM profiles WHERE user_id = auth.uid();
  IF v_caller_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(max_sub_users, 5) INTO v_max FROM profiles WHERE id = NEW.admin_id;
  SELECT COUNT(*) INTO v_count
    FROM profiles
    WHERE admin_id = NEW.admin_id
      AND role = 'user'
      AND COALESCE(status, 'active') <> 'deleted';

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Sub-user limit reached (max %). Contact super admin to increase your limit.', v_max;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_sub_user_limit ON public.profiles;
CREATE TRIGGER trg_enforce_sub_user_limit
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_sub_user_limit();

-- Ensure branch limit trigger is attached (idempotent)
DROP TRIGGER IF EXISTS trg_enforce_branch_limit ON public.branches;
CREATE TRIGGER trg_enforce_branch_limit
BEFORE INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.enforce_branch_limit();

-- Ensure prevent main branch delete trigger is attached
DROP TRIGGER IF EXISTS trg_prevent_main_branch_delete ON public.branches;
CREATE TRIGGER trg_prevent_main_branch_delete
BEFORE DELETE ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.prevent_main_branch_delete();