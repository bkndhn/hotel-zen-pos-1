-- =====================================================
-- HOTEL ZEN POS - COMPLETE SUPABASE MIGRATION SCRIPT
-- =====================================================
-- Run this in Supabase SQL Editor to recreate your database
-- This creates ALL tables, enums, policies, and storage
-- =====================================================

-- ===================
-- CLEANUP (OPTIONAL)
-- ===================
-- Uncomment these lines if you want to start fresh
-- DROP TABLE IF EXISTS user_permissions CASCADE;
-- DROP TABLE IF EXISTS user_preferences CASCADE;
-- DROP TABLE IF EXISTS bill_items CASCADE;
-- DROP TABLE IF EXISTS bills CASCADE;
-- DROP TABLE IF EXISTS items CASCADE;
-- DROP TABLE IF EXISTS item_categories CASCADE;
-- DROP TABLE IF EXISTS expenses CASCADE;
-- DROP TABLE IF EXISTS expense_categories CASCADE;
-- DROP TABLE IF EXISTS payments CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;
-- DROP TABLE IF EXISTS additional_charges CASCADE;
-- DROP TABLE IF EXISTS bluetooth_settings CASCADE;
-- DROP TABLE IF EXISTS shop_settings CASCADE;
-- DROP TABLE IF EXISTS display_settings CASCADE;

-- ===================
-- ENUMS
-- ===================
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'super_admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'upi', 'card', 'other');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.payment_mode AS ENUM ('cash', 'card', 'upi', 'online');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('active', 'paused', 'deleted');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ===================
-- PROFILES TABLE
-- ===================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  hotel_name TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- ITEM CATEGORIES
-- ===================
CREATE TABLE IF NOT EXISTS public.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- ITEMS
-- ===================
CREATE TABLE IF NOT EXISTS public.items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price NUMERIC NOT NULL,
  category TEXT,
  description TEXT,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  stock_quantity INTEGER,
  minimum_stock_alert INTEGER,
  sale_count INTEGER DEFAULT 0,
  unit TEXT,
  base_value NUMERIC,
  purchase_rate NUMERIC,
  quantity_step NUMERIC,
  admin_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- BILLS
-- ===================
CREATE TABLE IF NOT EXISTS public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_no TEXT NOT NULL,
  total_amount NUMERIC NOT NULL,
  discount NUMERIC DEFAULT 0,
  payment_mode public.payment_method NOT NULL,
  payment_details JSONB,
  additional_charges JSONB,
  date DATE DEFAULT CURRENT_DATE,
  is_deleted BOOLEAN DEFAULT FALSE,
  is_edited BOOLEAN DEFAULT FALSE,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- BILL ITEMS
-- ===================
CREATE TABLE IF NOT EXISTS public.bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id),
  quantity INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- EXPENSE CATEGORIES
-- ===================
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- EXPENSES
-- ===================
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_name TEXT,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  note TEXT,
  created_by UUID NOT NULL,
  admin_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- PAYMENTS
-- ===================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_type TEXT NOT NULL,
  payment_method public.payment_mode,
  is_default BOOLEAN DEFAULT FALSE,
  is_disabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- ADDITIONAL CHARGES
-- ===================
CREATE TABLE IF NOT EXISTS public.additional_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  amount NUMERIC DEFAULT 0,
  charge_type TEXT NOT NULL,
  description TEXT,
  unit TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- SHOP SETTINGS
-- ===================
CREATE TABLE IF NOT EXISTS public.shop_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_name TEXT,
  address TEXT,
  contact_number TEXT,
  logo_url TEXT,
  facebook TEXT,
  show_facebook BOOLEAN DEFAULT TRUE,
  instagram TEXT,
  show_instagram BOOLEAN DEFAULT TRUE,
  whatsapp TEXT,
  show_whatsapp BOOLEAN DEFAULT TRUE,
  printer_width TEXT DEFAULT '80mm',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- BLUETOOTH SETTINGS
-- ===================
CREATE TABLE IF NOT EXISTS public.bluetooth_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT FALSE,
  auto_print BOOLEAN DEFAULT FALSE,
  printer_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- DISPLAY SETTINGS
-- ===================
CREATE TABLE IF NOT EXISTS public.display_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  items_per_row INTEGER DEFAULT 4,
  category_order TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- USER PERMISSIONS
-- ===================
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  page_name TEXT NOT NULL,
  has_access BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, page_name)
);

-- ===================
-- USER PREFERENCES
-- ===================
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  pos_view TEXT DEFAULT 'grid',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===================
-- INDEXES FOR PERFORMANCE
-- ===================
CREATE INDEX IF NOT EXISTS idx_bills_date ON public.bills(date);
CREATE INDEX IF NOT EXISTS idx_bills_created_by ON public.bills(created_by);
CREATE INDEX IF NOT EXISTS idx_bills_is_deleted ON public.bills(is_deleted);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_item_id ON public.bill_items(item_id);
CREATE INDEX IF NOT EXISTS idx_items_category ON public.items(category);
CREATE INDEX IF NOT EXISTS idx_items_is_active ON public.items(is_active);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON public.profiles(user_id);

