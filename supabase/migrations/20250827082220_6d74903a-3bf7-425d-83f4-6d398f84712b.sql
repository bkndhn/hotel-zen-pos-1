
-- Create new table for item categories
CREATE TABLE public.item_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add Row Level Security (RLS) to item_categories
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;

-- Create policies for item_categories (same as existing categories)
CREATE POLICY "Admins can manage item categories" 
  ON public.item_categories 
  FOR ALL 
  USING (EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'::app_role
  ));

CREATE POLICY "Everyone can view active item categories" 
  ON public.item_categories 
  FOR SELECT 
  USING (is_deleted = false);

-- Rename existing categories table to expense_categories
ALTER TABLE public.categories RENAME TO expense_categories;

-- Create trigger for item_categories updated_at
CREATE TRIGGER update_item_categories_updated_at
  BEFORE UPDATE ON public.item_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_categories_updated_at();
