-- Add payment_details column to bills table to store split payment information
ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_details JSONB DEFAULT '{}';

-- Add additional_charges column to bills table to store additional charges applied
ALTER TABLE bills ADD COLUMN IF NOT EXISTS additional_charges JSONB DEFAULT '[]';

-- Add comment for documentation
COMMENT ON COLUMN bills.payment_details IS 'Stores split payment information as JSON, e.g., {"cash": 100, "card": 50}';
COMMENT ON COLUMN bills.additional_charges IS 'Stores additional charges applied to the bill as JSON array';