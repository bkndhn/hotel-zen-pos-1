import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Undo2, ChefHat, Clock, Wifi, WifiOff } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { formatDateTimeAMPM, getTimeElapsed, isWithinUndoWindow, formatQuantityWithUnit } from '@/utils/timeUtils';
import { cn } from '@/lib/utils';

// === INSTANT SYNC LAYER ===
// 1. BroadcastChannel - 0ms same-browser tabs
// 2. Supabase Broadcast - <100ms cross-device via WebSocket
// 3. postgres_changes - ~2-5s fallback

const localBroadcast = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('pos-instant-sync')
    : null;

// Types
interface BillItem {
    id: string;
    quantity: number;
    price: number;
    total: number;
    items: {
        id: string;
        name: string;
        price: number;
        unit?: string;
        base_value?: number;
    } | null;
}

interface ServiceBill {
    id: string;
    bill_no: string;
    total_amount: number;
    date: string;
    created_at: string;
    service_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    kitchen_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
    status_updated_at: string;
    bill_items: BillItem[];
}

// Type for table QR orders
interface ServiceTableOrder {
    id: string;
    admin_id: string;
    table_number: string;
    session_id: string;
    order_number: number;
    items: Array<{
        item_id: string;
        name: string;
        price: number;
        quantity: number;
        unit?: string;
        base_value?: number;
        instructions?: string;
    }>;
    total_amount: number;
    status: 'pending' | 'preparing' | 'ready' | 'served' | 'cancelled';
    customer_note?: string;
    created_at: string;
}

