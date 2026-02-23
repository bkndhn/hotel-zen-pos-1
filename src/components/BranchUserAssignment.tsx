import React, { useState, useEffect } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Building2, Users } from 'lucide-react';
import type { UserProfile } from '@/types/user';

interface BranchUserAssignmentProps {
  users: UserProfile[];
}

export const BranchUserAssignment: React.FC<BranchUserAssignmentProps> = ({ users }) => {
  const { profile } = useAuth();
  const { branches } = useBranch();
  const [assignments, setAssignments] = useState<Record<string, string[]>>({}); // userId -> branchIds
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAssignments();
  }, [users, branches]);

  const fetchAssignments = async () => {
    if (users.length === 0 || branches.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const userIds = users.map(u => u.user_id);
      const { data, error } = await supabase
        .from('user_branches')
        .select('user_id, branch_id')
        .in('user_id', userIds);

      if (error) throw error;

      const map: Record<string, string[]> = {};
      users.forEach(u => { map[u.user_id] = []; });
      (data || []).forEach((row: any) => {
        if (map[row.user_id]) {
          map[row.user_id].push(row.branch_id);
        }
      });

      setAssignments(map);
    } catch (err) {
      console.error('Error fetching branch assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleAssignment = async (userId: string, branchId: string, isAssigned: boolean) => {
    // Optimistic update
    setAssignments(prev => {
      const updated = { ...prev };
      if (isAssigned) {
        updated[userId] = (updated[userId] || []).filter(id => id !== branchId);
      } else {
        updated[userId] = [...(updated[userId] || []), branchId];
      }
      return updated;
    });

    try {
      if (isAssigned) {
        const { error } = await supabase
          .from('user_branches')
          .delete()
          .eq('user_id', userId)
          .eq('branch_id', branchId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('user_branches')
          .insert({ user_id: userId, branch_id: branchId } as any);
        if (error) throw error;
      }

      const branchName = branches.find(b => b.id === branchId)?.name || 'branch';
      toast({
        title: isAssigned ? 'Branch Removed' : 'Branch Assigned',
        description: `User ${isAssigned ? 'removed from' : 'assigned to'} ${branchName}`,
      });
    } catch (err: any) {
      console.error('Error toggling branch assignment:', err);
      // Revert
      fetchAssignments();
      toast({ title: 'Error', description: 'Failed to update assignment', variant: 'destructive' });
    }
  };

  if (profile?.role !== 'admin' || branches.length === 0) return null;

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </CardContent>
      </Card>
    );
  }

  const subUsers = users.filter(u => u.role === 'user');

  if (subUsers.length === 0) return null;

  return (
    <Card>
      <CardHeader className="p-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Building2 className="w-5 h-5" />
          Branch Staff Assignment
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Assign staff to branches. Users will only see data from their assigned branches.
        </p>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        {subUsers.map(user => (
          <div key={user.id} className="border rounded-lg overflow-hidden">
            <div className="bg-muted/50 p-3 border-b">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="font-semibold text-sm">{user.name}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {(assignments[user.user_id] || []).length} branch(es)
                </Badge>
              </div>
            </div>
            <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {branches.map(branch => {
                const isAssigned = (assignments[user.user_id] || []).includes(branch.id);
                return (
                  <div
                    key={branch.id}
                    onClick={() => toggleAssignment(user.user_id, branch.id, isAssigned)}
                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                      isAssigned
                        ? 'bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800'
                        : 'bg-muted/30 border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium ${isAssigned ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}`}>
                        {branch.name}
                      </span>
                      <Switch
                        checked={isAssigned}
                        onCheckedChange={() => {}}
                        className="pointer-events-none scale-75"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
