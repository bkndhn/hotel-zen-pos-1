import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { getTimeElapsed, formatQuantityWithUnit } from '@/utils/timeUtils';
import { cn } from '@/lib/utils';

interface KitchenBillItem {
    id: string;
    quantity: number;
    items: {
        id: string;
        name: string;
        unit?: string;
        base_value?: number;
    } | null;
}

export interface KitchenBill {
    id: string;
    bill_no: string;
    created_at: string;
    kitchen_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    service_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    bill_items: KitchenBillItem[];
    table_no?: string;
}

interface KitchenOrderCardProps {
    bill: KitchenBill;
    processing: boolean;
    onAction: () => void;
    actionLabel: string;
    actionColor: string;
}

const KitchenOrderCard: React.FC<KitchenOrderCardProps> = ({
    bill,
    processing,
    onAction,
    actionLabel,
    actionColor,
}) => {
    return (
        <Card className={cn("p-4", processing && "opacity-50")}>
            {/* Bill Header */}
            <div className="flex items-start justify-between mb-3">
                <h3 className="text-2xl font-bold">#{bill.bill_no}</h3>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />
                    {getTimeElapsed(bill.created_at)}
                </div>
                {bill.table_no && (
                    <span className="text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded absolute right-4 top-10">
                        {bill.table_no}
                    </span>
                )}
            </div>

            {/* Items List */}
            <div className="space-y-2 mb-3">
                {bill.bill_items.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2"
                    >
                        <span className="font-medium flex-1">
                            {item.items?.name || 'Unknown'}
                        </span>
                        <Badge
                            variant="secondary"
                            className="font-bold text-base min-w-[60px] justify-center ml-2"
                        >
                            {formatQuantityWithUnit(item.quantity, item.items?.unit)}
                        </Badge>
                    </div>
                ))}
            </div>

            {/* Action Button */}
            <Button
                onClick={onAction}
                disabled={processing}
                className={cn("w-full text-white", actionColor)}
            >
                {processing ? 'Processing...' : actionLabel}
            </Button>
        </Card>
    );
};

export default KitchenOrderCard;
