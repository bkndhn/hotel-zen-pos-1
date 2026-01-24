-- Activate the user account
UPDATE profiles 
SET status = 'active', updated_at = now()
WHERE user_id = '01deff0f-46bb-4a0a-af9f-d93d3c3eb7bb';