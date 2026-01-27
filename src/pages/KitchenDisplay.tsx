import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChefHat, Clock, Bell, Volume2, VolumeX, Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { getTimeElapsed, formatTimeAMPM, formatQuantityWithUnit } from '@/utils/timeUtils';
import { cn } from '@/lib/utils';
import { kitchenOfflineManager } from '@/utils/kitchenOfflineManager';

// BroadcastChannel for instant cross-tab sync
const billsChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bills-updates') : null;

// Type definition for kitchen bills
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

interface KitchenBill {
    id: string;
    bill_no: string;
    created_at: string;
    kitchen_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    service_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    bill_items: KitchenBillItem[];
}

const KitchenDisplay = () => {
    const [bills, setBills] = useState<KitchenBill[]>([]);
    const [loading, setLoading] = useState(true);
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const [processingBillId, setProcessingBillId] = useState<string | null>(null);
    const [voiceEnabled, setVoiceEnabled] = useState(true);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isOnline, setIsOnline] = useState(true); // Start optimistic
    const [pendingUpdatesCount, setPendingUpdatesCount] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const syncChannelRef = useRef<any>(null);
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Update current time every minute
    useEffect(() => {
        const interval = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(interval);
    }, []);

    // Monitor online status using native browser API (more reliable)
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Also check with offline manager but don't block on it
        const checkPending = async () => {
            try {
                const pending = await kitchenOfflineManager.getPendingUpdates();
                setPendingUpdatesCount(pending.length);
            } catch (e) {
                console.warn('[Kitchen] Offline manager error:', e);
            }
        };
        checkPending();
        const interval = setInterval(checkPending, 10000); // Less frequent

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(interval);
        };
    }, []);

    // Voice announcement function
    const announce = useCallback((text: string) => {
        if (!voiceEnabled || !('speechSynthesis' in window)) return;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-IN';
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        window.speechSynthesis.speak(utterance);
    }, [voiceEnabled]);

    // Fetch kitchen orders - always try online first, with timeout
    const fetchBills = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);

        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        try {
            // Always try to fetch from server first with a timeout
            const query = (supabase as any)
                .from('bills')
                .select(`
                    id, bill_no, created_at, kitchen_status, service_status,
                    bill_items (
                        id, quantity, items (id, name, unit, base_value)
                    )
                `)
                .eq('date', today)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .in('kitchen_status', ['pending', 'preparing', 'ready'])
                .neq('service_status', 'completed')
                .neq('service_status', 'rejected')
                .order('created_at', { ascending: true });

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                fetchTimeoutRef.current = setTimeout(() => reject(new Error('Timeout')), 8000);
            });

            const result = await Promise.race([query, timeoutPromise]) as any;
            if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);

            if (result.error) throw result.error;

            const serverBills = result.data || [];
            setBills(serverBills);
            setIsOnline(true);

            // Cache for offline use (non-blocking)
            kitchenOfflineManager.cacheBills(serverBills).catch(console.warn);

        } catch (error) {
            console.warn('Error fetching kitchen bills:', error);
            setIsOnline(false);

            // Fallback to cache on error
            try {
                const cachedBills = await kitchenOfflineManager.getCachedBills();
                setBills(cachedBills);
                if (!silent && cachedBills.length > 0) {
                    toast({
                        title: '📴 Using Cached Data',
                        description: `Showing ${cachedBills.length} cached orders`,
                    });
                }
            } catch (cacheError) {
                console.warn('Cache error:', cacheError);
                // Just show empty if cache also fails
                setBills([]);
            }
        } finally {
            if (!silent) setLoading(false);
            setInitialLoadDone(true);
        }
    }, []);

    // Track known bill IDs to detect new orders
    const knownBillIds = useRef<Set<string>>(new Set());

    // Setup Global Sync Channel for Cross-Device updates
    useEffect(() => {
        if (!isOnline) return;

        const channel = supabase.channel('pos-global-sync', {
            config: { broadcast: { self: true } }
        })
            .on('broadcast', { event: 'bills-updated' }, (payload: any) => {
                console.log('Kitchen: Cross-device broadcast received!', payload);
                fetchBills(true);
            })
            .on('broadcast', { event: 'new-bill' }, (payload: any) => {
                console.log('Kitchen: New bill broadcast received!', payload);
                if (voiceEnabled && payload?.payload?.bill_no) {
                    announce(`New order received, Bill number ${payload.payload.bill_no}`);
                }
                fetchBills(true);
            })
            .subscribe();

        syncChannelRef.current = channel;
        return () => { supabase.removeChannel(channel); };
    }, [fetchBills, voiceEnabled, announce, isOnline]);

    // Initial fetch with cleanup
    useEffect(() => {
        fetchBills();
        const pollInterval = setInterval(() => fetchBills(true), 30000);
        return () => {
            clearInterval(pollInterval);
            if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        };
    }, [fetchBills]);

    // Realtime subscription (backup - slower but reliable)
    useEffect(() => {
        if (!isOnline) return;

        const channel = supabase
            .channel('kitchen-sync')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bills' }, (payload) => {
                const billNo = payload.new?.bill_no;
                const billId = payload.new?.id;
                if (billId && !knownBillIds.current.has(billId)) {
                    knownBillIds.current.add(billId);
                    if (voiceEnabled && billNo) {
                        announce(`New order received, Bill number ${billNo}`);
                    }
                }
                fetchBills(true);
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bills' }, () => {
                fetchBills(true);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [fetchBills, voiceEnabled, announce, isOnline]);

    // Listen for BroadcastChannel updates (0ms same-device sync)
    useEffect(() => {
        if (!billsChannel) return;

        const handleMessage = (event: MessageEvent) => {
            const data = event.data;

            if (data?.type === 'new-bill' && voiceEnabled && data?.bill_no) {
                if (data?.bill_id && !knownBillIds.current.has(data.bill_id)) {
                    knownBillIds.current.add(data.bill_id);
                    announce(`New order received, Bill number ${data.bill_no}`);
                }
            }

            fetchBills(true);
        };

        billsChannel.addEventListener('message', handleMessage);
        return () => billsChannel.removeEventListener('message', handleMessage);
    }, [fetchBills, voiceEnabled, announce]);

    // Listen for offline bills updates
    useEffect(() => {
        const unsubBills = kitchenOfflineManager.onBillsChange((updatedBills) => {
            setBills(updatedBills);
        });
        return unsubBills;
    }, []);

    /**
     * OPTIMISTIC UPDATE with OFFLINE SUPPORT
     */
    const updateKitchenStatus = async (
        billId: string,
        billNo: string,
        status: 'preparing' | 'ready'
    ) => {
        const prevBills = [...bills];

        // 1. Instant local update (Optimistic UI)
        setBills(prev => prev.map(bill =>
            bill.id === billId
                ? { ...bill, kitchen_status: status, service_status: status === 'ready' ? 'ready' : bill.service_status }
                : bill
        ));

        try {
            if (isOnline) {
                // 2a. Online: Update server directly
                const updateData: any = { kitchen_status: status };
                if (status === 'ready') updateData.service_status = 'ready';

                const { error } = await supabase
                    .from('bills')
                    .update(updateData)
                    .eq('id', billId);

                if (error) throw error;

                // Sync others
                billsChannel?.postMessage({ type: 'update', timestamp: Date.now() });
                syncChannelRef.current?.send({
                    type: 'broadcast',
                    event: 'bills-updated',
                    payload: { bill_id: billId, status }
                });
            } else {
                // 2b. Offline: Save to IndexedDB for later sync
                await kitchenOfflineManager.saveOfflineUpdate(billId, status);

                toast({
                    title: '📴 Saved Offline',
                    description: `Will sync when online`,
                });
            }

            // Voice feedback
            if (status === 'ready') {
                announce(`Bill number ${billNo} is ready`);
                toast({ title: '🔔 Order Ready!', description: `Bill #${billNo} is ready` });
            } else {
                toast({ title: '👨‍🍳 Preparing', description: `Started #${billNo}` });
            }

        } catch (error) {
            console.error('Update failed:', error);
            // Rollback on failure
            setBills(prevBills);
            toast({
                title: 'Update Failed',
                description: 'Please check your connection',
                variant: 'destructive'
            });
        }
    };

    // Manual sync
    const handleManualSync = async () => {
        if (!isOnline || syncing) return;

        setSyncing(true);
        try {
            const result = await kitchenOfflineManager.syncPendingUpdates();
            if (result.synced > 0) {
                toast({
                    title: '✅ Synced',
                    description: `${result.synced} updates synced successfully`,
                });
            }
            await fetchBills(true);
            const pending = await kitchenOfflineManager.getPendingUpdates();
            setPendingUpdatesCount(pending.length);
        } finally {
            setSyncing(false);
        }
    };

    // Group bills by status
    const pendingBills = bills.filter(b => b.kitchen_status === 'pending');
    const preparingBills = bills.filter(b => b.kitchen_status === 'preparing');
    const readyBills = bills.filter(b => b.kitchen_status === 'ready');

    const handleRefreshClick = () => {
        fetchBills();
    };

    // Only show loading on initial load, not on refreshes
    if (loading && !initialLoadDone) {
        return (
            <div className="min-h-screen bg-background p-4">
                <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
                    <p className="text-sm text-muted-foreground">Loading kitchen orders...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Header Bar */}
            <div className="bg-card border-b sticky top-0 z-10 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <ChefHat className="w-8 h-8 text-primary" />
                        <div>
                            <h1 className="text-xl font-bold">Kitchen Display</h1>
                            <p className="text-xs text-muted-foreground">
                                {formatTimeAMPM(currentTime)} • {bills.length} active orders
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Online/Offline Status */}
                        <div className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-full border",
                            isOnline
                                ? "bg-green-500/10 border-green-500/20"
                                : "bg-orange-500/10 border-orange-500/20"
                        )}>
                            {isOnline ? (
                                <>
                                    <Wifi className="w-3.5 h-3.5 text-green-500" />
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-green-600">Live</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="w-3.5 h-3.5 text-orange-500" />
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-orange-600">Offline</span>
                                </>
                            )}
                        </div>

                        {/* Pending Sync Badge */}
                        {pendingUpdatesCount > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleManualSync}
                                disabled={!isOnline || syncing}
                                className="gap-1"
                            >
                                <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
                                <Badge variant="secondary" className="text-[10px] px-1.5">
                                    {pendingUpdatesCount}
                                </Badge>
                            </Button>
                        )}

                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => setVoiceEnabled(!voiceEnabled)}
                            className={cn(voiceEnabled && "bg-primary text-primary-foreground")}
                        >
                            {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                        </Button>
                        <Button variant="outline" size="sm" onClick={handleRefreshClick}>
                            Refresh
                        </Button>
                    </div>
                </div>
            </div>

            {/* Offline Banner */}
            {!isOnline && (
                <div className="bg-orange-500/10 border-b border-orange-500/20 px-4 py-2 text-center">
                    <span className="text-sm text-orange-700 dark:text-orange-400">
                        📴 You're offline. Changes will sync when connection restores.
                    </span>
                </div>
            )}

            {/* Main Content */}
            <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                    {/* PENDING Column */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 rounded-full bg-yellow-500" />
                            <h2 className="text-lg font-semibold">New Orders</h2>
                            <Badge variant="secondary">{pendingBills.length}</Badge>
                        </div>

                        {pendingBills.map((bill) => (
                            <KitchenOrderCard
                                key={bill.id}
                                bill={bill}
                                processing={processingBillId === bill.id}
                                onAction={() => updateKitchenStatus(bill.id, bill.bill_no, 'preparing')}
                                actionLabel="Start Preparing"
                                actionColor="bg-orange-500 hover:bg-orange-600"
                            />
                        ))}

                        {pendingBills.length === 0 && (
                            <Card className="p-6 text-center text-muted-foreground">
                                No new orders
                            </Card>
                        )}
                    </div>

                    {/* PREPARING Column */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
                            <h2 className="text-lg font-semibold">Preparing</h2>
                            <Badge variant="secondary">{preparingBills.length}</Badge>
                        </div>

                        {preparingBills.map((bill) => (
                            <KitchenOrderCard
                                key={bill.id}
                                bill={bill}
                                processing={processingBillId === bill.id}
                                onAction={() => updateKitchenStatus(bill.id, bill.bill_no, 'ready')}
                                actionLabel="Mark Ready"
                                actionColor="bg-green-500 hover:bg-green-600"
                            />
                        ))}

                        {preparingBills.length === 0 && (
                            <Card className="p-6 text-center text-muted-foreground">
                                Nothing cooking
                            </Card>
                        )}
                    </div>

                    {/* READY Column */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="w-3 h-3 rounded-full bg-green-500" />
                            <h2 className="text-lg font-semibold">Ready to Serve</h2>
                            <Badge variant="secondary">{readyBills.length}</Badge>
                        </div>

                        {readyBills.map((bill) => (
                            <Card
                                key={bill.id}
                                className="p-4 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-3xl font-bold text-green-600">
                                        #{bill.bill_no}
                                    </h3>
                                    <Badge className="bg-green-500 text-white animate-pulse">
                                        <Bell className="w-3 h-3 mr-1" />
                                        READY
                                    </Badge>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {getTimeElapsed(bill.created_at)} ago
                                </div>
                            </Card>
                        ))}

                        {readyBills.length === 0 && (
                            <Card className="p-6 text-center text-muted-foreground">
                                No orders ready
                            </Card>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
};

// Kitchen Order Card Component
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
            </div>

            {/* Items List */}
            <div className="space-y-1 mb-3">
                {bill.bill_items.map((item) => (
                    <div
                        key={item.id}
                        className="flex items-center justify-between text-sm"
                    >
                        <span className="font-medium">
                            {item.items?.name || 'Unknown'}
                        </span>
                        <Badge variant="outline" className="font-bold">
                            x{item.quantity}
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

export default KitchenDisplay;