
-- =========================================================================
-- 1. ITEMS: restore branch_id as a required, branch-scoped column
-- =========================================================================

-- Backfill items.branch_id from branch_item_stock if it exists, else to Main branch
UPDATE public.items i
SET branch_id = b.id
FROM public.branches b
WHERE i.branch_id IS NULL
  AND b.admin_id = i.admin_id
  AND b.is_main = true;

-- For any items still null (admin has no main branch yet), pick first active branch
UPDATE public.items i
SET branch_id = (
  SELECT id FROM public.branches
  WHERE admin_id = i.admin_id AND is_active = true
  ORDER BY is_main DESC, created_at ASC
  LIMIT 1
)
WHERE i.branch_id IS NULL;

-- =========================================================================
-- 2. Drop branch_item_stock — no longer needed (stock lives on items now)
-- =========================================================================
DROP TABLE IF EXISTS public.branch_item_stock CASCADE;

-- =========================================================================
-- 3. Replace create_bill_transaction to deduct from items.stock_quantity
--    for the bill's specific branch_id.
-- =========================================================================
DROP FUNCTION IF EXISTS public.create_bill_transaction(text, payment_method, jsonb, uuid, numeric, uuid, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.create_bill_transaction(
  p_bill_no text,
  p_payment_mode payment_method,
  p_items jsonb,
  p_user_id uuid,
  p_discount numeric,
  p_table_id uuid DEFAULT NULL,
  p_payment_details jsonb DEFAULT '{}'::jsonb,
  p_branch_id uuid DEFAULT NULL
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

    IF v_item_record.stock_quantity IS NOT NULL AND NOT COALESCE(v_item_record.unlimited_stock, false) THEN
      v_new_stock := v_item_record.stock_quantity - v_qty;
      IF v_new_stock < 0 THEN
        RAISE EXCEPTION 'Insufficient stock for item: %', v_item_record.name;
      END IF;
      UPDATE public.items
        SET stock_quantity = v_new_stock,
            sale_count = COALESCE(sale_count, 0) + v_qty
        WHERE id = v_item_record.id;
    ELSE
      UPDATE public.items
        SET sale_count = COALESCE(sale_count, 0) + v_qty
        WHERE id = v_item_record.id;
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

-- Drop the old seed_branch_stock (replaced by seed_branch_defaults below)
DROP FUNCTION IF EXISTS public.seed_branch_stock(uuid);

-- =========================================================================
-- 4. Helper: seed default config rows (categories/payments/charges/taxes)
--    into a freshly-created branch.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.seed_branch_defaults(
  p_target_branch_id uuid,
  p_source_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_cats int := 0;
  v_item_cats int := 0;
  v_pays int := 0;
  v_charges int := 0;
  v_taxes int := 0;
BEGIN
  SELECT admin_id INTO v_admin_id FROM public.branches WHERE id = p_target_branch_id;
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Branch not found';
  END IF;

  IF NOT (is_super_admin() OR v_admin_id = get_user_admin_id()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Expense categories
  INSERT INTO public.expense_categories (name, admin_id, branch_id, is_deleted)
  SELECT name, admin_id, p_target_branch_id, false
  FROM public.expense_categories
  WHERE admin_id = v_admin_id
    AND COALESCE(is_deleted, false) = false
    AND (
      (p_source_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = p_source_branch_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.expense_categories t
      WHERE t.admin_id = v_admin_id AND t.branch_id = p_target_branch_id
        AND LOWER(t.name) = LOWER(public.expense_categories.name)
    );
  GET DIAGNOSTICS v_cats = ROW_COUNT;

  -- Item categories
  INSERT INTO public.item_categories (name, admin_id, branch_id, is_deleted)
  SELECT name, admin_id, p_target_branch_id, false
  FROM public.item_categories
  WHERE admin_id = v_admin_id
    AND COALESCE(is_deleted, false) = false
    AND (
      (p_source_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = p_source_branch_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.item_categories t
      WHERE t.admin_id = v_admin_id AND t.branch_id = p_target_branch_id
        AND LOWER(t.name) = LOWER(public.item_categories.name)
    );
  GET DIAGNOSTICS v_item_cats = ROW_COUNT;

  -- Payments
  INSERT INTO public.payments (payment_type, payment_method, is_default, is_disabled, admin_id, branch_id)
  SELECT payment_type, payment_method, is_default, is_disabled, admin_id, p_target_branch_id
  FROM public.payments
  WHERE admin_id = v_admin_id
    AND (
      (p_source_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = p_source_branch_id
    );
  GET DIAGNOSTICS v_pays = ROW_COUNT;

  -- Additional charges
  INSERT INTO public.additional_charges (name, charge_type, amount, unit, description, is_default, is_active, admin_id, branch_id)
  SELECT name, charge_type, amount, unit, description, is_default, is_active, admin_id, p_target_branch_id
  FROM public.additional_charges
  WHERE admin_id = v_admin_id
    AND (
      (p_source_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = p_source_branch_id
    );
  GET DIAGNOSTICS v_charges = ROW_COUNT;

  -- Tax rates
  INSERT INTO public.tax_rates (name, rate, cess_rate, hsn_code, is_active, admin_id, branch_id)
  SELECT name, rate, cess_rate, hsn_code, is_active, admin_id, p_target_branch_id
  FROM public.tax_rates
  WHERE admin_id = v_admin_id
    AND (
      (p_source_branch_id IS NULL AND branch_id IS NULL)
      OR branch_id = p_source_branch_id
    );
  GET DIAGNOSTICS v_taxes = ROW_COUNT;

  RETURN jsonb_build_object(
    'expense_categories', v_cats,
    'item_categories', v_item_cats,
    'payments', v_pays,
    'additional_charges', v_charges,
    'tax_rates', v_taxes
  );
END;
$function$;

-- =========================================================================
-- 5. Helper: copy items from one branch to another (with own stock)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.copy_items_to_branch(
  p_source_branch_id uuid,
  p_target_branch_id uuid,
  p_item_ids uuid[] DEFAULT NULL  -- null = copy all
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid;
  v_target_admin uuid;
  v_count int := 0;
BEGIN
  SELECT admin_id INTO v_admin_id FROM public.branches WHERE id = p_source_branch_id;
  SELECT admin_id INTO v_target_admin FROM public.branches WHERE id = p_target_branch_id;

  IF v_admin_id IS NULL OR v_target_admin IS NULL THEN
    RAISE EXCEPTION 'Source or target branch not found';
  END IF;
  IF v_admin_id <> v_target_admin THEN
    RAISE EXCEPTION 'Branches belong to different admins';
  END IF;
  IF NOT (is_super_admin() OR v_admin_id = get_user_admin_id()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  INSERT INTO public.items (
    name, description, category, price, purchase_rate, image_url, video_url, media_type,
    unit, base_value, quantity_step, hsn_code, tax_rate_id, is_tax_inclusive,
    is_active, unlimited_stock, minimum_stock_alert, display_order,
    admin_id, branch_id, stock_quantity
  )
  SELECT
    name, description, category, price, purchase_rate, image_url, video_url, media_type,
    unit, base_value, quantity_step, hsn_code, tax_rate_id, is_tax_inclusive,
    is_active, unlimited_stock, minimum_stock_alert, display_order,
    admin_id, p_target_branch_id, 0  -- start with 0 stock at target branch
  FROM public.items src
  WHERE src.branch_id = p_source_branch_id
    AND (p_item_ids IS NULL OR src.id = ANY(p_item_ids))
    AND NOT EXISTS (
      SELECT 1 FROM public.items t
      WHERE t.branch_id = p_target_branch_id
        AND LOWER(t.name) = LOWER(src.name)
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

-- =========================================================================
-- 6. Index for branch filtering performance
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_items_branch ON public.items(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bills_branch ON public.bills(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_expenses_branch ON public.expenses(branch_id) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tables_branch ON public.tables(branch_id) WHERE branch_id IS NOT NULL;
