import { useCallback } from 'react';
import { useBranch } from '@/contexts/BranchContext';

/**
 * Hook that provides branch-aware query helpers.
 */
export const useBranchFilter = () => {
  const { getBranchFilter, currentBranchId, branches } = useBranch();

  /**
   * Get the current branch_id to filter queries.
   * Returns null if no filter should be applied.
   */
  const branchId = getBranchFilter();

  /**
   * Get branch_id to use when inserting new records.
   * Returns null if no branches are set up.
   */
  const getInsertBranchId = useCallback((): string | null => {
    if (branches.length === 0) return null;
    if (currentBranchId) return currentBranchId;
    const defaultBranch = branches.find(b => b.is_default);
    return defaultBranch?.id || branches[0]?.id || null;
  }, [currentBranchId, branches]);

  return {
    branchId,
    getInsertBranchId,
    hasBranches: branches.length > 0,
    currentBranchId,
  };
};
