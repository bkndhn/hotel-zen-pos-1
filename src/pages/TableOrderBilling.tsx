import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Receipt, ChevronRight, Clock, Check, X, Loader2, Users, ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getInstantBillNumber } from '@/utils/billNumberGenerator';
import { formatQuantityWithUnit } from '@/utils/timeUtils';

// BroadcastChannel for instant cross-tab sync
const billsChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bills-updates') : null;

interface TableOrder {
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
    is_billed: boolean;
}

interface TableWithOrders {
    table_number: string;
    orders: TableOrder[];
    total: number;
    orderCount: number;
}

const getTimeElapsed = (created: string) => {
    const diff = Date.now() - new Date(created).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
};

const statusConfig: Record<string, { label: string; color: string; icon: string }> = {
    pending: { label: 'Pending', color: 'bg-yellow-500', icon: '⏳' },
    preparing: { label: 'Preparing', color: 'bg-orange-500', icon: '👨‍🍳' },
    ready: { label: 'Ready', color: 'bg-green-500', icon: '✅' },
    served: { label: 'Served', color: 'bg-blue-500', icon: '🍽️' },
    cancelled: { label: 'Cancelled', color: 'bg-red-500', icon: '❌' },
};

const TableOrderBilling: React.FC = () => {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [tables, setTables] = useState<TableWithOrders[]>([]);
    const [selectedTable, setSelectedTable] = useState<TableWithOrders | null>(null);
    const [isBilling, setIsBilling] = useState(false);
    const [paymentMode, setPaymentMode] = useState<string>('cash');
    const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
    const syncChannelRef = useRef<any>(null);

    const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;

    // Fetch all unbilled table orders grouped by table
    const fetchTableOrders = useCallback(async () => {
        try {
            const { data, error } = await (supabase as any)
                .from('table_orders')
                .select('*')
                .eq('is_billed', false)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: true });

            if (error) throw error;

            // Group by table_number
            const grouped: Record<string, TableOrder[]> = {};
            (data || []).forEach((order: TableOrder) => {
                if (!grouped[order.table_number]) {
                    grouped[order.table_number] = [];
                }
                grouped[order.table_number].push(order);
            });

            const tablesWithOrders: TableWithOrders[] = Object.entries(grouped)
                .map(([tableNum, orders]) => ({
                    table_number: tableNum,
                    orders,
                    total: orders.reduce((sum, o) => sum + o.total_amount, 0),
                    orderCount: orders.length,
                }))
                .sort((a, b) => a.table_number.localeCompare(b.table_number, undefined, { numeric: true }));

            setTables(tablesWithOrders);
        } catch (err) {
            console.error('Error fetching table orders:', err);
            toast({ title: 'Error', description: 'Failed to fetch table orders', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, []);

    // Setup real-time sync
    useEffect(() => {
        fetchTableOrders();
        const interval = setInterval(fetchTableOrders, 15000);

        const channel = supabase.channel('table-billing-sync', {
            config: { broadcast: { self: true } }
        })
            .on('broadcast', { event: 'new-table-order' }, () => fetchTableOrders())
            .subscribe();

        const pgChannel = supabase.channel('table-billing-pg')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders' }, () => fetchTableOrders())
            .subscribe();

        // Setup sync channel for broadcasting bill creation
        const syncChannel = supabase.channel('pos-global-sync', {
            config: { broadcast: { self: true } }
        }).subscribe();
        syncChannelRef.current = syncChannel;

        return () => {
            clearInterval(interval);
            supabase.removeChannel(channel);
            supabase.removeChannel(pgChannel);
            supabase.removeChannel(syncChannel);
        };
    }, [fetchTableOrders]);

    // Generate consolidated bill for selected table
    const generateBill = async () => {
        if (!selectedTable || !adminId || isBilling) return;

        setIsBilling(true);
        setConfirmDialogOpen(false);

        try {
            const orders = selectedTable.orders;
            const tableNumber = selectedTable.table_number;

            // Merge all order items - combine duplicates by item_id
            const mergedItems: Record<string, {
                item_id: string;
                name: string;
                price: number;
                quantity: number;
                unit?: string;
                base_value?: number;
            }> = {};

            orders.forEach(order => {
                order.items.forEach(item => {
                    if (mergedItems[item.item_id]) {
                        mergedItems[item.item_id].quantity += item.quantity;
                    } else {
                        mergedItems[item.item_id] = {
                            item_id: item.item_id,
                            name: item.name,
                            price: item.price,
                            quantity: item.quantity,
                            unit: item.unit,
                            base_value: item.base_value,
                        };
                    }
                });
            });

            const consolidatedItems = Object.values(mergedItems);
            const totalAmount = consolidatedItems.reduce((sum, item) => {
                const baseValue = item.base_value || 1;
                return sum + (item.quantity / baseValue) * item.price;
            }, 0);

            const billNumber = getInstantBillNumber(adminId);
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            // Map payment mode
            const paymentModeMap: Record<string, string> = {
                cash: 'cash',
                upi: 'upi',
                card: 'card',
                other: 'other',
            };

            // 1. Create Bill
            const billPayload = {
                bill_no: billNumber,
                total_amount: totalAmount,
                discount: 0,
                payment_mode: paymentModeMap[paymentMode] || 'cash',
                payment_details: { [paymentMode]: totalAmount },
                additional_charges: [],
                created_by: profile?.user_id,
                admin_id: adminId,
                date: todayStr,
                service_status: 'completed',
                kitchen_status: 'completed',
                status_updated_at: now.toISOString(),
                table_no: `T${tableNumber}`,
            };

            const { data: billData, error: billError } = await supabase
                .from('bills')
                .insert(billPayload)
                .select()
                .single();

            if (billError) throw billError;
            if (!billData) throw new Error('Failed to create bill');

            // 2. Create Bill Items
            const billItems = consolidatedItems.map(item => ({
                bill_id: billData.id,
                item_id: item.item_id,
                quantity: item.quantity,
                price: item.price,
                total: (item.quantity / (item.base_value || 1)) * item.price,
            }));

            const { error: itemsError } = await supabase
                .from('bill_items')
                .insert(billItems);

            if (itemsError) {
                // Rollback bill
                await supabase.from('bills').delete().eq('id', billData.id);
                throw itemsError;
            }

            // 3. Mark all table orders as billed
            const orderIds = orders.map(o => o.id);
            const { error: updateError } = await supabase
                .from('table_orders')
                .update({ is_billed: true, status: 'served' })
                .in('id', orderIds);

            if (updateError) {
                console.warn('Failed to mark orders as billed:', updateError);
            }

            // 4. Free the table
            const { error: tableError } = await supabase
                .from('tables')
                .update({ status: 'available', current_bill_id: null })
                .eq('admin_id', adminId)
                .eq('table_number', tableNumber);

            if (tableError) {
                console.warn('Failed to free table:', tableError);
            }

            // 5. Broadcast bill creation (4-layer sync)
            window.dispatchEvent(new CustomEvent('bills-updated'));

            billsChannel?.postMessage({
                type: 'new-bill',
                bill_no: billNumber,
                bill_id: billData.id,
                timestamp: Date.now()
            });

            syncChannelRef.current?.send({
                type: 'broadcast',
                event: 'new-bill',
                payload: {
                    bill_id: billData.id,
                    bill_no: billNumber,
                    action: 'create',
                    timestamp: Date.now()
                }
            });

            // 6. Broadcast status update to customer sessions
            const sessionIds = [...new Set(orders.map(o => o.session_id))];
            for (const sid of sessionIds) {
                const channel = supabase.channel(`table-order-status-${sid}`);
                for (const order of orders.filter(o => o.session_id === sid)) {
                    await channel.send({
                        type: 'broadcast',
                        event: 'order-status-update',
                        payload: { order_id: order.id, status: 'served' }
                    });
                }
                supabase.removeChannel(channel);
            }

            toast({
                title: '✅ Bill Generated!',
                description: `Bill ${billNumber} created for Table ${tableNumber} (₹${totalAmount.toFixed(0)})`,
            });

            setSelectedTable(null);
            await fetchTableOrders();

        } catch (err) {
            console.error('Bill generation error:', err);
            toast({
                title: 'Error',
                description: 'Failed to generate bill. Please try again.',
                variant: 'destructive'
            });
        } finally {
            setIsBilling(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-3 sm:p-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-md shadow-purple-500/20">
                            <Receipt className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Table Billing</h1>
                            <p className="text-xs text-muted-foreground">
                                {tables.length} table{tables.length !== 1 ? 's' : ''} with active orders
                            </p>
                        </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => fetchTableOrders()}>
                        Refresh
                    </Button>
                </div>

                {/* No tables */}
                {tables.length === 0 ? (
                    <Card className="p-12 text-center border-dashed bg-muted/20">
                        <div className="text-muted-foreground">
                            <Receipt className="w-16 h-16 mx-auto mb-4 opacity-20" />
                            <p className="text-xl font-bold text-foreground">No pending table orders</p>
                            <p className="text-sm">Table orders will appear here when customers place orders via QR code</p>
                        </div>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {tables.map((table) => (
                            <Card
                                key={table.table_number}
                                className={cn(
                                    "cursor-pointer transition-all hover:shadow-md border-l-4 border-l-purple-500",
                                    selectedTable?.table_number === table.table_number && "ring-2 ring-purple-500"
                                )}
                                onClick={() => setSelectedTable(table)}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <h3 className="text-2xl font-black">T{table.table_number}</h3>
                                            <Badge className="bg-purple-100 text-purple-700 text-[10px]">
                                                <ShoppingCart className="w-2.5 h-2.5 mr-0.5" />
                                                {table.orderCount} order{table.orderCount > 1 ? 's' : ''}
                                            </Badge>
                                        </div>
                                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                    </div>

                                    {/* Order summary */}
                                    <div className="space-y-1.5 mb-3">
                                        {table.orders.map((order) => (
                                            <div key={order.id} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <span>{statusConfig[order.status]?.icon}</span>
                                                    <span className="text-muted-foreground">
                                                        Order #{order.order_number}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium">₹{order.total_amount}</span>
                                                    <span className="text-muted-foreground">
                                                        {getTimeElapsed(order.created_at)}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Total */}
                                    <div className="flex items-center justify-between border-t pt-2">
                                        <span className="text-sm font-semibold">Total</span>
                                        <span className="text-lg font-black text-primary">₹{table.total.toFixed(0)}</span>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Selected Table Detail Dialog */}
                <Dialog open={!!selectedTable} onOpenChange={(open) => !open && setSelectedTable(null)}>
                    <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-xl">
                                <Receipt className="w-5 h-5 text-purple-600" />
                                Table {selectedTable?.table_number} — Generate Bill
                            </DialogTitle>
                        </DialogHeader>

                        {selectedTable && (
                            <div className="space-y-4">
                                {/* Orders list */}
                                {selectedTable.orders.map((order) => (
                                    <Card key={order.id} className="p-3 bg-muted/20">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm">{statusConfig[order.status]?.icon}</span>
                                                <span className="text-sm font-semibold">Order #{order.order_number}</span>
                                                <Badge variant="secondary" className="text-[10px]">
                                                    {statusConfig[order.status]?.label}
                                                </Badge>
                                            </div>
                                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {getTimeElapsed(order.created_at)}
                                            </span>
                                        </div>

                                        <div className="space-y-1">
                                            {order.items.map((item, idx) => (
                                                <div key={idx} className="flex items-center justify-between text-sm">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="secondary" className="text-xs font-bold min-w-[40px] justify-center">
                                                            {formatQuantityWithUnit(item.quantity, item.unit)}
                                                        </Badge>
                                                        <span>{item.name}</span>
                                                    </div>
                                                    <span className="font-medium">
                                                        ₹{((item.quantity / (item.base_value || 1)) * item.price).toFixed(0)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        {order.customer_note && (
                                            <p className="text-xs text-amber-600 mt-2">💬 {order.customer_note}</p>
                                        )}

                                        <div className="flex items-center justify-end mt-2 border-t pt-1">
                                            <span className="text-sm font-bold">₹{order.total_amount.toFixed(0)}</span>
                                        </div>
                                    </Card>
                                ))}

                                {/* Grand Total */}
                                <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border-2 border-primary/20">
                                    <span className="text-lg font-bold">Grand Total</span>
                                    <span className="text-2xl font-black text-primary">₹{selectedTable.total.toFixed(0)}</span>
                                </div>

                                {/* Payment Mode */}
                                <div>
                                    <label className="text-sm font-medium mb-1.5 block">Payment Method</label>
                                    <Select value={paymentMode} onValueChange={setPaymentMode}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="cash">💵 Cash</SelectItem>
                                            <SelectItem value="upi">📱 UPI</SelectItem>
                                            <SelectItem value="card">💳 Card</SelectItem>
                                            <SelectItem value="other">🔄 Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        )}

                        <DialogFooter className="gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setSelectedTable(null)}
                                disabled={isBilling}
                            >
                                Cancel
                            </Button>
                            <Button
                                className="bg-purple-600 hover:bg-purple-700 text-white"
                                onClick={() => setConfirmDialogOpen(true)}
                                disabled={isBilling}
                            >
                                {isBilling ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Receipt className="w-4 h-4 mr-1.5" />
                                        Generate Bill
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Confirmation Dialog */}
                <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
                    <DialogContent className="max-w-sm">
                        <DialogHeader>
                            <DialogTitle>Confirm Bill Generation</DialogTitle>
                        </DialogHeader>
                        <div className="py-4 space-y-2">
                            <p className="text-sm text-muted-foreground">
                                This will generate a combined bill for <strong>Table {selectedTable?.table_number}</strong> with:
                            </p>
                            <ul className="text-sm space-y-1 ml-4">
                                <li>• {selectedTable?.orderCount} order{(selectedTable?.orderCount || 0) > 1 ? 's' : ''} consolidated</li>
                                <li>• Payment: <strong>{paymentMode.toUpperCase()}</strong></li>
                                <li>• Total: <strong className="text-primary">₹{selectedTable?.total.toFixed(0)}</strong></li>
                            </ul>
                            <p className="text-xs text-muted-foreground mt-2">
                                The table will be freed after billing.
                            </p>
                        </div>
                        <DialogFooter className="gap-2">
                            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button
                                className="bg-purple-600 hover:bg-purple-700 text-white"
                                onClick={generateBill}
                                disabled={isBilling}
                            >
                                {isBilling ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                    <>
                                        <Check className="w-4 h-4 mr-1" />
                                        Confirm & Generate
                                    </>
                                )}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    );
};

export default TableOrderBilling;
