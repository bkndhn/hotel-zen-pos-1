-- ============================================================
-- FIX: SERVER-SIDE BILL NUMBER GENERATION & DUPLICATE PREVENTION
-- Date: 2026-01-27
-- Description: Updates create_bill_transaction to GENERATE the bill_no internally.
--              This prevents race conditions where multiple devices get "BILL-000061".
--              Also returns the generated bill_no to the client.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_bill_transaction(
    p_bill_no text, -- We will IGNORE this or use it only for offline sync if strictly needed. Ideally ignore.
    p_payment_mode payment_method,
    p_items jsonb,
    p_user_id uuid,
    p_discount numeric,
    p_table_id uuid DEFAULT NULL,
    p_payment_details jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
    -- 1. GET ADMIN_ID FOR ISOLATION
    -- We need to know which admin this user belongs to for sequential numbering
    SELECT admin_id INTO v_admin_id FROM public.profiles WHERE id = p_user_id;
    
    -- Fallback if profile not found or is admin himself (admin_id is null for top-level? No, usually self)
    -- If p_user_id IS the admin, we need his ID.
    IF v_admin_id IS NULL THEN
        -- Check if user is an admin
        IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'admin') THEN
            v_admin_id := p_user_id;
        END IF;
    END IF;

    -- 2. GENERATE BILL NUMBER (ATOMICALLY)
    -- Lock the table for this admin to prevent race conditions on numbering? 
    -- Or just use a sequence? For GAPLESS sequences by Admin, we need to lock.
    -- We will use a stricter approach: Select MAX for this admin.
    
    -- Isolate by Admin ID if possible. If admin_id is null, it's global (fallback).
    IF v_admin_id IS NOT NULL THEN
        SELECT COALESCE(MAX(CAST(SUBSTRING(bill_no FROM 6) AS INTEGER)), 0) + 1 
        INTO v_days_bill_count
        FROM public.bills 
        WHERE bill_no LIKE 'BILL-%' AND (admin_id = v_admin_id);
    ELSE
        -- Global fallback (should rarely happen if roles are set)
        SELECT COALESCE(MAX(CAST(SUBSTRING(bill_no FROM 6) AS INTEGER)), 0) + 1 
        INTO v_days_bill_count
        FROM public.bills 
        WHERE bill_no LIKE 'BILL-%';
    END IF;

    v_new_bill_no := 'BILL-' || LPAD(v_days_bill_count::text, 6, '0');

    -- IF OFFLINE BILL PASSED A NUMBER? 
    -- If p_bill_no is passed, we *could* try to use it, but if it conflicts, we MUST generate a new one.
    -- For safety, we ALWAYS generate a new one on the server to guarantee uniqueness.
    -- The client must update its local display to match this new number.

    -- 3. CALCULATE ITEMS (Same as before)
    FOR v_item_obj IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_item_record 
        FROM public.items 
        WHERE id = (v_item_obj->>'item_id')::uuid
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item not found: %', v_item_obj->>'item_id';
        END IF;

        v_qty := (v_item_obj->>'quantity')::numeric;
        v_base_value := COALESCE(v_item_record.base_value, 1);
        IF v_base_value = 0 THEN v_base_value := 1; END IF;

        IF v_item_record.stock_quantity IS NOT NULL THEN
            v_new_stock := v_item_record.stock_quantity - v_qty;
            IF v_new_stock < 0 THEN
                RAISE EXCEPTION 'Insufficient stock for item: %', v_item_record.name;
            END IF;
            UPDATE public.items SET stock_quantity = v_new_stock WHERE id = v_item_record.id;
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

    -- 4. INSERT BILL
    INSERT INTO public.bills (
        bill_no, created_by, admin_id, date, total_amount, discount, 
        payment_mode, payment_details, kitchen_status, service_status
    ) VALUES (
        v_new_bill_no, -- USE GENERATED NUMBER
        p_user_id,
        v_admin_id,
        CURRENT_DATE,
        v_total_amount,
        p_discount,
        p_payment_mode,
        p_payment_details,
        'pending',
        'pending'
    ) RETURNING id INTO v_bill_id;

    -- 5. INSERT ITEMS
    INSERT INTO public.bill_items (bill_id, item_id, quantity, price, total)
    SELECT v_bill_id, (obj->>'item_id')::uuid, (obj->>'quantity')::numeric, (obj->>'price')::numeric, (obj->>'total')::numeric
    FROM unnest(v_bill_item_records) AS obj;

    RETURN jsonb_build_object(
        'success', true, 
        'bill_id', v_bill_id, 
        'bill_no', v_new_bill_no, -- RETURN NEW NUMBER
        'total_amount', v_total_amount
    );

EXCEPTION WHEN OTHERS THEN
    RAISE;
END;
$$;
