
-- Add missing columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hotel_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Update the app_role enum to include super_admin
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Create the delete_user_and_data function
CREATE OR REPLACE FUNCTION public.delete_user_and_data(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete user's bills and related data
  DELETE FROM public.bill_items WHERE bill_id IN (
    SELECT id FROM public.bills WHERE created_by = uid
  );
  DELETE FROM public.bills WHERE created_by = uid;
  
  -- Delete user's expenses
  DELETE FROM public.expenses WHERE created_by = uid;
  
  -- Delete user's items (if they created any)
  DELETE FROM public.items WHERE id IN (
    SELECT i.id FROM public.items i 
    JOIN public.profiles p ON p.user_id = uid 
    WHERE p.role = 'admin'
  );
  
  -- Delete user's profile
  DELETE FROM public.profiles WHERE user_id = uid;
  
  -- Delete the user from auth.users
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
