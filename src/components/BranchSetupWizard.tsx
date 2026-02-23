import React, { useState } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { Building2, ArrowRight, Sparkles } from 'lucide-react';

export const BranchSetupWizard: React.FC = () => {
  const { profile } = useAuth();
  const { needsSetup, refetchBranches } = useBranch();
  const [branchName, setBranchName] = useState('');
  const [saving, setSaving] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('branch_setup_dismissed') === 'true';
  });

  // Only show for admins who haven't set up branches
  if (!needsSetup || profile?.role !== 'admin' || dismissed) return null;

  const handleSetup = async () => {
    const name = branchName.trim() || 'Main Branch';
    setSaving(true);

    try {
      // 1. Create the default branch
      const { data: branch, error } = await supabase
        .from('branches')
        .insert({
          admin_id: profile!.id,
          name,
          is_default: true,
          shop_name: profile!.hotel_name || name,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // 2. Assign existing data to this branch (update all null branch_id records)
      const tables = ['items', 'bills', 'expenses', 'expense_categories', 'item_categories',
        'customers', 'tables', 'additional_charges', 'payments', 'tax_rates', 'promo_banners'];

      for (const table of tables) {
        await supabase
          .from(table as any)
          .update({ branch_id: branch.id } as any)
          .eq('admin_id', profile!.id)
          .is('branch_id', null);
      }

      // Update shop_settings
      await supabase
        .from('shop_settings')
        .update({ branch_id: branch.id } as any)
        .eq('user_id', profile!.user_id)
        .is('branch_id', null);

      toast({
        title: '🎉 Branch Created!',
        description: `"${name}" is set up. All existing data has been assigned to this branch.`,
      });

      await refetchBranches();
    } catch (err: any) {
      console.error('Branch setup error:', err);
      toast({ title: 'Error', description: err.message || 'Failed to set up branch', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('branch_setup_dismissed', 'true');
  };

  return (
    <Dialog open={true} onOpenChange={() => handleDismiss()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-primary/70 rounded-xl flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                Multi-Branch Setup
                <Sparkles className="w-4 h-4 text-amber-500" />
              </div>
            </div>
          </DialogTitle>
          <DialogDescription>
            Set up your first branch to enable multi-location management. All your existing data will be assigned to this branch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Branch Name</Label>
            <Input
              value={branchName}
              onChange={e => setBranchName(e.target.value)}
              placeholder="e.g., Main Branch, Tirupur Main"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-1">
              You can add more branches later from Settings.
            </p>
          </div>
        </div>

        <DialogFooter className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={handleDismiss}>
            Later
          </Button>
          <Button onClick={handleSetup} disabled={saving}>
            {saving ? 'Setting up...' : (
              <>
                Create Branch <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
