
-- ================================================
-- MULTI-BRANCH SUPPORT SCHEMA
-- ================================================

-- 1. Create branches table
CREATE TABLE public.branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  name text NOT NULL,
  code text,
  address text,
  contact_number text,
  logo_url text,
  shop_name text,
  gstin text,
  gst_enabled boolean DEFAULT false,
  is_composition_scheme boolean DEFAULT false,
  composition_rate numeric DEFAULT 1,
  is_default boolean DEFAULT false,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch access for admin and users" ON public.branches
FOR ALL USING (
  is_super_admin() OR admin_id = get_user_admin_id()
);

-- 2. Create user_branches (many-to-many staff assignment)
CREATE TABLE public.user_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, branch_id)
);

ALTER TABLE public.user_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage branch assignments" ON public.user_branches
FOR ALL USING (is_admin_or_super());

CREATE POLICY "Users view own branch assignments" ON public.user_branches
FOR SELECT USING (user_id = auth.uid());

-- 3. Add branch_id to all data tables (nullable for backward compat with existing data)
ALTER TABLE public.items ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.bills ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.expenses ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.expense_categories ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.item_categories ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.customers ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.tables ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.table_orders ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.tax_rates ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.additional_charges ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.payments ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.promo_banners ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.display_settings ADD COLUMN branch_id uuid REFERENCES public.branches(id);
ALTER TABLE public.shop_settings ADD COLUMN branch_id uuid REFERENCES public.branches(id);

-- 4. Indexes for performance
CREATE INDEX idx_branches_admin ON public.branches(admin_id);
CREATE INDEX idx_branches_default ON public.branches(admin_id, is_default);
CREATE INDEX idx_user_branches_user ON public.user_branches(user_id);
CREATE INDEX idx_user_branches_branch ON public.user_branches(branch_id);
CREATE INDEX idx_items_branch ON public.items(branch_id);
CREATE INDEX idx_bills_branch ON public.bills(branch_id);
CREATE INDEX idx_expenses_branch ON public.expenses(branch_id);
CREATE INDEX idx_tables_branch ON public.tables(branch_id);
CREATE INDEX idx_customers_branch ON public.customers(branch_id);
CREATE INDEX idx_tax_rates_branch ON public.tax_rates(branch_id);

-- 5. Update trigger for branches
CREATE TRIGGER update_branches_updated_at
BEFORE UPDATE ON public.branches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Helper function to check if user has access to a branch
CREATE OR REPLACE FUNCTION public.user_has_branch_access(p_branch_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Super admins have access to everything
    WHEN (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'super_admin' THEN true
    -- Admins have access to all their branches
    WHEN (SELECT role FROM profiles WHERE user_id = auth.uid()) = 'admin' THEN
      EXISTS (SELECT 1 FROM branches WHERE id = p_branch_id AND admin_id = (SELECT id FROM profiles WHERE user_id = auth.uid()))
    -- Regular users check user_branches assignment
    ELSE
      EXISTS (SELECT 1 FROM user_branches WHERE user_id = auth.uid() AND branch_id = p_branch_id)
  END
$$;
