import React from 'react';
import { Layers } from 'lucide-react';
import { useBranch } from '@/contexts/BranchContext';

/**
 * Shown on operational pages when admin selected "All Branches".
 * Inserts and edits should be disabled in this mode.
 */
export const AllBranchesReadOnlyBanner: React.FC<{ message?: string }> = ({ message }) => {
  const { isAllBranchesView } = useBranch();
  if (!isAllBranchesView) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 mb-3 flex items-center gap-2 text-xs">
      <Layers className="w-3.5 h-3.5 text-primary shrink-0" />
      <span className="text-foreground">
        <strong>All Branches</strong> — read-only aggregate view.{' '}
        {message || 'Switch to a specific branch to add or edit records.'}
      </span>
    </div>
  );
};
