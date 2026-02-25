import React, { useState, useEffect } from 'react';
import { useBranch, Branch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { Building2, Plus, Edit, Trash2, Star, MapPin, Phone, LinkIcon } from 'lucide-react';

export const BranchManagement: React.FC = () => {
  const { profile } = useAuth();
  const { branches, refetchBranches } = useBranch();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Branch | null>(null);
  const [saving, setSaving] = useState(false);
  const [multiBranchEnabled, setMultiBranchEnabled] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    address: '',
    contact_number: '',
    shop_name: '',
    gstin: '',
    gst_enabled: false,
    is_default: false,
  });

  // Check if multi-branch is enabled for this admin
  useEffect(() => {
    const checkMultiBranch = async () => {
      if (!profile || profile.role !== 'admin') return;
      const { data } = await supabase
        .from('profiles')
        .select('multi_branch_enabled')
        .eq('id', profile.id)
        .single();
      setMultiBranchEnabled(data?.multi_branch_enabled || false);
    };
    checkMultiBranch();
  }, [profile]);

  if (profile?.role !== 'admin') return null;

  const resetForm = () => {
    setFormData({
      name: '', code: '', address: '', contact_number: '',
      shop_name: '', gstin: '', gst_enabled: false, is_default: false,
    });
    setEditingBranch(null);
  };

  const openAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (branch: Branch) => {
    setEditingBranch(branch);
    setFormData({
      name: branch.name,
      code: branch.code || '',
      address: branch.address || '',
      contact_number: branch.contact_number || '',
      shop_name: branch.shop_name || '',
      gstin: branch.gstin || '',
      gst_enabled: branch.gst_enabled,
      is_default: branch.is_default,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Branch name is required', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      if (formData.is_default && !editingBranch?.is_default) {
        // Remove default from other branches
        await supabase
          .from('branches')
          .update({ is_default: false } as any)
          .eq('admin_id', profile!.id);
      }

      if (editingBranch) {
        const { error } = await supabase
          .from('branches')
          .update({
            name: formData.name.trim(),
            code: formData.code.trim() || null,
            address: formData.address.trim() || null,
            contact_number: formData.contact_number.trim() || null,
            shop_name: formData.shop_name.trim() || null,
            gstin: formData.gstin.trim() || null,
            gst_enabled: formData.gst_enabled,
            is_default: formData.is_default,
          } as any)
          .eq('id', editingBranch.id);

        if (error) throw error;
        toast({ title: 'Branch Updated', description: `${formData.name} updated successfully` });
      } else {
        const { error } = await supabase
          .from('branches')
          .insert({
            admin_id: profile!.id,
            name: formData.name.trim(),
            code: formData.code.trim() || null,
            address: formData.address.trim() || null,
            contact_number: formData.contact_number.trim() || null,
            shop_name: formData.shop_name.trim() || null,
            gstin: formData.gstin.trim() || null,
            gst_enabled: formData.gst_enabled,
            is_default: formData.is_default || branches.length === 0,
          } as any);

        if (error) throw error;
        toast({ title: 'Branch Created', description: `${formData.name} created successfully` });
      }

      setDialogOpen(false);
      resetForm();
      await refetchBranches();
    } catch (error: any) {
      console.error('Error saving branch:', error);
      toast({ title: 'Error', description: error.message || 'Failed to save branch', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const { error } = await supabase
        .from('branches')
        .update({ is_active: false } as any)
        .eq('id', deleteConfirm.id);

      if (error) throw error;
      toast({ title: 'Branch Deactivated', description: `${deleteConfirm.name} has been deactivated` });
      setDeleteConfirm(null);
      await refetchBranches();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete branch', variant: 'destructive' });
    }
  };

  const assignOrphanData = async () => {
    const defaultBranch = branches.find(b => b.is_default) || branches[0];
    if (!defaultBranch) return;

    setSaving(true);
    try {
      // Assign orphan items, expenses, tables, customers, etc. to default branch
      const tables = ['items', 'expenses', 'tables', 'customers', 'additional_charges', 'item_categories', 'expense_categories', 'payments'];
      let totalUpdated = 0;

      for (const table of tables) {
        const { data, error } = await supabase
          .from(table as any)
          .update({ branch_id: defaultBranch.id } as any)
          .eq('admin_id', profile!.id)
          .is('branch_id', null)
          .select('id');

        if (!error && data) totalUpdated += data.length;
      }

      if (totalUpdated > 0) {
        toast({
          title: 'Data Assigned',
          description: `${totalUpdated} records assigned to "${defaultBranch.name}"`,
        });
      } else {
        toast({
          title: 'All Clear',
          description: 'All records are already assigned to a branch',
        });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to assign data', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              <span className="text-base sm:text-lg">Branch Management</span>
            </div>
            <div className="flex items-center gap-2">
              {!multiBranchEnabled && branches.length >= 1 && (
                <Badge variant="outline" className="text-[10px] shrink-0">Single Branch</Badge>
              )}
              <Button onClick={openAdd} size="sm" disabled={!multiBranchEnabled && branches.length >= 1}>
                <Plus className="w-4 h-4 mr-1" /> Add Branch
              </Button>
            </div>
          </CardTitle>
          {!multiBranchEnabled && branches.length >= 1 && (
            <p className="text-xs text-muted-foreground">
              Multi-branch is a premium feature. Contact your super admin to enable it.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Manage your business branches. Each branch has isolated items, billing, expenses, and settings.
          </p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6 pt-0">
          {branches.length === 0 ? (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <h3 className="font-semibold mb-1">No Branches Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create your first branch to enable multi-location management.
              </p>
              <Button onClick={openAdd}>
                <Plus className="w-4 h-4 mr-2" /> Create First Branch
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {branches.map(branch => (
                <Card key={branch.id} className="p-3 border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-sm truncate">{branch.name}</h3>
                        {branch.is_default && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1 shrink-0">
                            <Star className="w-2.5 h-2.5 mr-0.5" /> Default
                          </Badge>
                        )}
                      </div>
                      {branch.code && (
                        <Badge variant="secondary" className="text-[10px] mb-1">{branch.code}</Badge>
                      )}
                      {branch.address && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {branch.address}
                        </p>
                      )}
                      {branch.contact_number && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {branch.contact_number}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(branch)}>
                        <Edit className="w-3 h-3" />
                      </Button>
                      {!branch.is_default && (
                        <Button variant="outline" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteConfirm(branch)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {branches.length > 0 && (
            <div className="mt-3 pt-3 border-t">
              <Button variant="outline" size="sm" onClick={assignOrphanData} disabled={saving} className="w-full">
                <LinkIcon className="w-3.5 h-3.5 mr-1.5" />
                {saving ? 'Assigning...' : 'Assign Unlinked Data to Default Branch'}
              </Button>
              <p className="text-[10px] text-muted-foreground mt-1 text-center">
                Assigns items, expenses, tables, etc. without a branch to the default branch
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBranch ? 'Edit Branch' : 'Add New Branch'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Branch Name *</Label>
              <Input
                value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g., Main Branch, Anna Nagar"
              />
            </div>
            <div>
              <Label>Branch Code</Label>
              <Input
                value={formData.code}
                onChange={e => setFormData(p => ({ ...p, code: e.target.value }))}
                placeholder="e.g., BR1, AN"
              />
            </div>
            <div>
              <Label>Shop Name (for this branch)</Label>
              <Input
                value={formData.shop_name}
                onChange={e => setFormData(p => ({ ...p, shop_name: e.target.value }))}
                placeholder="e.g., Hotel ABC - Anna Nagar"
              />
            </div>
            <div>
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
                placeholder="Branch address"
              />
            </div>
            <div>
              <Label>Contact Number</Label>
              <Input
                value={formData.contact_number}
                onChange={e => setFormData(p => ({ ...p, contact_number: e.target.value }))}
                placeholder="Phone number"
              />
            </div>
            <div>
              <Label>GSTIN</Label>
              <Input
                value={formData.gstin}
                onChange={e => setFormData(p => ({ ...p, gstin: e.target.value }))}
                placeholder="GST number for this branch"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>GST Enabled</Label>
              <Switch
                checked={formData.gst_enabled}
                onCheckedChange={val => setFormData(p => ({ ...p, gst_enabled: val }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Set as Default Branch</Label>
              <Switch
                checked={formData.is_default}
                onCheckedChange={val => setFormData(p => ({ ...p, is_default: val }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editingBranch ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Branch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate "{deleteConfirm?.name}". The branch data will be preserved but hidden. This action can be reversed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
