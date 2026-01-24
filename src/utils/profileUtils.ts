
import { supabase } from '@/integrations/supabase/client';
import { UserStatus } from '@/types/user';

export const updateUserStatus = async (userId: string, status: UserStatus) => {
  const { error } = await supabase
    .from('profiles')
    .update({ status })
    .eq('user_id', userId);
  
  return { error };
};
