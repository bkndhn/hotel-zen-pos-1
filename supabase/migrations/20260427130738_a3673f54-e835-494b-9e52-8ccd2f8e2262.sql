-- 1. Add max_branches to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS max_branches integer NOT NULL DEFAULT 1;

-- 2. Add is_main flag to branches
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS is_main boolean NOT NULL DEFAULT false;

-- 3. Auto-create "Main" branch for every admin that doesn't have one yet
INSERT INTO public.branches (admin_id, name, code, is_main, is_default, is_active, shop_name)
SELECT p.id, 'Main', 'MAIN', true, true, true, COALESCE(p.hotel_name, 'Main')
FROM public.profiles p
WHERE p.role = 'admin'
  AND NOT EXISTS (SELECT 1 FROM public.branches b WHERE b.admin_id = p.id);

-- For admins that already had branches, mark one as main
UPDATE public.branches b
SET is_main = true
WHERE b.id = (
  SELECT b2.id FROM public.branches b2
  WHERE b2.admin_id = b.admin_id
  ORDER BY b2.is_default DESC NULLS LAST, b2.created_at ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM public.branches b3 WHERE b3.admin_id = b.admin_id AND b3.is_main = true);

-- 4. Backfill branch_id on data tables that HAVE a branch_id column
DO $$
DECLARE
  v_table text;
  v_tables text[] := ARRAY[
    'bills','items','expenses','customers','payments','tables',
    'additional_charges','tax_rates','table_orders',
    'promo_banners','expense_categories','item_categories'
  ];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    EXECUTE format($f$
      UPDATE public.%I t
      SET branch_id = b.id
      FROM public.branches b
      WHERE t.branch_id IS NULL
        AND b.admin_id = t.admin_id
        AND b.is_main = true
    $f$, v_table);
  END LOOP;
END $$;

-- shop_settings & display_settings link via user_id
UPDATE public.shop_settings s
SET branch_id = b.id
FROM public.profiles p
JOIN public.branches b ON b.admin_id = p.id AND b.is_main = true
WHERE s.branch_id IS NULL AND s.user_id = p.user_id;

UPDATE public.display_settings d
SET branch_id = b.id
FROM public.profiles p
JOIN public.branches b ON b.admin_id = p.id AND b.is_main = true
WHERE d.branch_id IS NULL AND d.user_id = p.user_id;

-- 5. Trigger to enforce max_branches limit
CREATE OR REPLACE FUNCTION public.enforce_branch_limit()
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
  SELECT role::text INTO v_caller_role FROM profiles WHERE user_id = auth.uid();
  IF v_caller_role = 'super_admin' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(max_branches, 1) INTO v_max FROM profiles WHERE id = NEW.admin_id;
  SELECT COUNT(*) INTO v_count FROM branches WHERE admin_id = NEW.admin_id;

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Branch limit reached (max %). Contact super admin to increase your limit.', v_max;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_branch_limit ON public.branches;
CREATE TRIGGER trg_enforce_branch_limit
BEFORE INSERT ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.enforce_branch_limit();

-- 6. Prevent deleting the Main branch
CREATE OR REPLACE FUNCTION public.prevent_main_branch_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_main THEN
    RAISE EXCEPTION 'Cannot delete the Main branch';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_main_branch_delete ON public.branches;
CREATE TRIGGER trg_prevent_main_branch_delete
BEFORE DELETE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.prevent_main_branch_delete();

-- 7. Ensure only one main branch per admin
CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_one_main_per_admin
ON public.branches(admin_id) WHERE is_main = true;

-- 8. Bump max_branches=1 for all existing admins (they already have Main only)
-- Super admin can raise this later.
UPDATE public.profiles SET max_branches = 1 WHERE role = 'admin' AND max_branches IS NULL;