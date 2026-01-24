
-- Create a trigger function to automatically create profiles when users sign up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name, role, status, hotel_name)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', 'User'),
    COALESCE((new.raw_user_meta_data->>'role')::app_role, 'user'::app_role),
    CASE 
      WHEN COALESCE(new.raw_user_meta_data->>'role', 'user') = 'admin' THEN 'paused'
      ELSE 'active' 
    END,
    new.raw_user_meta_data->>'hotel_name'
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile when user signs up
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
