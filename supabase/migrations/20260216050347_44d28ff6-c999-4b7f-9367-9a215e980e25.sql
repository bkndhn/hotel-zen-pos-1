
-- Step 1: Delete seed records with NULL admin_id (these leak across admins)
DELETE FROM item_categories WHERE admin_id IS NULL;
DELETE FROM expense_categories WHERE admin_id IS NULL;
DELETE FROM payments WHERE admin_id IS NULL;

-- Step 2: Update RLS policies to remove the admin_id IS NULL loophole

-- item_categories: Drop old policy and create strict one
DROP POLICY IF EXISTS "Full item categories access" ON item_categories;
CREATE POLICY "Full item categories access" ON item_categories
  FOR ALL USING (
    is_super_admin() OR (admin_id = get_user_admin_id())
  );

-- expense_categories: Drop old policy and create strict one  
DROP POLICY IF EXISTS "Full expense categories access" ON expense_categories;
CREATE POLICY "Full expense categories access" ON expense_categories
  FOR ALL USING (
    is_super_admin() OR (admin_id = get_user_admin_id())
  );

-- payments: Drop old policy and create strict one
DROP POLICY IF EXISTS "Full payments access" ON payments;
CREATE POLICY "Full payments access" ON payments
  FOR ALL USING (
    is_super_admin() OR (admin_id = get_user_admin_id())
  );

-- additional_charges: Drop old policy and create strict one
DROP POLICY IF EXISTS "Full additional charges access" ON additional_charges;
CREATE POLICY "Full additional charges access" ON additional_charges
  FOR ALL USING (
    is_super_admin() OR (admin_id = get_user_admin_id())
  );

-- tables: Drop old policy and create strict one
DROP POLICY IF EXISTS "Full tables access" ON tables;
CREATE POLICY "Full tables access" ON tables
  FOR ALL USING (
    is_super_admin() OR (admin_id = get_user_admin_id())
  );

-- items: Drop old permissive policy and create strict one
DROP POLICY IF EXISTS "Full items access" ON items;
CREATE POLICY "Full items access" ON items
  FOR ALL USING (
    is_super_admin() OR (admin_id = get_user_admin_id())
  );
