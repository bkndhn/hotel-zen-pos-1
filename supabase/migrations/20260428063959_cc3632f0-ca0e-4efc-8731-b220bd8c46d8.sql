-- =====================================================================
-- PHASE 2: Shared catalog + per-branch stock (retry)
-- =====================================================================

-- 0. Add missing branch_id to table_service_requests
ALTER TABLE public.table_service_requests
  ADD COLUMN IF NOT EXISTS branch_id uuid;

-- 1. Create branch_item_stock table
CREATE TABLE IF NOT EXISTS public.branch_item_stock (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  admin_id uuid NOT NULL,
  stock_quantity numeric NOT NULL DEFAULT 0,
  unlimited_stock boolean NOT NULL DEFAULT false,
  minimum_stock_alert numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (branch_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_item_stock_branch ON public.branch_item_stock(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_item_stock_item ON public.branch_item_stock(item_id);
CREATE INDEX IF NOT EXISTS idx_branch_item_stock_admin ON public.branch_item_stock(admin_id);

ALTER TABLE public.branch_item_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full branch item stock access" ON public.branch_item_stock;
CREATE POLICY "Full branch item stock access"
  ON public.branch_item_stock
  FOR ALL
  USING (is_super_admin() OR (admin_id = get_user_admin_id()))
  WITH CHECK (is_super_admin() OR (admin_id = get_user_admin_id()));

DROP POLICY IF EXISTS "Public can view active stock" ON public.branch_item_stock;
CREATE POLICY "Public can view active stock"
  ON public.branch_item_stock
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP TRIGGER IF EXISTS trg_branch_item_stock_updated_at ON public.branch_item_stock;
CREATE TRIGGER trg_branch_item_stock_updated_at
  BEFORE UPDATE ON public.branch_item_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Seed branch_item_stock for every (branch, item) pair
INSERT INTO public.branch_item_stock (branch_id, item_id, admin_id, stock_quantity, unlimited_stock, minimum_stock_alert, is_active)
SELECT
  b.id, i.id, i.admin_id,
  CASE WHEN b.is_main THEN COALESCE(i.stock_quantity, 0) ELSE 0 END,
  COALESCE(i.unlimited_stock, false),
  COALESCE(i.minimum_stock_alert, 0),
  COALESCE(i.is_active, true)
FROM public.branches b
JOIN public.items i ON i.admin_id = b.admin_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.branch_item_stock s
  WHERE s.branch_id = b.id AND s.item_id = i.id
);

-- 3. Clear items.branch_id — items are now admin-level shared catalog
UPDATE public.items SET branch_id = NULL WHERE branch_id IS NOT NULL;

-- 4. Backfill branch_id on remaining tables (all of these now have branch_id)
DO $$
DECLARE
  tbl text;
  tables text[] := ARRAY[
    'bills','expenses','tables','customers','table_orders',
    'table_service_requests','additional_charges','expense_categories',
    'payments','promo_banners','item_categories','tax_rates'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format($f$
      UPDATE public.%I t
      SET branch_id = (
        SELECT b.id FROM public.branches b
        WHERE b.admin_id = t.admin_id AND b.is_main LIMIT 1
      )
      WHERE t.branch_id IS NULL AND t.admin_id IS NOT NULL
    $f$, tbl);
  END LOOP;
END $$;

-- shop_settings and display_settings use user_id
UPDATE public.shop_settings t
SET branch_id = (
  SELECT b.id FROM public.branches b
  JOIN public.profiles p ON p.id = b.admin_id
  WHERE p.user_id = t.user_id AND b.is_main LIMIT 1
)
WHERE t.branch_id IS NULL;

UPDATE public.display_settings t
SET branch_id = (
  SELECT b.id FROM public.branches b
  JOIN public.profiles p ON p.id = b.admin_id
  WHERE p.user_id = t.user_id AND b.is_main LIMIT 1
)
WHERE t.branch_id IS NULL;

-- 5. Updated billing RPC — deduct stock from branch_item_stock for the passed branch
CREATE OR REPLACE FUNCTION public.create_bill_transaction(
  p_bill_no text,
  p_payment_mode payment_method,
  p_items jsonb,
  p_user_id uuid,
  p_discount numeric,
  p_table_id uuid DEFAULT NULL::uuid,
  p_payment_details jsonb DEFAULT '{}'::jsonb,
  p_branch_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bill_id uuid;
  v_days_bill_count integer;
  v_new_bill_no text;
  v_total_amount numeric := 0;
  v_item_record record;
  v_item_total numeric;
  v_item_obj jsonb;
  v_new_stock numeric;
  v_qty numeric;
  v_base_value numeric;
  v_bill_item_records jsonb[] := ARRAY[]::jsonb[];
  v_admin_id uuid;
  v_branch_id uuid;
  v_stock_row record;
BEGIN
  SELECT admin_id INTO v_admin_id FROM public.profiles WHERE id = p_user_id;
  IF v_admin_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
      v_admin_id := p_user_id;
    END IF;
  END IF;

  v_branch_id := p_branch_id;
  IF v_branch_id IS NULL AND v_admin_id IS NOT NULL THEN
    SELECT id INTO v_branch_id FROM public.branches
      WHERE admin_id = v_admin_id AND is_main LIMIT 1;
  END IF;

  IF v_admin_id IS NOT NULL THEN
    SELECT COALESCE(MAX(CAST(SUBSTRING(bill_no FROM 6) AS INTEGER)), 0) + 1
      INTO v_days_bill_count
      FROM public.bills
      WHERE bill_no LIKE 'BILL-%' AND admin_id = v_admin_id;
  ELSE
    SELECT COALESCE(MAX(CAST(SUBSTRING(bill_no FROM 6) AS INTEGER)), 0) + 1
      INTO v_days_bill_count
      FROM public.bills
      WHERE bill_no LIKE 'BILL-%';
  END IF;
  v_new_bill_no := 'BILL-' || LPAD(v_days_bill_count::text, 6, '0');

  FOR v_item_obj IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_item_record FROM public.items
      WHERE id = (v_item_obj->>'item_id')::uuid
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found: %', v_item_obj->>'item_id';
    END IF;

    v_qty := (v_item_obj->>'quantity')::numeric;
    v_base_value := COALESCE(v_item_record.base_value, 1);
    IF v_base_value = 0 THEN v_base_value := 1; END IF;

    IF v_branch_id IS NOT NULL THEN
      SELECT * INTO v_stock_row FROM public.branch_item_stock
        WHERE branch_id = v_branch_id AND item_id = v_item_record.id
        FOR UPDATE;

      IF FOUND AND NOT v_stock_row.unlimited_stock THEN
        v_new_stock := v_stock_row.stock_quantity - v_qty;
        IF v_new_stock < 0 THEN
          RAISE EXCEPTION 'Insufficient stock for item: % at this branch', v_item_record.name;
        END IF;
        UPDATE public.branch_item_stock
          SET stock_quantity = v_new_stock
          WHERE id = v_stock_row.id;
      END IF;
    END IF;

    v_item_total := (v_qty / v_base_value) * v_item_record.price;
    v_total_amount := v_total_amount + v_item_total;

    v_bill_item_records := array_append(v_bill_item_records, jsonb_build_object(
      'item_id', v_item_record.id,
      'quantity', v_qty,
      'price', v_item_record.price,
      'total', v_item_total
    ));
  END LOOP;

  v_total_amount := GREATEST(0, v_total_amount - p_discount);

  INSERT INTO public.bills (
    bill_no, created_by, admin_id, branch_id, date, total_amount, discount,
    payment_mode, payment_details, kitchen_status, service_status
  ) VALUES (
    v_new_bill_no, p_user_id, v_admin_id, v_branch_id, CURRENT_DATE,
    v_total_amount, p_discount, p_payment_mode, p_payment_details,
    'pending', 'pending'
  ) RETURNING id INTO v_bill_id;

  INSERT INTO public.bill_items (bill_id, item_id, quantity, price, total)
  SELECT v_bill_id, (obj->>'item_id')::uuid, (obj->>'quantity')::numeric,
         (obj->>'price')::numeric, (obj->>'total')::numeric
  FROM unnest(v_bill_item_records) AS obj;

  RETURN jsonb_build_object(
    'success', true,
    'bill_id', v_bill_id,
    'bill_no', v_new_bill_no,
    'total_amount', v_total_amount,
    'branch_id', v_branch_id
  );
EXCEPTION WHEN OTHERS THEN
  RAISE;
END;
$function$;

-- 6. Helper RPC: seed empty stock rows for a new branch
CREATE OR REPLACE FUNCTION public.seed_branch_stock(p_branch_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_count integer := 0;
BEGIN
  SELECT admin_id INTO v_admin_id FROM public.branches WHERE id = p_branch_id;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  IF NOT (is_super_admin() OR v_admin_id = get_user_admin_id()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.branch_item_stock
    (branch_id, item_id, admin_id, stock_quantity, unlimited_stock, minimum_stock_alert, is_active)
  SELECT p_branch_id, i.id, i.admin_id, 0,
         COALESCE(i.unlimited_stock, false),
         COALESCE(i.minimum_stock_alert, 0),
         COALESCE(i.is_active, true)
  FROM public.items i
  WHERE i.admin_id = v_admin_id
    AND NOT EXISTS (
      SELECT 1 FROM public.branch_item_stock s
      WHERE s.branch_id = p_branch_id AND s.item_id = i.id
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;