const ServiceArea = () => {
    const { profile } = useAuth();
    const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
    const [bills, setBills] = useState<ServiceBill[]>([]);
    const [recentBills, setRecentBills] = useState<ServiceBill[]>([]);
    const [loading, setLoading] = useState(true);
    const [initialLoadDone, setInitialLoadDone] = useState(false);
    const [processingBillId, setProcessingBillId] = useState<string | null>(null);
    const [isConnected, setIsConnected] = useState(true); // Start optimistic
    const broadcastChannelRef = useRef<any>(null);
    const lastFetchRef = useRef<number>(0);
    const fetchDebounceRef = useRef<NodeJS.Timeout | null>(null);
    const fetchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Table orders state
    const [tableOrders, setTableOrders] = useState<ServiceTableOrder[]>([]);

    // Debounced fetch to prevent multiple rapid calls
    const debouncedFetch = useCallback((silent = true) => {
        if (fetchDebounceRef.current) {
            clearTimeout(fetchDebounceRef.current);
        }
        fetchDebounceRef.current = setTimeout(() => {
            fetchBills(silent);
        }, 50); // 50ms debounce
    }, []);

    // Fetch bills that need service AND recently processed ones
    const fetchBills = useCallback(async (silent = false) => {
        // Prevent fetching more than once per 500ms
        const now = Date.now();
        if (silent && now - lastFetchRef.current < 500) {
            return;
        }
        lastFetchRef.current = now;

        if (!silent) setLoading(true);

        try {
            const nowDate = new Date();
            const today = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')}`;
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => {
                fetchTimeoutRef.current = setTimeout(() => reject(new Error('Timeout')), 8000);
            });

            // 1. Fetch Active Bills
            const activeQuery = (supabase as any)
                .from('bills')
                .select(`
                    id, bill_no, total_amount, date, created_at,
                    service_status, kitchen_status, status_updated_at, table_no,
                    bill_items (
                        id, quantity, price, total,
                        items (id, name, price, unit, base_value)
                    )
                `)
                .eq('admin_id', adminId)
                .eq('date', today)
                .or('is_deleted.is.null,is_deleted.eq.false')
                .in('service_status', ['pending', 'ready', 'preparing'])
                .order('created_at', { ascending: false });

            // 2. Fetch Recently Processed (for Undo)
            const recentQuery = (supabase as any)
                .from('bills')
                .select('id, bill_no, service_status, status_updated_at')
                .eq('admin_id', adminId)
                .eq('date', today)
                .in('service_status', ['completed', 'rejected'])
                .gte('status_updated_at', fiveMinutesAgo)
                .order('status_updated_at', { ascending: false })
                .limit(10);

            const [activeResult, recentResult] = await Promise.race([
                Promise.all([activeQuery, recentQuery]),
                timeoutPromise
            ]) as any;

            if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);

            if (activeResult.error) throw activeResult.error;
            if (recentResult.error) throw recentResult.error;

            setBills(activeResult.data || []);
            setRecentBills(recentResult.data || []);
            setIsConnected(true);
        } catch (error) {
            console.warn('Error fetching service bills:', error);
            setIsConnected(false);
            // Don't show toast on every silent refresh failure
            if (!silent) {
                toast({
                    title: 'Connection Issue',
                    description: 'Retrying in background...',
                    variant: 'default',
                });
            }
        } finally {
            if (!silent) setLoading(false);
            setInitialLoadDone(true);
        }
    }, []);

    // Fetch table orders ready to serve
    const fetchTableOrders = useCallback(async () => {
        if (!adminId) return;
        try {
            const { data, error } = await (supabase as any)
                .from('table_orders')
                .select('*')
                .eq('admin_id', adminId)
                .in('status', ['ready', 'preparing'])
                .eq('is_billed', false)
                .order('created_at', { ascending: false });

            if (!error && data) {
                setTableOrders(data as ServiceTableOrder[]);
            }
        } catch (e) {
            console.warn('[ServiceArea] Table orders fetch error:', e);
        }
    }, []);

    // === LAYER 1: Supabase Broadcast (Cross-device, <100ms) ===
    useEffect(() => {
        const channel = supabase.channel('pos-global-broadcast', {
            config: { broadcast: { self: true } }
        })
            .on('broadcast', { event: 'bills-sync' }, (payload) => {
                console.log('[ServiceArea] Instant broadcast received:', payload);
                debouncedFetch(true);
            })
            .subscribe((status) => {
                console.log('[ServiceArea] Broadcast channel status:', status);
                // Don't set connection status based on channel - use fetch success instead
            });

        broadcastChannelRef.current = channel;
        return () => { supabase.removeChannel(channel); };
    }, [debouncedFetch]);

    // Monitor native online/offline status
    useEffect(() => {
        const handleOnline = () => {
            console.log('[ServiceArea] Browser online');
            debouncedFetch(true);
        };
        const handleOffline = () => {
            console.log('[ServiceArea] Browser offline');
            setIsConnected(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [debouncedFetch]);

    // === LAYER 2: Local BroadcastChannel (Same browser, 0ms) ===
    useEffect(() => {
        // Listen to both local broadcast channels
        const billingChannel = typeof BroadcastChannel !== 'undefined'
            ? new BroadcastChannel('bills-updates') : null;

        const handleLocal = (event: MessageEvent) => {
            console.log('[ServiceArea] Local broadcast received:', event.data);
            debouncedFetch(true);
        };

        localBroadcast?.addEventListener('message', handleLocal);
        billingChannel?.addEventListener('message', handleLocal);

        return () => {
            localBroadcast?.removeEventListener('message', handleLocal);
            billingChannel?.removeEventListener('message', handleLocal);
            billingChannel?.close();
        };
    }, [debouncedFetch]);

    // === LAYER 3: Window custom events (Same tab) ===
    useEffect(() => {
        const handleBillsUpdated = () => {
            console.log('[ServiceArea] Window event: bills-updated');
            debouncedFetch(true);
        };
        window.addEventListener('bills-updated', handleBillsUpdated);
        return () => window.removeEventListener('bills-updated', handleBillsUpdated);
    }, [debouncedFetch]);

    // === LAYER 4: postgres_changes (Fallback, ~2-5s) ===
    useEffect(() => {
        const channel = supabase
            .channel('service-area-postgres')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bills' }, (payload) => {
                console.log('[ServiceArea] postgres_changes:', payload);
                debouncedFetch(true);
            })
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [debouncedFetch]);

    // Initial fetch + polling fallback
    useEffect(() => {
        fetchBills();
        fetchTableOrders();
        const pollInterval = setInterval(() => {
            fetchBills(true);
            fetchTableOrders();
        }, 30000); // 30s fallback
        return () => {
            clearInterval(pollInterval);
            if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current);
            if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current);
        };
    }, [fetchBills, fetchTableOrders]);

    // Listen for table order broadcasts
    useEffect(() => {
        const channel = supabase.channel('table-order-sync', {
            config: { broadcast: { self: true } }
        })
            .on('broadcast', { event: 'new-table-order' }, () => {
                fetchTableOrders();
            })
            .on('broadcast', { event: 'table-order-status-update' }, () => {
                fetchTableOrders();
            })
            .subscribe();

        const pgChannel = supabase.channel('table-order-service-pg')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders' }, () => {
                fetchTableOrders();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(pgChannel);
        };
    }, [fetchTableOrders]);

    /**
     * OPTIMISTIC UPDATE: Instant (0ms) response with multi-layer broadcast
     */
    const updateBillStatus = async (
        billId: string,
        status: 'completed' | 'rejected' | 'pending'
    ) => {
        // Capture previous state for rollback
        const prevActive = [...bills];
        const prevRecent = [...recentBills];

        // 1. Instant local update (Optimistic UI)
        if (status === 'pending') {
            const billToRestore = recentBills.find(b => b.id === billId);
            if (billToRestore) {
                setRecentBills(prev => prev.filter(b => b.id !== billId));
            }
        } else {
            const billToMove = bills.find(b => b.id === billId);
            if (billToMove) {
                setBills(prev => prev.filter(b => b.id !== billId));
                setRecentBills(prev => [{
                    ...billToMove,
                    service_status: status,
                    status_updated_at: new Date().toISOString()
                }, ...prev].slice(0, 10));
            }
        }

        // 2. Perform background update
        try {
            const { error } = await supabase
                .from('bills')
                .update({
                    service_status: status,
                    status_updated_at: new Date().toISOString(),
                } as any)
                .eq('id', billId);

            if (error) throw error;

            toast({
                title: status === 'completed' ? '✅ Bill Done' :
                    status === 'rejected' ? '❌ Bill Rejected' : '↩️ Bill Restored',
                duration: 2000,
            });

            // === INSTANT 4-LAYER SYNC for Undo ===
            // Layer 1: Local BroadcastChannel (0ms same browser)
            localBroadcast?.postMessage({ type: 'bills', action: 'status-update', billId });

            // Also broadcast to billing channel
            const billingChannel = typeof BroadcastChannel !== 'undefined'
                ? new BroadcastChannel('bills-updates') : null;
            billingChannel?.postMessage({ type: 'bills', action: 'undo', billId });
            billingChannel?.close();

            // Layer 2: Supabase Broadcast (<100ms cross-device)
            broadcastChannelRef.current?.send({
                type: 'broadcast',
                event: 'bills-sync',
                payload: { bill_id: billId, status, action: 'undo', timestamp: Date.now() }
            });

            // Auto-free table when bill is completed and had a table assigned
            if (status === 'completed') {
                const completedBill = prevActive.find(b => b.id === billId);
                const tableNo = (completedBill as any)?.table_no;
                if (tableNo) {
                    const tableNum = tableNo.replace(/^T/i, '');
                    (supabase as any)
                        .from('tables')
                        .update({ status: 'available', current_bill_id: null })
                        .eq('table_number', tableNum)
                        .then(async () => {
                            broadcastChannelRef.current?.send({
                                type: 'broadcast',
                                event: 'table-status-updated',
                                payload: { table_number: tableNum, status: 'available', timestamp: Date.now() }
                            });
                            // Also broadcast on shared table-order-sync channel
                            const sharedChannel = supabase.channel('table-order-sync');
                            await sharedChannel.send({
                                type: 'broadcast',
                                event: 'table-status-updated',
                                payload: { table_number: tableNum, status: 'available', timestamp: Date.now() }
                            });
                            supabase.removeChannel(sharedChannel);
                            console.log(`[ServiceArea] Table ${tableNum} freed after bill completion`);
                        })
                        .catch((err: any) => console.warn('[ServiceArea] Failed to free table:', err));
                }
            }

            // Background refresh
            fetchBills(true);
        } catch (error) {
            console.error('Update failed, rolling back:', error);
            setBills(prevActive);
            setRecentBills(prevRecent);
            toast({
                title: 'Connection Error',
                description: 'Could not update status. Please try again.',
                variant: 'destructive',
            });
        }
    };

    // Get status badge color
    const getStatusBadge = (bill: ServiceBill) => {
        if (bill.kitchen_status === 'ready') {
            return (
                <Badge className="bg-green-500 text-white animate-pulse">
                    <ChefHat className="w-3 h-3 mr-1" />
                    READY
                </Badge>
            );
        }
        if (bill.kitchen_status === 'preparing') {
            return (
                <Badge className="bg-orange-500 text-white">
                    <Clock className="w-3 h-3 mr-1" />
                    PREPARING
                </Badge>
            );
        }
        return <Badge variant="secondary">PENDING</Badge>;
    };

    // Update table order status (mark as served)
    const updateTableOrderStatus = async (orderId: string, sessionId: string, status: 'served') => {
        setTableOrders(prev => prev.map(o =>
            o.id === orderId ? { ...o, status } : o
        ));

        try {
            const { error } = await supabase
                .from('table_orders')
                .update({ status })
                .eq('id', orderId);

            if (error) throw error;

            // Broadcast status update to customer
            const channel = supabase.channel(`table-order-status-${sessionId}`);
            await channel.send({
                type: 'broadcast',
                event: 'order-status-update',
                payload: { order_id: orderId, status }
            });
            supabase.removeChannel(channel);

            toast({ title: '✅ Served', description: 'Table order marked as served' });
        } catch (error) {
            console.error('Table order update failed:', error);
            fetchTableOrders();
            toast({ title: 'Update Failed', variant: 'destructive' });
        }
    };

    // Only show loading on initial load
    if (loading && !initialLoadDone) {
        return (
            <div className="p-4 space-y-4">
                <h1 className="text-2xl font-bold">Service Area</h1>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[...Array(8)].map((_, i) => (
                        <Card key={i} className="p-4 animate-pulse h-48 bg-muted/50" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="p-3 sm:p-4 space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                        <h1 className="text-xl sm:text-2xl font-bold text-foreground">Service Area</h1>
                        <div className={cn(
                            "flex items-center gap-1.5 px-2 py-0.5 rounded-full border",
                            isConnected
                                ? "bg-green-500/10 border-green-500/20"
                                : "bg-red-500/10 border-red-500/20"
                        )}>
                            {isConnected ? (
                                <>
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-green-600">Live</span>
                                </>
                            ) : (
                                <>
                                    <WifiOff className="w-3 h-3 text-red-500" />
                                    <span className="text-[10px] uppercase tracking-wider font-bold text-red-600">Offline</span>
                                </>
                            )}
                        </div>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                        {bills.filter(b => b.kitchen_status === 'ready').length + tableOrders.filter(o => o.status === 'ready').length} ready to serve
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => fetchBills()}>
                    Refresh
                </Button>
            </div>

            {/* Active Bills Grid */}
            {bills.length === 0 ? (
                <Card className="p-12 text-center border-dashed bg-muted/20">
                    <div className="text-muted-foreground">
                        <Check className="w-16 h-16 mx-auto mb-4 opacity-20 text-green-500" />
                        <p className="text-xl font-bold text-foreground">All caught up!</p>
                        <p className="text-sm">No pending bills to serve</p>
                    </div>
                </Card>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {bills.map((bill) => (
                        <Card
                            key={bill.id}
                            className={cn(
                                "p-3 flex flex-col transition-all duration-300 shadow-sm hover:shadow-md",
                                bill.kitchen_status === 'ready' && "ring-2 ring-green-500 bg-green-50/50 dark:bg-green-950/20"
                            )}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xl font-black text-foreground">#{bill.bill_no}</h3>
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
                                        {getTimeElapsed(bill.created_at)}
                                    </span>
                                    {(bill as any).table_no && (
                                        <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                            {(bill as any).table_no}
                                        </span>
                                    )}
                                </div>
                                {getStatusBadge(bill)}
                            </div>

                            {/* Items - no scroll, show all */}
                            <div className="flex-1 mb-3 space-y-1">
                                {bill.bill_items.map((item) => (
                                    <div key={item.id} className="flex items-center text-sm">
                                        <span className="font-bold text-primary mr-2">
                                            {formatQuantityWithUnit(item.quantity, item.items?.unit)}
                                        </span>
                                        <span className="text-muted-foreground text-xs mr-1">×</span>
                                        <span className="font-medium truncate">{item.items?.name}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Items/Qty Count Footer */}
                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground border-t pt-2 mb-3">
                                <span>Items: {bill.bill_items.length}</span>
                                <span>Qty: {bill.bill_items.reduce((acc, item) => {
                                    const unit = item.items?.unit?.toLowerCase() || '';
                                    const isWeightVolume = unit.includes('gram') || unit.includes('kg') ||
                                        unit.includes('liter') || unit.includes('ml') ||
                                        unit === 'g' || unit === 'l';
                                    return acc + (isWeightVolume ? 1 : item.quantity);
                                }, 0)}</span>
                            </div>

                            <div className="flex gap-2 mt-auto">
                                <Button
                                    size="sm"
                                    className="flex-1 h-10 bg-green-600 hover:bg-green-700 text-white font-bold"
                                    onClick={() => updateBillStatus(bill.id, 'completed')}
                                >
                                    <Check className="w-4 h-4 mr-1.5" />
                                    Done
                                </Button>
                                <Button
                                    size="sm"
                                    variant="destructive"
                                    className="flex-1 h-10 font-bold"
                                    onClick={() => updateBillStatus(bill.id, 'rejected')}
                                >
                                    <X className="w-4 h-4 mr-1.5" />
                                    Reject
                                </Button>
                            </div>

                        </Card>
                    ))}

                    {/* Table QR Orders - Ready to Serve */}
                    {tableOrders.filter(o => o.status === 'ready').map((order) => (
                        <Card
                            key={`to-${order.id}`}
                            className="p-3 flex flex-col transition-all duration-300 shadow-sm hover:shadow-md ring-2 ring-purple-500 bg-purple-50/50 dark:bg-purple-950/20 border-l-4 border-l-purple-500"
                        >
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-xl font-black text-foreground">T{order.table_number}</h3>
                                    <Badge className="bg-purple-100 text-purple-700 text-[10px]">QR #{order.order_number}</Badge>
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-medium">
                                        {getTimeElapsed(order.created_at)}
                                    </span>
                                </div>
                                <Badge className="bg-green-500 text-white animate-pulse text-[10px]">
                                    READY
                                </Badge>
                            </div>

                            <div className="flex-1 mb-3 space-y-1">
                                {order.items.map((item, idx) => (
                                    <div key={idx}>
                                        <div className="flex items-center text-sm">
                                            <span className="font-bold text-primary mr-2">
                                                {formatQuantityWithUnit(item.quantity, item.unit)}
                                            </span>
                                            <span className="text-muted-foreground text-xs mr-1">×</span>
                                            <span className="font-medium truncate">{item.name}</span>
                                        </div>
                                        {item.instructions && (
                                            <p className="text-xs text-amber-600 ml-6">📝 {item.instructions}</p>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {order.customer_note && (
                                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 mb-3 text-xs text-amber-700">
                                    💬 {order.customer_note}
                                </div>
                            )}

                            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground border-t pt-2 mb-3">
                                <span>Items: {order.items.length}</span>
                                <span>₹{order.total_amount}</span>
                            </div>

                            <Button
                                size="sm"
                                className="w-full h-10 bg-green-600 hover:bg-green-700 text-white font-bold"
                                onClick={() => updateTableOrderStatus(order.id, order.session_id, 'served')}
                            >
                                <Check className="w-4 h-4 mr-1.5" />
                                Mark Served
                            </Button>
                        </Card>
                    ))}
                </div>
            )}

            {/* Recently Processed - Now directly using component state */}
            {recentBills.length > 0 && (
                <div className="mt-8 pt-6 border-t border-dashed">
                    <h3 className="text-sm font-bold text-muted-foreground mb-4 flex items-center gap-2 uppercase tracking-widest">
                        <Undo2 className="w-4 h-4" />
                        Recently Processed (Undo)
                    </h3>
                    <div className="flex flex-wrap gap-2">
                        {recentBills.map((bill) => (
                            <Button
                                key={bill.id}
                                variant="outline"
                                size="sm"
                                onClick={() => updateBillStatus(bill.id, 'pending')}
                                disabled={!isWithinUndoWindow(bill.status_updated_at)}
                                className="gap-2 h-10 border-2 hover:bg-muted/50"
                            >
                                <Undo2 className="w-3 h-3 text-muted-foreground" />
                                <span className="font-bold">#{bill.bill_no}</span>
                                <Badge variant={bill.service_status === 'completed' ? 'default' : 'destructive'} className="h-5 px-1.5 min-w-[20px] justify-center">
                                    {bill.service_status === 'completed' ? '✓' : '✗'}
                                </Badge>
                            </Button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ServiceArea;
