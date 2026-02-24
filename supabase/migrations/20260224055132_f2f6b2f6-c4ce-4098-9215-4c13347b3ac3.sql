
-- Add multi_branch_enabled flag to profiles for premium branch feature control
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS multi_branch_enabled boolean DEFAULT false;