-- ===================
-- ROW LEVEL SECURITY (RLS)
-- ===================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.additional_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shop_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bluetooth_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.display_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- ===================
-- RLS POLICIES - PROFILES
-- ===================
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- ===================
-- RLS POLICIES - ITEMS (Public read for authenticated users)
-- ===================
CREATE POLICY "Authenticated users can view items" ON public.items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage items" ON public.items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ===================
-- RLS POLICIES - ITEM CATEGORIES
-- ===================
CREATE POLICY "Authenticated users can view categories" ON public.item_categories
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage categories" ON public.item_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ===================
-- RLS POLICIES - BILLS
-- ===================
CREATE POLICY "Authenticated users can view bills" ON public.bills
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create bills" ON public.bills
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage bills" ON public.bills
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ===================
-- RLS POLICIES - BILL ITEMS
-- ===================
CREATE POLICY "Authenticated users can view bill items" ON public.bill_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create bill items" ON public.bill_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ===================
-- RLS POLICIES - EXPENSES
-- ===================
CREATE POLICY "Authenticated users can view expenses" ON public.expenses
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can create expenses" ON public.expenses
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage expenses" ON public.expenses
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ===================
-- RLS POLICIES - EXPENSE CATEGORIES
-- ===================
CREATE POLICY "Authenticated users can view expense categories" ON public.expense_categories
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage expense categories" ON public.expense_categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ===================
-- RLS POLICIES - PAYMENTS
-- ===================
CREATE POLICY "Authenticated users can view payments" ON public.payments
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage payments" ON public.payments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ===================
-- RLS POLICIES - ADDITIONAL CHARGES
-- ===================
CREATE POLICY "Authenticated users can view charges" ON public.additional_charges
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can manage charges" ON public.additional_charges
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- ===================
-- RLS POLICIES - SHOP SETTINGS
-- ===================
CREATE POLICY "Users can view their shop settings" ON public.shop_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their shop settings" ON public.shop_settings
  FOR ALL USING (auth.uid() = user_id);

-- ===================
-- RLS POLICIES - BLUETOOTH SETTINGS
-- ===================
CREATE POLICY "Users can view their bluetooth settings" ON public.bluetooth_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their bluetooth settings" ON public.bluetooth_settings
  FOR ALL USING (auth.uid() = user_id);

-- ===================
-- RLS POLICIES - DISPLAY SETTINGS
-- ===================
CREATE POLICY "Users can view their display settings" ON public.display_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their display settings" ON public.display_settings
  FOR ALL USING (auth.uid() = user_id);

-- ===================
-- RLS POLICIES - USER PERMISSIONS
-- ===================
CREATE POLICY "Admins can manage user permissions" ON public.user_permissions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "Users can view their own permissions" ON public.user_permissions
  FOR SELECT USING (auth.uid() = user_id);

-- ===================
-- RLS POLICIES - USER PREFERENCES
-- ===================
CREATE POLICY "Users can view their preferences" ON public.user_preferences
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their preferences" ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id);

-- ===================
-- STORAGE BUCKET
-- ===================
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for logos
CREATE POLICY "Anyone can view logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');

CREATE POLICY "Authenticated users can upload logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their logos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their logos" ON storage.objects
  FOR DELETE USING (bucket_id = 'logos' AND auth.role() = 'authenticated');

-- ===================
-- DEFAULT DATA
-- ===================

-- Default payment types
INSERT INTO public.payments (payment_type, is_default) VALUES
  ('Cash', true),
  ('UPI', false),
  ('Card', false)
ON CONFLICT DO NOTHING;

-- Default expense categories
INSERT INTO public.expense_categories (name) VALUES
  ('Utilities'),
  ('Supplies'),
  ('Staff'),
  ('Maintenance'),
  ('Other')
ON CONFLICT DO NOTHING;

-- ===================
-- FUNCTIONS
-- ===================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to all tables with updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_item_categories_updated_at BEFORE UPDATE ON public.item_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expense_categories_updated_at BEFORE UPDATE ON public.expense_categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_additional_charges_updated_at BEFORE UPDATE ON public.additional_charges
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shop_settings_updated_at BEFORE UPDATE ON public.shop_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bluetooth_settings_updated_at BEFORE UPDATE ON public.bluetooth_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_display_settings_updated_at BEFORE UPDATE ON public.display_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_permissions_updated_at BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- MIGRATION COMPLETE!
-- =====================================================
-- After running this script:
-- 1. Update your client.ts with the new SUPABASE_URL and SUPABASE_ANON_KEY
-- 2. Create your first admin user through the Auth page
-- 3. Done! Your POS system is ready to use.
-- =====================================================
