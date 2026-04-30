import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Building2, Save, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Branch {
  id: string;
  name: string;
  is_main: boolean;
}

interface Props {
  /** profiles.user_id of the sub-user (used in user_branches.user_id) */
  subUserAuthId: string;
  /** profiles.id of the admin owning the branches */
  adminId: string;
  className?: string;
}

/**
 * Editor: assigns a sub-user to one or more of the admin's branches.
 * Writes to public.user_branches (user_id = auth user id, branch_id).
 */
export const SubUserBranchAssignments: React.FC<Props> = ({ subUserAuthId, adminId, className }) => {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [original, setOriginal] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: br }, { data: ub }] = await Promise.all([
          supabase
            .from('branches')
            .select('id,name,is_main')
            .eq('admin_id', adminId)
            .eq('is_active', true)
            .order('is_main', { ascending: false })
            .order('created_at', { ascending: true }),
          supabase
            .from('user_branches')
            .select('branch_id')
            .eq('user_id', subUserAuthId),
        ]);
        if (cancelled) return;
        const list = (br || []) as Branch[];
        setBranches(list);
        const set = new Set<string>((ub || []).map((r: any) => r.branch_id));
        setAssigned(set);
        setOriginal(new Set(set));
      } catch (e) {
        console.error('Load branch assignments failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adminId, subUserAuthId]);

  const toggle = (branchId: string) => {
    setAssigned(prev => {
      const next = new Set(prev);
      if (next.has(branchId)) next.delete(branchId);
      else next.add(branchId);
      return next;
    });
  };

  const dirty = (() => {
    if (assigned.size !== original.size) return true;
    for (const id of assigned) if (!original.has(id)) return true;
    return false;
  })();

  const save = async () => {
    setSaving(true);
    try {
      const toAdd: string[] = [];
      const toRemove: string[] = [];
      assigned.forEach(id => { if (!original.has(id)) toAdd.push(id); });
      original.forEach(id => { if (!assigned.has(id)) toRemove.push(id); });

      if (toRemove.length) {
        const { error } = await supabase
          .from('user_branches')
          .delete()
          .eq('user_id', subUserAuthId)
          .in('branch_id', toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase
          .from('user_branches')
          .insert(toAdd.map(branch_id => ({ user_id: subUserAuthId, branch_id })));
        if (error) throw error;
      }
      setOriginal(new Set(assigned));
      toast({ title: '✅ Branches updated', description: 'Assignments saved.' });
    } catch (e: any) {
      console.error(e);
      toast({ title: 'Error', description: e?.message || 'Failed to save assignments', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-xs text-muted-foreground ${className || ''}`}>
        <Loader2 className="w-3 h-3 animate-spin" /> Loading branches…
      </div>
    );
  }

  if (branches.length === 0) {
    return (
      <div className={`text-xs text-muted-foreground ${className || ''}`}>
        No branches available. Create a branch first.
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className || ''}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Building2 className="w-3.5 h-3.5" /> Branch access
      </div>
      <div className="flex flex-wrap gap-2">
        {branches.map(b => (
          <label
            key={b.id}
            className="flex items-center gap-1.5 px-2 py-1 rounded border bg-background cursor-pointer text-xs hover:bg-muted/50"
          >
            <Checkbox
              checked={assigned.has(b.id)}
              onCheckedChange={() => toggle(b.id)}
            />
            <span>{b.name}{b.is_main && <span className="text-[10px] text-muted-foreground ml-1">(Main)</span>}</span>
          </label>
        ))}
      </div>
      {dirty && (
        <Button size="sm" variant="outline" onClick={save} disabled={saving} className="h-7 text-xs">
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
          Save assignments
        </Button>
      )}
      {assigned.size === 0 && (
        <p className="text-[11px] text-warning">
          ⚠ No branches assigned — this sub-user will not see any data.
        </p>
      )}
    </div>
  );
};
