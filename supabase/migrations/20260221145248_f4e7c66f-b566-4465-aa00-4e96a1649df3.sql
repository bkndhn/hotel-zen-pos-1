
-- Fix 1: Add search_path to create_bill_transaction (the one WITHOUT search_path)
CREATE OR REPLACE FUNCTION public.create_bill_transaction(p_bill_no text, p_created_by uuid, p_date timestamp with time zone, p_discount numeric, p_payment_mode payment_method, p_payment_details jsonb, p_additional_charges jsonb, p_total_amount numeric, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
declare
  v_bill_id uuid;
  v_item jsonb;
  v_current_stock numeric;
begin
  insert into bills (
    bill_no, created_by, date, discount, payment_mode, payment_details,
    additional_charges, total_amount, is_deleted, is_edited
  ) values (
    p_bill_no, p_created_by, p_date, p_discount, p_payment_mode,
    p_payment_details, p_additional_charges, p_total_amount, false, false
  )
  returning id into v_bill_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into bill_items (bill_id, item_id, price, quantity, total)
    values (
      v_bill_id,
      (v_item->>'item_id')::uuid,
      (v_item->>'price')::numeric,
      (v_item->>'quantity')::numeric,
      (v_item->>'total')::numeric
    );

    update items
    set stock_quantity = stock_quantity - (v_item->>'quantity')::numeric,
        sale_count = coalesce(sale_count, 0) + (v_item->>'quantity')::numeric
    where id = (v_item->>'item_id')::uuid;
  end loop;

  return jsonb_build_object('id', v_bill_id);
end;
$function$;

-- Fix 2: Add search_path to public_update_table_status
CREATE OR REPLACE FUNCTION public.public_update_table_status(p_admin_id uuid, p_table_no text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  IF p_status NOT IN ('available', 'occupied', 'billed') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;
  UPDATE public.tables
  SET status = p_status
  WHERE admin_id = p_admin_id AND table_number = p_table_no;
END;
$function$;

-- Fix 3: Rate limit anonymous table_orders INSERT
-- Create rate limiting function
CREATE OR REPLACE FUNCTION public.check_table_order_rate_limit(p_session_id text, p_table_number text, p_admin_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count int;
  v_last_order timestamptz;
BEGIN
  SELECT COUNT(*), MAX(created_at)
  INTO v_recent_count, v_last_order
  FROM table_orders
  WHERE session_id = p_session_id
  AND created_at > NOW() - INTERVAL '5 minutes';

  -- Max 10 orders per session per 5 minutes
  IF v_recent_count >= 10 THEN
    RETURN FALSE;
  END IF;

  -- Min 15 seconds between orders from same session
  IF v_last_order IS NOT NULL AND v_last_order > NOW() - INTERVAL '15 seconds' THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Create rate limiting function for service requests
CREATE OR REPLACE FUNCTION public.check_service_request_rate_limit(p_table_number text, p_admin_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_recent_count int;
BEGIN
  SELECT COUNT(*)
  INTO v_recent_count
  FROM table_service_requests
  WHERE table_number = p_table_number
  AND admin_id = p_admin_id
  AND status = 'pending'
  AND created_at > NOW() - INTERVAL '1 hour';

  -- Max 10 pending requests per table per hour
  IF v_recent_count >= 10 THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- Replace the permissive INSERT policy on table_orders with rate-limited one
DROP POLICY IF EXISTS "Anyone can create table orders" ON table_orders;
CREATE POLICY "Rate limited table order creation"
ON table_orders FOR INSERT
WITH CHECK (
  check_table_order_rate_limit(session_id, table_number, admin_id)
);

-- Replace the permissive INSERT policy on table_service_requests
DROP POLICY IF EXISTS "Anyone can create service requests" ON table_service_requests;
CREATE POLICY "Rate limited service request creation"
ON table_service_requests FOR INSERT
WITH CHECK (
  check_service_request_rate_limit(table_number, admin_id)
);
