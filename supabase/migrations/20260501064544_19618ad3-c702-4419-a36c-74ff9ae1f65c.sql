-- Backfill helper: assign Main branch to NULL branch_id rows per admin
DO $$
DECLARE
  r record;
  v_main uuid;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE role = 'admin' LOOP
    SELECT id INTO v_main FROM public.branches
      WHERE admin_id = r.id AND is_main = true LIMIT 1;
    IF v_main IS NULL THEN CONTINUE; END IF;

    UPDATE public.bills SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.customers SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.expenses SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.tables SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.items SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.table_orders SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.table_service_requests SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.additional_charges SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.payments SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.expense_categories SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.item_categories SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.tax_rates SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
    UPDATE public.promo_banners SET branch_id = v_main WHERE admin_id = r.id AND branch_id IS NULL;
  END LOOP;
END $$;