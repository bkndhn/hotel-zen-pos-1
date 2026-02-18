import { useState, useCallback } from 'react';

export interface ProcessedItem {
    id: string;
    type: 'bill' | 'table-order';
    label: string;
    previousStatus: string;
    newStatus: string;
    timestamp: string;
}

export const useKitchenUndo = () => {
    const [recentlyProcessed, setRecentlyProcessed] = useState<ProcessedItem[]>([]);

    const trackBillAction = useCallback((billId: string, billNo: string, previousStatus: string, newStatus: string) => {
        setRecentlyProcessed(prev => [{
            id: billId,
            type: 'bill' as const,
            label: `#${billNo}`,
            previousStatus,
            newStatus,
            timestamp: new Date().toISOString(),
        }, ...prev.filter(p => p.id !== billId)].slice(0, 10));
    }, []);

    const trackTableOrderAction = useCallback((orderId: string, tableNumber: string, previousStatus: string, newStatus: string) => {
        setRecentlyProcessed(prev => [{
            id: orderId,
            type: 'table-order' as const,
            label: `T${tableNumber}`,
            previousStatus,
            newStatus,
            timestamp: new Date().toISOString(),
        }, ...prev.filter(p => p.id !== orderId)].slice(0, 10));
    }, []);

    const removeProcessed = useCallback((id: string) => {
        setRecentlyProcessed(prev => prev.filter(x => x.id !== id));
    }, []);

    return {
        recentlyProcessed,
        trackBillAction,
        trackTableOrderAction,
        removeProcessed,
    };
};
