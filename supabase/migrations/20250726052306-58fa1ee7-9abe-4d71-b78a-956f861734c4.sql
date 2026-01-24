
-- Set up the super admin account
-- First, we need to create a function to set a user as super admin
CREATE OR REPLACE FUNCTION public.set_super_admin(admin_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    user_uuid UUID;
BEGIN
    -- Find the user by email in auth.users
    SELECT id INTO user_uuid 
    FROM auth.users 
    WHERE email = admin_email;
    
    IF user_uuid IS NOT NULL THEN
        -- Update or insert the profile as super_admin
        INSERT INTO profiles (user_id, name, role, status, hotel_name)
        VALUES (user_uuid, 'Super Admin', 'super_admin', 'active', 'System Admin')
        ON CONFLICT (user_id) 
        DO UPDATE SET 
            role = 'super_admin',
            status = 'active',
            hotel_name = 'System Admin',
            updated_at = now();
    END IF;
END;
$$;

-- Call the function to set the super admin (this will only work if the user exists)
-- The user with email bknqwe19@gmail.com will be set as super admin when they sign up
SELECT set_super_admin('bknqwe19@gmail.com');

-- Create a trigger function that automatically sets specific emails as super admin
CREATE OR REPLACE FUNCTION public.check_super_admin_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Check if the new user's email matches the super admin email
    IF NEW.email = 'bknqwe19@gmail.com' THEN
        -- Update the profile to super_admin role immediately
        UPDATE profiles 
        SET role = 'super_admin', 
            status = 'active', 
            hotel_name = 'System Admin',
            updated_at = now()
        WHERE user_id = NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$;

-- Create trigger to automatically set super admin on signup
DROP TRIGGER IF EXISTS check_super_admin_trigger ON auth.users;
CREATE TRIGGER check_super_admin_trigger
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION check_super_admin_on_signup();
