
-- Add missing columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS hotel_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Update the existing enum to include super_admin
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Update profiles table to use the app_role enum
ALTER TABLE profiles ALTER COLUMN role TYPE app_role USING role::app_role;

-- Create function to delete user and all related data
CREATE OR REPLACE FUNCTION public.delete_user_and_data(uid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete from all related tables in correct order
  DELETE FROM bill_items WHERE bill_id IN (SELECT id FROM bills WHERE created_by = uid);
  DELETE FROM bills WHERE created_by = uid;
  DELETE FROM expenses WHERE created_by = uid;
  DELETE FROM profiles WHERE user_id = uid;
  
  -- Finally delete from auth.users
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Update the handle_new_user function to include hotel_name and status
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role, hotel_name, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    CASE 
      WHEN NEW.email = 'bknqwe19@gmail.com' THEN 'super_admin'::app_role
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'user')::app_role
    END,
    COALESCE(NEW.raw_user_meta_data->>'hotel_name', NULL),
    CASE 
      WHEN NEW.email = 'bknqwe19@gmail.com' THEN 'active'
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', 'user') = 'admin' THEN 'paused'
      ELSE 'active'
    END
  );
  RETURN NEW;
END;
$$;
