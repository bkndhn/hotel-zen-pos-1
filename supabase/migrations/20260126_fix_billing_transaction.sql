-- ============================================================
-- FIX: SECURE TRANSACTIONAL BILLING
-- Resolves: Race Conditions, Client-Side Price Manipulation
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_bill_transaction(
    p_bill_no text,
    p_payment_mode payment_method,
    p_items jsonb, -- Array of {item_id, quantity}
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
    v_total_amount numeric := 0;
    v_item_record record;
    v_item_total numeric;
    v_item_obj jsonb;
    v_new_stock numeric;
    v_bill_item_records jsonb[] := ARRAY[]::jsonb[];
BEGIN
    -- 1. LOOP THROUGH ITEMS TO CALCULATE TOTAL & CHECK STOCK
    FOR v_item_obj IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        -- Fetch current item details (Price & Stock) from DB (Source of Truth)
        SELECT * INTO v_item_record 
        FROM public.items 
        WHERE id = (v_item_obj->>'item_id')::uuid
        FOR UPDATE; -- LOCK THE ROW to prevent race condition

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Item not found: %', v_item_obj->>'item_id';
        END IF;

        -- Check Stock (if stock tracking is enabled)
        IF v_item_record.stock_quantity IS NOT NULL THEN
            v_new_stock := v_item_record.stock_quantity - (v_item_obj->>'quantity')::numeric;
            
            IF v_new_stock < 0 THEN
                RAISE EXCEPTION 'Insufficient stock for item: % (Available: %, Requested: %)', 
                    v_item_record.name, v_item_record.stock_quantity, v_item_obj->>'quantity';
            END IF;

            -- Deduct Stock
            UPDATE public.items 
            SET stock_quantity = v_new_stock 
            WHERE id = v_item_record.id;
        END IF;

        -- Calculate Item Total (Server-side price * Qty)
        v_item_total := v_item_record.price * (v_item_obj->>'quantity')::numeric;
        v_total_amount := v_total_amount + v_item_total;

        -- Prepare Bill Item Record for later insertion
        v_bill_item_records := array_append(v_bill_item_records, jsonb_build_object(
            'item_id', v_item_record.id,
            'quantity', (v_item_obj->>'quantity')::numeric,
            'price', v_item_record.price,
            'total', v_item_total
        ));
    END LOOP;

    -- Apply Discount
    v_total_amount := GREATEST(0, v_total_amount - p_discount);

    -- 2. INSERT BILL
    INSERT INTO public.bills (
        bill_no, 
        created_by, 
        date, 
        total_amount, 
        discount, 
        payment_mode, 
        payment_details,
        kitchen_status,
        service_status
    ) VALUES (
        p_bill_no,
        p_user_id,
        CURRENT_DATE, -- Server assigns date
        v_total_amount,
        p_discount,
        p_payment_mode,
        p_payment_details,
        'pending',
        'pending'
    ) RETURNING id INTO v_bill_id;

    -- 3. INSERT BILL ITEMS
    INSERT INTO public.bill_items (bill_id, item_id, quantity, price, total)
    SELECT 
        v_bill_id,
        (obj->>'item_id')::uuid,
        (obj->>'quantity')::numeric,
        (obj->>'price')::numeric,
        (obj->>'total')::numeric
    FROM unnest(v_bill_item_records) AS obj;

    -- Return success
    RETURN jsonb_build_object(
        'success', true, 
        'bill_id', v_bill_id, 
        'total_amount', v_total_amount
    );

EXCEPTION WHEN OTHERS THEN
    -- All changes (stock updates, bill inserts) will be rolled back automatically
    RAISE;
END;
$$;
