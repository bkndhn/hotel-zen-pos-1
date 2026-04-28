import { useEffect } from 'react';
import { useBranch } from '@/contexts/BranchContext';

/**
 * Hook that returns the current branch filter context for queries.
 *
 * Behavior:
 * - When admin is in "All Branches" view, `branchFilterId` is null (don't filter).
 *   Pages should treat this as READ-ONLY aggregate.
 * - Otherwise, `branchFilterId` is the active branch id and queries should filter by it.
 * - `operatingBranchId` is what to write into new records (inserts).
 * - `readOnly` is true when in All-Branches view — pages should disable mutating UI.
 *
 * Pass an `onChange` callback to refetch data when the user switches branches.
 */
export function useBranchScopedQuery(onChange?: () => void) {
  const {
    activeBranch,
    isAllBranchesView,
    operatingBranchId,
    branches,
    loading,
  } = useBranch();

  useEffect(() => {
    if (!onChange) return;
    const handler = () => onChange();
    window.addEventListener('branch-changed', handler);
    return () => window.removeEventListener('branch-changed', handler);
  }, [onChange]);

  return {
    /** Use this in `.eq('branch_id', ...)` filters. null = All Branches (don't filter). */
    branchFilterId: isAllBranchesView ? null : (activeBranch?.id ?? null),
    /** Use this when inserting new records. Falls back to Main branch. */
    operatingBranchId,
    /** True when admin selected "All Branches" — UI should disable inserts/updates. */
    readOnly: isAllBranchesView,
    isAllBranchesView,
    activeBranch,
    branches,
    loading,
  };
}

/**
 * Helper: apply branch filter to a Supabase query builder if a branch is selected.
 * Returns the (possibly filtered) query.
 */
export function applyBranchFilter<T>(query: T, branchFilterId: string | null): T {
  if (!branchFilterId) return query;
  // @ts-ignore - supabase query builder has chainable .eq
  return query.eq('branch_id', branchFilterId);
}
