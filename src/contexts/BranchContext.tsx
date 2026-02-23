import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Branch {
  id: string;
  admin_id: string;
  name: string;
  code: string | null;
  address: string | null;
  contact_number: string | null;
  logo_url: string | null;
  shop_name: string | null;
  gstin: string | null;
  gst_enabled: boolean;
  is_composition_scheme: boolean;
  composition_rate: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface BranchContextType {
  branches: Branch[];
  currentBranchId: string | null; // null = "All Branches" (admin only)
  currentBranch: Branch | null;
  loading: boolean;
  needsSetup: boolean;
  isMultiBranch: boolean; // true if admin has more than 1 branch
  selectBranch: (branchId: string | null) => void;
  refetchBranches: () => Promise<void>;
  /** Returns branch_id filter value for queries. null means no filter (show all). */
  getBranchFilter: () => string | null;
}

const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { profile, loading: authLoading } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;

  const fetchBranches = useCallback(async () => {
    if (authLoading || !profile?.user_id) {
      setLoading(false);
      return;
    }

    // Super admin doesn't need branches
    if (profile.role === 'super_admin') {
      setLoading(false);
      return;
    }

    try {
      if (profile.role === 'admin') {
        // Admin: fetch all their branches
        const { data, error } = await supabase
          .from('branches')
          .select('*')
          .eq('admin_id', profile.id)
          .eq('is_active', true)
          .order('is_default', { ascending: false })
          .order('name');

        if (error) throw error;

        const branchList = (data || []) as Branch[];
        setBranches(branchList);

        if (branchList.length === 0) {
          setNeedsSetup(true);
          setCurrentBranchId(null);
        } else {
          setNeedsSetup(false);
          // Restore last selected branch from localStorage
          const saved = localStorage.getItem(`branch_selected_${profile.user_id}`);
          if (saved && branchList.some(b => b.id === saved)) {
            setCurrentBranchId(saved);
          } else if (saved === 'all') {
            setCurrentBranchId(null); // All branches
          } else {
            // Default to the default branch or first branch
            const defaultBranch = branchList.find(b => b.is_default) || branchList[0];
            setCurrentBranchId(defaultBranch.id);
          }
        }
      } else if (profile.role === 'user') {
        // Regular user: fetch their assigned branches
        const { data: assignments, error: assignError } = await supabase
          .from('user_branches')
          .select('branch_id')
          .eq('user_id', profile.user_id);

        if (assignError) throw assignError;

        if (assignments && assignments.length > 0) {
          const branchIds = assignments.map(a => a.branch_id);
          const { data, error } = await supabase
            .from('branches')
            .select('*')
            .in('id', branchIds)
            .eq('is_active', true)
            .order('name');

          if (error) throw error;

          const branchList = (data || []) as Branch[];
          setBranches(branchList);

          if (branchList.length === 1) {
            setCurrentBranchId(branchList[0].id);
          } else if (branchList.length > 1) {
            const saved = localStorage.getItem(`branch_selected_${profile.user_id}`);
            if (saved && branchList.some(b => b.id === saved)) {
              setCurrentBranchId(saved);
            } else {
              setCurrentBranchId(branchList[0].id);
            }
          }
        } else {
          // User not assigned to any branch - they'll see data without branch filter (backward compat)
          setBranches([]);
          setCurrentBranchId(null);
        }
      }
    } catch (err) {
      console.error('[BranchContext] Error fetching branches:', err);
    } finally {
      setLoading(false);
    }
  }, [profile?.user_id, profile?.role, profile?.id, profile?.admin_id, authLoading]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const selectBranch = useCallback((branchId: string | null) => {
    setCurrentBranchId(branchId);
    if (profile?.user_id) {
      localStorage.setItem(`branch_selected_${profile.user_id}`, branchId || 'all');
    }
    // Dispatch event for pages to react
    window.dispatchEvent(new CustomEvent('branch-changed', { detail: branchId }));
  }, [profile?.user_id]);

  const currentBranch = branches.find(b => b.id === currentBranchId) || null;
  const isMultiBranch = branches.length > 1;

  const getBranchFilter = useCallback((): string | null => {
    // If no branches exist yet, return null (backward compat - no filter)
    if (branches.length === 0) return null;
    // If "All Branches" selected (admin only), return null
    if (currentBranchId === null) return null;
    return currentBranchId;
  }, [branches.length, currentBranchId]);

  return (
    <BranchContext.Provider value={{
      branches,
      currentBranchId,
      currentBranch,
      loading,
      needsSetup,
      isMultiBranch,
      selectBranch,
      refetchBranches: fetchBranches,
      getBranchFilter,
    }}>
      {children}
    </BranchContext.Provider>
  );
};

export const useBranch = (): BranchContextType => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranch must be used within a BranchProvider');
  }
  return context;
};
