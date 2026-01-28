-- Remove the remaining permissive policies on bill_items
DROP POLICY IF EXISTS "Users can view bill items" ON public.bill_items;
DROP POLICY IF EXISTS "Users can create bill items" ON public.bill_items;