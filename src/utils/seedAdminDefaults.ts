/**
 * Seeds default data (categories, payment types) for a new admin.
 * Called once when an admin first logs in and has no data.
 */
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ITEM_CATEGORIES = ['Food', 'Beverages', 'Snacks'];
const DEFAULT_EXPENSE_CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Supplies', 'Maintenance', 'Other'];
const DEFAULT_PAYMENT_TYPES = [
  { payment_type: 'Cash', is_default: true, is_disabled: false },
  { payment_type: 'UPI', is_default: false, is_disabled: false },
  { payment_type: 'Card', is_default: false, is_disabled: false },
];

export const seedAdminDefaults = async (adminProfileId: string) => {
  try {
    // Check if admin already has item categories (skip seeding if so)
    const { data: existingItemCats } = await supabase
      .from('item_categories')
      .select('id')
      .eq('admin_id', adminProfileId)
      .limit(1);

    if (existingItemCats && existingItemCats.length > 0) {
      console.log('[Seed] Admin already has data, skipping seeding');
      return;
    }

    console.log('[Seed] Seeding default data for admin:', adminProfileId);

    // Seed item categories
    const itemCats = DEFAULT_ITEM_CATEGORIES.map(name => ({
      name,
      admin_id: adminProfileId,
      is_deleted: false,
    }));
    await supabase.from('item_categories').insert(itemCats);

    // Seed expense categories
    const expenseCats = DEFAULT_EXPENSE_CATEGORIES.map(name => ({
      name,
      admin_id: adminProfileId,
      is_deleted: false,
    }));
    await supabase.from('expense_categories').insert(expenseCats);

    // Seed payment types
    const payments = DEFAULT_PAYMENT_TYPES.map(p => ({
      ...p,
      admin_id: adminProfileId,
    }));
    await supabase.from('payments').insert(payments);

    console.log('[Seed] Default data seeded successfully');
  } catch (error) {
    console.error('[Seed] Error seeding defaults:', error);
    // Non-critical - don't block login
  }
};
