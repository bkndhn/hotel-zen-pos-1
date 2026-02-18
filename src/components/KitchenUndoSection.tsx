import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Undo2 } from 'lucide-react';
import { ProcessedItem } from '@/hooks/useKitchenUndo';

interface KitchenUndoSectionProps {
    recentlyProcessed: ProcessedItem[];
    onUndoBill: (id: string, billNo: string, previousStatus: string) => void;
    onUndoTableOrder: (id: string, previousStatus: string) => void;
    onRemoveProcessed: (id: string) => void;
}

const KitchenUndoSection = ({
    recentlyProcessed,
    onUndoBill,
    onUndoTableOrder,
    onRemoveProcessed,
}: KitchenUndoSectionProps) => {
    const undoItems = recentlyProcessed.filter(p => {
        const elapsed = Date.now() - new Date(p.timestamp).getTime();
        return elapsed < 5 * 60 * 1000;
    });

    if (undoItems.length === 0) return null;

    return (
        <div className="mt-6 pt-4 border-t border-dashed">
            <h3 className="text-sm font-bold text-muted-foreground mb-3 flex items-center gap-2 uppercase tracking-widest">
                <Undo2 className="w-4 h-4" />
                Recently Processed (Undo)
            </h3>
            <div className="flex flex-wrap gap-2">
                {undoItems.map((p) => (
                    <Button
                        key={p.id}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                            if (p.type === 'bill') {
                                onUndoBill(p.id, p.label.replace('#', ''), p.previousStatus);
                            } else {
                                onUndoTableOrder(p.id, p.previousStatus);
                            }
                            onRemoveProcessed(p.id);
                        }}
                        className="gap-2 h-10 border-2 hover:bg-muted/50"
                    >
                        <Undo2 className="w-3 h-3 text-muted-foreground" />
                        <span className="font-bold">{p.label}</span>
                        <Badge
                            variant={p.newStatus === 'ready' ? 'default' : 'secondary'}
                            className="h-5 px-1.5 min-w-[20px] justify-center text-[10px]"
                        >
                            {p.previousStatus} {'\u2190'} {p.newStatus}
                        </Badge>
                    </Button>
                ))}
            </div>
        </div>
    );
};

export default KitchenUndoSection;
