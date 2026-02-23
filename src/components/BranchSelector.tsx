import React from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export const BranchSelector: React.FC = () => {
  const { profile } = useAuth();
  const { branches, currentBranchId, selectBranch, loading, needsSetup } = useBranch();

  // Don't show for super admin or if no branches exist yet
  if (!profile || profile.role === 'super_admin' || loading || branches.length === 0) {
    return null;
  }

  // If only one branch, show it as a static badge
  if (branches.length === 1) {
    return (
      <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/50">
        <Building2 className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-medium text-foreground truncate max-w-[120px]">
          {branches[0].name}
        </span>
      </div>
    );
  }

  const isAdmin = profile.role === 'admin';

  return (
    <Select
      value={currentBranchId || 'all'}
      onValueChange={(val) => selectBranch(val === 'all' ? null : val)}
    >
      <SelectTrigger className="h-8 w-[140px] sm:w-[180px] text-xs border-border/50 bg-muted/40">
        <div className="flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
          <SelectValue placeholder="Select Branch" />
        </div>
      </SelectTrigger>
      <SelectContent>
        {isAdmin && (
          <SelectItem value="all" className="text-xs font-medium">
            📊 All Branches
          </SelectItem>
        )}
        {branches.map(branch => (
          <SelectItem key={branch.id} value={branch.id} className="text-xs">
            {branch.name}
            {branch.is_default && ' ⭐'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
