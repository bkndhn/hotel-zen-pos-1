-- Create additional_charges table for custom charges configuration
CREATE TABLE public.additional_charges (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  charge_type TEXT NOT NULL CHECK (charge_type IN ('fixed', 'per_unit', 'percentage')),
  amount NUMERIC NOT NULL DEFAULT 0,
  unit TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create display_settings table for billing page display configuration  
CREATE TABLE public.display_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  items_per_row INTEGER NOT NULL DEFAULT 3,
  category_order TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Create storage bucket for item images
INSERT INTO storage.buckets (id, name, public) VALUES ('item-images', 'item-images', true);

-- Enable RLS on additional_charges
ALTER TABLE public.additional_charges ENABLE ROW LEVEL SECURITY;

-- Create policies for additional_charges
CREATE POLICY "Admins can manage additional charges" 
ON public.additional_charges 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.user_id = auth.uid() 
  AND profiles.role IN ('admin', 'super_admin')
));

CREATE POLICY "Everyone can view active additional charges" 
ON public.additional_charges 
FOR SELECT 
USING (is_active = true);

-- Enable RLS on display_settings
ALTER TABLE public.display_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for display_settings
CREATE POLICY "Users can manage their own display settings" 
ON public.display_settings 
FOR ALL 
USING (auth.uid() = user_id);

-- Create policies for item images storage
CREATE POLICY "Users can upload item images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'item-images' AND auth.uid() IS NOT NULL);

CREATE POLICY "Everyone can view item images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'item-images');

CREATE POLICY "Admins can update item images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'item-images' AND EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.user_id = auth.uid() 
  AND profiles.role IN ('admin', 'super_admin')
));

CREATE POLICY "Admins can delete item images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'item-images' AND EXISTS (
  SELECT 1 FROM profiles 
  WHERE profiles.user_id = auth.uid() 
  AND profiles.role IN ('admin', 'super_admin')
));

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_additional_charges_updated_at
BEFORE UPDATE ON public.additional_charges
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_display_settings_updated_at
BEFORE UPDATE ON public.display_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();