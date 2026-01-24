
-- First, let's update the categories table to ensure it has all required columns
-- and add any missing columns if needed
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT '',
ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS created_at timestamp with time zone NOT NULL DEFAULT now(),
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- Create trigger for updating updated_at
CREATE OR REPLACE FUNCTION update_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_categories_updated_at_trigger ON public.categories;
CREATE TRIGGER update_categories_updated_at_trigger
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION update_categories_updated_at();

-- Update RLS policies for categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Everyone can view active categories" ON public.categories;

-- Admin can manage all categories (including deleted ones)
CREATE POLICY "Admins can manage categories" 
ON public.categories FOR ALL 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'::app_role
  )
);

-- Everyone can view only active (non-deleted) categories
CREATE POLICY "Everyone can view active categories" 
ON public.categories FOR SELECT 
TO authenticated 
USING (is_deleted = false);
