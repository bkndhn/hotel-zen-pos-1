-- Remove ALL old policies and create proper ones

-- 1. Bills table - Fix the permissive policy
DROP POLICY IF EXISTS "Full bills access" ON public.bills;
DROP POLICY IF EXISTS "Proper bills access" ON public.bills;

CREATE POLICY "Secure bills access"
ON public.bills
FOR ALL
USING (
  auth.uid() IS NOT NULL AND (
    is_super_admin() 
    OR admin_id = get_user_admin_id() 
    OR created_by = auth.uid()
  )
);

-- 2. Expenses - remove admin_id IS NULL loophole
DROP POLICY IF EXISTS "Proper expenses access" ON public.expenses;
DROP POLICY IF EXISTS "Full expenses access" ON public.expenses;

CREATE POLICY "Secure expenses access"
ON public.expenses
FOR ALL
USING (
  auth.uid() IS NOT NULL AND (
    is_super_admin() 
    OR admin_id = get_user_admin_id() 
    OR created_by = auth.uid()
  )
);

-- 3. Bill items - use proper admin checking through bills table
DROP POLICY IF EXISTS "Admins can manage bill items" ON public.bill_items;
DROP POLICY IF EXISTS "Users can view their own bill items" ON public.bill_items;
DROP POLICY IF EXISTS "Users can create bill items for their bills" ON public.bill_items;

CREATE POLICY "Secure bill items access"
ON public.bill_items
FOR ALL
USING (
  auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bills b
    WHERE b.id = bill_items.bill_id
    AND (
      is_super_admin() 
      OR b.admin_id = get_user_admin_id() 
      OR b.created_by = auth.uid()
    )
  )
);