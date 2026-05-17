-- =========================================================================
-- Backfill branch_id for all tables that used the branch_id IS NULL fallback
-- =========================================================================

-- 1. item_categories
UPDATE public.item_categories c
SET branch_id = b.id
FROM public.branches b
WHERE c.branch_id IS NULL
  AND b.admin_id = c.admin_id
  AND b.is_main = true;

-- 2. expense_categories
UPDATE public.expense_categories c
SET branch_id = b.id
FROM public.branches b
WHERE c.branch_id IS NULL
  AND b.admin_id = c.admin_id
  AND b.is_main = true;

-- 3. payments
UPDATE public.payments p
SET branch_id = b.id
FROM public.branches b
WHERE p.branch_id IS NULL
  AND b.admin_id = p.admin_id
  AND b.is_main = true;

-- 4. additional_charges
UPDATE public.additional_charges a
SET branch_id = b.id
FROM public.branches b
WHERE a.branch_id IS NULL
  AND b.admin_id = a.admin_id
  AND b.is_main = true;

-- 5. tax_rates
UPDATE public.tax_rates t
SET branch_id = b.id
FROM public.branches b
WHERE t.branch_id IS NULL
  AND b.admin_id = t.admin_id
  AND b.is_main = true;

-- 6. promo_banners
UPDATE public.promo_banners p
SET branch_id = b.id
FROM public.branches b
WHERE p.branch_id IS NULL
  AND b.admin_id = p.admin_id
  AND b.is_main = true;

-- Note: We do not drop the NULL allowance on the columns right away 
-- in case some legacy logic still inserts it, but this ensures existing
-- data is safely scoped to the main branch.
