-- Fix security issues by setting search_path for functions

-- Update generate_bill_number function with proper search_path
CREATE OR REPLACE FUNCTION public.generate_bill_number()
RETURNS text
LANGUAGE plpgsql
SECURITY definer
SET search_path = public
AS $$
DECLARE
    bill_number text;
    counter integer;
    date_prefix text;
BEGIN
    -- Get today's date in YYYYMMDD format
    date_prefix := to_char(CURRENT_DATE, 'YYYYMMDD');
    
    -- Get count of bills created today and add 1
    SELECT COALESCE(COUNT(*) + 1, 1) INTO counter
    FROM bills 
    WHERE date = CURRENT_DATE;
    
    -- Format: YYYYMMDD001, YYYYMMDD002, etc.
    bill_number := date_prefix || LPAD(counter::text, 3, '0');
    
    RETURN bill_number;
END;
$$;

-- Update delete_user_and_data function with proper search_path
CREATE OR REPLACE FUNCTION public.delete_user_and_data(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY definer
SET search_path = public
AS $$
BEGIN
    -- Delete user preferences
    DELETE FROM user_preferences WHERE user_id = uid;
    
    -- Delete expenses created by this user
    DELETE FROM expenses WHERE created_by = uid;
    
    -- Delete bills created by this user (this will cascade to bill_items)
    DELETE FROM bills WHERE created_by = uid;
    
    -- Delete items created by this admin
    DELETE FROM items WHERE admin_id = uid;
    
    -- Delete expense categories (if admin)
    -- Note: We don't delete these as they might be used by other users
    
    -- Delete the profile
    DELETE FROM profiles WHERE user_id = uid;
    
    -- Note: We don't delete from auth.users as that's managed by Supabase Auth
    -- The auth user will be soft-deleted by Supabase's admin functions
END;
$$;