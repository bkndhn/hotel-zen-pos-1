-- Create a function to handle bill creation and stock deduction atomically
create or replace function create_bill_transaction(
  p_bill_no text,
  p_created_by uuid,
  p_date timestamp with time zone,
  p_discount numeric,
  p_payment_mode payment_method,
  p_payment_details jsonb,
  p_additional_charges jsonb,
  p_total_amount numeric,
  p_items jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_bill_id uuid;
  v_item jsonb;
  v_current_stock numeric;
begin
  -- 1. Insert the bill
  insert into bills (
    bill_no,
    created_by,
    date,
    discount,
    payment_mode,
    payment_details,
    additional_charges,
    total_amount,
    is_deleted,
    is_edited
  ) values (
    p_bill_no,
    p_created_by,
    p_date,
    p_discount,
    p_payment_mode,
    p_payment_details,
    p_additional_charges,
    p_total_amount,
    false,
    false
  )
  returning id into v_bill_id;

  -- 2. Process each item
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    -- Insert bill item
    insert into bill_items (
      bill_id,
      item_id,
      price,
      quantity,
      total
    ) values (
      v_bill_id,
      (v_item->>'item_id')::uuid,
      (v_item->>'price')::numeric,
      (v_item->>'quantity')::numeric,
      (v_item->>'total')::numeric
    );

    -- Deduct stock
    update items
    set stock_quantity = stock_quantity - (v_item->>'quantity')::numeric,
        sale_count = coalesce(sale_count, 0) + (v_item->>'quantity')::numeric
    where id = (v_item->>'item_id')::uuid;
  end loop;

  -- 3. Return the created bill id
  return jsonb_build_object('id', v_bill_id);
end;
$$;
