-- Add new fields to items table for enhanced item management
ALTER TABLE public.items 
ADD COLUMN description TEXT,
ADD COLUMN purchase_rate NUMERIC,
ADD COLUMN unit TEXT DEFAULT 'Piece (pc)',
ADD COLUMN base_value NUMERIC DEFAULT 1,  
ADD COLUMN stock_quantity NUMERIC DEFAULT 0,
ADD COLUMN minimum_stock_alert NUMERIC DEFAULT 0,
ADD COLUMN quantity_step NUMERIC DEFAULT 1;

-- Add comment to explain the new fields
COMMENT ON COLUMN public.items.description IS 'Item description for better identification';
COMMENT ON COLUMN public.items.purchase_rate IS 'Cost price or purchase rate of the item';
COMMENT ON COLUMN public.items.unit IS 'Unit of measurement (e.g., Piece, Kg, Liter)';
COMMENT ON COLUMN public.items.base_value IS 'Base value for unit calculations';
COMMENT ON COLUMN public.items.stock_quantity IS 'Current stock quantity available';
COMMENT ON COLUMN public.items.minimum_stock_alert IS 'Minimum stock level for alerts';
COMMENT ON COLUMN public.items.quantity_step IS 'Step increment for quantity adjustments in billing';