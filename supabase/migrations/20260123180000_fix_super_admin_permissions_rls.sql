-- =============================================
-- FIX: Allow Super Admin to manage user_permissions
-- Applied on 2026-01-23
-- =============================================

-- Drop existing policies that restrict to just 'admin'
DROP POLICY IF EXISTS "Admins can view all permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can insert permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can update permissions" ON user_permissions;
DROP POLICY IF EXISTS "Admins can delete permissions" ON user_permissions;

-- Re-create policies including 'super_admin'

-- 1. View: Admins and Super Admins can view all
CREATE POLICY "Admins and Super Admins can view all permissions" 
ON user_permissions FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);

-- 2. Insert: Admins and Super Admins can insert
CREATE POLICY "Admins and Super Admins can insert permissions" 
ON user_permissions FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);

-- 3. Update: Admins and Super Admins can update
CREATE POLICY "Admins and Super Admins can update permissions" 
ON user_permissions FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);

-- 4. Delete: Admins and Super Admins can delete
CREATE POLICY "Admins and Super Admins can delete permissions" 
ON user_permissions FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.role = 'admin' OR profiles.role = 'super_admin')
  )
);
