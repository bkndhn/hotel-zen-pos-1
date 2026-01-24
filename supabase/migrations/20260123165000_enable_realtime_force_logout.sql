-- =============================================
-- FIX: Enable Realtime for instant force logout and permission updates
-- Applied on 2026-01-23
-- =============================================

-- Add tables to supabase_realtime publication for instant updates
-- profiles: for force logout when admin/user is paused
-- user_permissions: for instant page access updates

-- First drop if exists to avoid errors, then add
DO $$
BEGIN
  -- Add profiles to realtime
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- Table already in publication
  END;
  
  -- Add user_permissions to realtime
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_permissions;
  EXCEPTION WHEN duplicate_object THEN
    NULL; -- Table already in publication
  END;
END $$;
