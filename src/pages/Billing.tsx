import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { ShoppingCart, Plus, Minus, Search, Trash2, Package, AlertTriangle } from 'lucide-react';
import { TableSelector } from '@/components/TableSelector';
import { CompletePaymentDialog } from '@/components/CompletePaymentDialog';
import { PrinterErrorDialog } from '@/components/PrinterErrorDialog';
import { PendingBillsQueue } from '@/components/PendingBillsQueue';
import { getCachedImageUrl, cacheImageUrl } from '@/utils/imageUtils';
import { getInstantBillNumber, initBillCounter } from '@/utils/billNumberGenerator';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { usePrinter } from '@/hooks/usePrinter';
import { printReceipt, PrintData } from '@/utils/bluetoothPrinter';
import { printBrowserReceipt } from '@/utils/browserPrinter';
import { getShortUnit, formatQuantityWithUnit, isWeightOrVolumeUnit, calculateSmartQtyCount } from '@/utils/timeUtils';
import { offlineManager } from '@/utils/offlineManager';

// BroadcastChannel for instant cross-tab sync
const billsChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bills-updates') : null;

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image_url?: string;
  category?: string;
  unit?: string;
  base_value?: number;
  quantity_step?: number;
  stock_quantity?: number | null;
  unlimited_stock?: boolean;
}

interface PaymentType {
  id: string;
  payment_type: string;
  is_disabled: boolean;
  is_default: boolean;
}

interface AdditionalCharge {
  id: string;
  name: string;
  charge_type: 'fixed' | 'per_unit' | 'percentage';
  amount: number;
  unit?: string;
  description?: string;
  is_active: boolean;
  is_default: boolean;
}

const Billing: React.FC = () => {
  const { user, profile } = useAuth();
  const { branchId } = useBranchFilter();
  const location = useLocation();
  const navigate = useNavigate();
  const { isConnected, print, connectionState } = usePrinter();

  // Items & categories
  const [items, setItems] = useState<any[]>([]);
  const [filteredItems, setFilteredItems] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Cart
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  // Table
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState<string | null>(null);

  // Payment dialog
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [additionalCharges, setAdditionalCharges] = useState<any[]>([]);

  // Printer error dialog
  const [printerErrorOpen, setPrinterErrorOpen] = useState(false);
  const [printerErrorMessage, setPrinterErrorMessage] = useState('');
  const [pendingPrintData, setPendingPrintData] = useState<PrintData | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Settings
  const [billSettings, setBillSettings] = useState<any>(null);
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappShareMode, setWhatsappShareMode] = useState<'text' | 'image'>('text');
  const [gstEnabled, setGstEnabled] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<{ items_per_row: number }>({ items_per_row: 3 });

  const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;
  const cartRef = useRef(cartItems);
  cartRef.current = cartItems;

  // Real-time updates
  useRealTimeUpdates();

  // Initialize bill counter on mount
  useEffect(() => {
    if (adminId) initBillCounter(adminId);
  }, [adminId]);

  // Fetch items
  const fetchItems = useCallback(async () => {
    if (!adminId) return;
    setIsLoading(true);
    try {
      let query = supabase
        .from('items')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (data) {
        setItems(data);
        // Extract unique categories
        const cats = [...new Set(data.map(item => item.category).filter(Boolean))] as string[];
        setCategories(cats);
        // Cache images
        data.forEach(item => {
          if (item.image_url) {
            cacheImageUrl(item.id, item.image_url);
          }
        });
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Failed to load items', description: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  }, [adminId, branchId]);

  // Fetch payment types
  const fetchPaymentTypes = useCallback(async () => {
    if (!adminId) return;
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_disabled', false)
        .order('payment_type');
      if (error) throw error;
      setPaymentTypes(data || []);
    } catch (error) {
      console.error('Error fetching payment types:', error);
    }
  }, [adminId]);

  // Fetch additional charges
  const fetchAdditionalCharges = useCallback(async () => {
    if (!adminId) return;
    try {
      const { data, error } = await supabase
        .from('additional_charges')
        .select('*')
        .eq('admin_id', adminId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      setAdditionalCharges(data || []);
    } catch (error) {
      console.error('Error fetching additional charges:', error);
    }
  }, [adminId]);

  // Fetch shop settings
  const fetchShopSettings = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('user_id', authUser.id)
        .single();

      if (data) {
        setBillSettings({
          shopName: data.shop_name || '',
          address: data.address || '',
          contactNumber: data.contact_number || '',
          logoUrl: data.logo_url || '',
          whatsapp: data.whatsapp || '',
          showWhatsapp: data.show_whatsapp,
          printerWidth: data.printer_width as '58mm' | '80mm' || '58mm',
        });
        setWhatsappEnabled(data.whatsapp_bill_share_enabled || false);
        setWhatsappShareMode((data as any).whatsapp_share_mode === 'image' ? 'image' : 'text');
        setGstEnabled(data.gst_enabled || false);
      }
    } catch (error) {
      console.error('Error fetching shop settings:', error);
    }
  }, []);

  // Fetch display settings
  const fetchDisplaySettings = useCallback(async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data } = await supabase
        .from('display_settings')
        .select('*')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (data) {
        setDisplaySettings({ items_per_row: data.items_per_row || 3 });
      }
    } catch (error) {
      console.error('Error fetching display settings:', error);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchPaymentTypes();
    fetchAdditionalCharges();
    fetchShopSettings();
    fetchDisplaySettings();
  }, [fetchItems, fetchPaymentTypes, fetchAdditionalCharges, fetchShopSettings, fetchDisplaySettings]);

  // Handle table from URL params (e.g., navigated from TableManagement)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tableId = params.get('tableId');
    const tableNumber = params.get('tableNumber');
    if (tableId && tableNumber) {
      setSelectedTableId(tableId);
      setSelectedTableNumber(tableNumber);
    }
  }, [location.search]);

  // Filter items based on search and category
  useEffect(() => {
    let result = items;
    if (selectedCategory !== 'all') {
      result = result.filter(item => item.category === selectedCategory);
    }
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(item =>
        item.name.toLowerCase().includes(lowerSearch) ||
        item.category?.toLowerCase().includes(lowerSearch)
      );
    }
    setFilteredItems(result);
  }, [searchTerm, items, selectedCategory]);

  // Cart operations
  const addToCart = (item: any) => {
    setCartItems(prev => {
      const existing = prev.find(ci => ci.id === item.id);
      const step = item.quantity_step || 1;
      if (existing) {
        return prev.map(ci =>
          ci.id === item.id ? { ...ci, quantity: ci.quantity + step } : ci
        );
      }
      return [...prev, { ...item, quantity: step }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCartItems(prev => prev.filter(ci => ci.id !== itemId));
  };

  const updateQuantity = (itemId: string, change: number) => {
    setCartItems(prev => {
      return prev.map(ci => {
        if (ci.id !== itemId) return ci;
        const step = ci.quantity_step || 1;
        const newQty = ci.quantity + (change > 0 ? step : -step);
        if (newQty <= 0) return ci; // will be removed via removeFromCart
        return { ...ci, quantity: newQty };
      }).filter(ci => ci.quantity > 0);
    });
  };

  const clearCart = () => {
    setCartItems([]);
  };

  const getCartQuantity = (itemId: string): number => {
    return cartItems.find(ci => ci.id === itemId)?.quantity || 0;
  };

  // Calculate total
  const totalPrice = cartItems.reduce((acc, ci) => {
    const baseValue = ci.base_value || 1;
    return acc + (ci.quantity / baseValue) * ci.price;
  }, 0);

  const totalItemsCount = cartItems.length;

  // Category counts
  const getCategoryCount = (cat: string) => {
    if (cat === 'all') return items.length;
    return items.filter(i => i.category === cat).length;
  };

  // Map payment mode string to database enum
  const mapPaymentMode = (method: string): 'cash' | 'upi' | 'card' | 'other' => {
    const lower = method.toLowerCase();
    if (lower.includes('cash')) return 'cash';
    if (lower.includes('upi')) return 'upi';
    if (lower === 'card' || lower.includes('card')) return 'card';
    return 'other';
  };

  // WhatsApp share handler
  const handleWhatsAppShare = async (
    customerMobile: string,
    billNumber: string,
    finalItems: CartItem[],
    totalAmount: number,
    paymentMethod: string,
    discount: number,
    additionalChargesData: { name: string; amount: number }[]
  ) => {
    try {
      const { formatBillMessage, shareViaWhatsApp, isValidPhoneNumber } = await import('@/utils/whatsappBillShare');
      const isImageMode = whatsappShareMode === 'image';

      if (!isImageMode && !isValidPhoneNumber(customerMobile)) {
        toast({ title: 'Invalid Phone', description: 'Cannot send WhatsApp - invalid number', variant: 'destructive' });
        return;
      }

      if (isImageMode) {
        const { shareBillImageViaWhatsApp } = await import('@/utils/billImageGenerator');
        const billData: any = {
          billNo: billNumber,
          date: new Date().toLocaleDateString('en-IN'),
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          items: finalItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: Math.round((item.quantity / (item.base_value || 1)) * item.price),
            unit: item.unit,
            base_value: item.base_value,
          })),
          subtotal: finalItems.reduce((sum, item) => sum + Math.round((item.quantity / (item.base_value || 1)) * item.price), 0),
          discount,
          additionalCharges: additionalChargesData,
          total: totalAmount,
          paymentMethod,
          shopName: billSettings?.shopName || '',
          address: billSettings?.address || '',
          phone: billSettings?.contactNumber || '',
        };
        const result = await shareBillImageViaWhatsApp(customerMobile, billData);
        toast({
          title: result.success ? 'Shared!' : 'Downloaded',
          description: result.success ? 'Bill image shared via WhatsApp' : 'Bill image downloaded. Attach it in WhatsApp chat.',
        });
      } else {
        const message = formatBillMessage({
          billNo: billNumber,
          date: new Date().toLocaleDateString('en-IN'),
          items: finalItems.map(item => ({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: Math.round((item.quantity / (item.base_value || 1)) * item.price),
            unit: item.unit,
            base_value: item.base_value,
          })),
          subtotal: finalItems.reduce((sum, item) => sum + Math.round((item.quantity / (item.base_value || 1)) * item.price), 0),
          discount,
          additionalCharges: additionalChargesData,
          total: totalAmount,
          paymentMethod,
          shopName: billSettings?.shopName || '',
        } as any);
        shareViaWhatsApp(customerMobile, message);
        toast({ title: 'WhatsApp', description: 'Opening WhatsApp to share bill...' });
      }
    } catch (err) {
      console.error('WhatsApp share error:', err);
      toast({ title: 'WhatsApp Error', description: 'Failed to share via WhatsApp', variant: 'destructive' });
    }
  };

  // Build print data
  const buildPrintData = (
    billNumber: string,
    finalItems: CartItem[],
    totalAmount: number,
    paymentMethod: string,
    discount: number,
    additionalChargesData: { name: string; amount: number }[]
  ): PrintData => {
    const subtotal = finalItems.reduce((sum, item) => {
      const baseValue = item.base_value || 1;
      return sum + Math.round((item.quantity / baseValue) * item.price);
    }, 0);

    return {
      billNo: billNumber,
      date: new Date().toLocaleDateString('en-IN'),
      time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
      items: finalItems.map(item => ({
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: Math.round((item.quantity / (item.base_value || 1)) * item.price),
        unit: item.unit,
        base_value: item.base_value,
      })),
      subtotal,
      discount,
      additionalCharges: additionalChargesData,
      total: totalAmount,
      paymentMethod,
      shopName: billSettings?.shopName || '',
      address: billSettings?.address || '',
      contactNumber: billSettings?.contactNumber || '',
      printerWidth: billSettings?.printerWidth || '58mm',
      totalItemsCount: finalItems.length,
      smartQtyCount: calculateSmartQtyCount(finalItems),
      tableNo: selectedTableNumber ? `T${selectedTableNumber}` : undefined,
    };
  };

  // Handle complete payment from dialog
  const handleCompletePayment = async (paymentData: {
    paymentMethod: string;
    paymentAmounts: Record<string, number>;
    discount: number;
    discountType: 'flat' | 'percentage';
    additionalCharges: { name: string; amount: number; enabled: boolean }[];
    finalItems?: CartItem[];
    customerMobile?: string;
    sendWhatsApp?: boolean;
    customerGstin?: string;
  }) => {
    if (!user || !adminId) {
      toast({ variant: 'destructive', title: 'User not found' });
      return;
    }

    setPaymentDialogOpen(false);
    setIsLoading(true);

    try {
      const finalItems = (paymentData.finalItems || cartItems).filter(item => item.quantity > 0);
      if (finalItems.length === 0) {
        toast({ variant: 'destructive', title: 'No items to bill' });
        return;
      }

      // Calculate totals
      const subtotal = finalItems.reduce((sum, item) => {
        const baseValue = item.base_value || 1;
        return sum + Math.round((item.quantity / baseValue) * item.price);
      }, 0);
      const totalAdditionalCharges = paymentData.additionalCharges.reduce((sum, c) => sum + c.amount, 0);
      const totalAmount = Math.round(subtotal + totalAdditionalCharges - paymentData.discount);

      const billNumber = getInstantBillNumber(adminId);
      const now = new Date();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const paymentMode = mapPaymentMode(paymentData.paymentMethod);
      const additionalChargesArray = paymentData.additionalCharges.map(c => ({ name: c.name, amount: c.amount }));

      // Build bill payload
      const billPayload: any = {
        bill_no: billNumber,
        total_amount: totalAmount,
        discount: paymentData.discount,
        payment_mode: paymentMode,
        payment_details: paymentData.paymentAmounts,
        additional_charges: additionalChargesArray,
        created_by: user.id,
        admin_id: adminId,
        date: todayStr,
        table_no: selectedTableNumber ? `T${selectedTableNumber}` : null,
        customer_mobile: paymentData.customerMobile || null,
        customer_gstin: paymentData.customerGstin || null,
      };

      if (branchId) {
        billPayload.branch_id = branchId;
      }

      // Insert bill
      const { data: billData, error: billError } = await supabase
        .from('bills')
        .insert(billPayload)
        .select()
        .single();

      if (billError) throw billError;
      if (!billData) throw new Error('Failed to create bill');

      // Insert bill items
      const billItems = finalItems.map(item => ({
        bill_id: billData.id,
        item_id: item.id,
        quantity: item.quantity,
        price: item.price,
        total: Math.round((item.quantity / (item.base_value || 1)) * item.price),
      }));

      const { error: itemsError } = await supabase.from('bill_items').insert(billItems);
      if (itemsError) throw itemsError;

      // Update stock quantities
      for (const item of finalItems) {
        if (!item.unlimited_stock && item.stock_quantity !== null && item.stock_quantity !== undefined) {
          await supabase
            .from('items')
            .update({ stock_quantity: Math.max(0, (item.stock_quantity || 0) - item.quantity) })
            .eq('id', item.id);
        }
      }

      // Update table status if selected
      if (selectedTableId) {
        await supabase
          .from('tables')
          .update({ status: 'occupied', current_bill_id: billData.id })
          .eq('id', selectedTableId);
      }

      // Build print data
      const printData = buildPrintData(billNumber, finalItems, totalAmount, paymentData.paymentMethod, paymentData.discount, additionalChargesArray);

      // Try printing
      if (isConnected) {
        const printSuccess = await print(printData);
        if (!printSuccess) {
          setPrinterErrorMessage('Failed to print receipt via Bluetooth');
          setPendingPrintData(printData);
          setPrinterErrorOpen(true);
        }
      } else {
        // Use browser print
        printBrowserReceipt(printData);
      }

      // WhatsApp share
      if (paymentData.sendWhatsApp && paymentData.customerMobile) {
        await handleWhatsAppShare(
          paymentData.customerMobile,
          billNumber,
          finalItems,
          totalAmount,
          paymentData.paymentMethod,
          paymentData.discount,
          additionalChargesArray
        );
      }

      // Broadcast to other tabs
      billsChannel?.postMessage({ type: 'new-bill', billId: billData.id });

      toast({ title: '✅ Bill Created', description: `Bill #${billNumber} - ₹${totalAmount.toFixed(2)}` });

      // Reset
      clearCart();
      setSelectedTableId(null);
      setSelectedTableNumber(null);
      fetchItems(); // Refresh stock
    } catch (error) {
      console.error('Payment error:', error);
      toast({ variant: 'destructive', title: 'Payment Failed', description: (error as Error).message });
    } finally {
      setIsLoading(false);
    }
  };

  // Printer error handlers
  const handleRetryPrint = async () => {
    if (!pendingPrintData) return;
    setIsRetrying(true);
    try {
      const success = await print(pendingPrintData);
      if (success) {
        setPrinterErrorOpen(false);
        setPendingPrintData(null);
        toast({ title: '✅ Printed', description: 'Receipt printed successfully' });
      } else {
        toast({ variant: 'destructive', title: 'Print Failed', description: 'Still unable to print' });
      }
    } finally {
      setIsRetrying(false);
    }
  };

  const handleBrowserPrint = () => {
    if (pendingPrintData) {
      printBrowserReceipt(pendingPrintData);
    }
    setPrinterErrorOpen(false);
    setPendingPrintData(null);
  };

  // Open payment dialog
  const handlePayClick = () => {
    if (cartItems.length === 0) {
      toast({ variant: 'destructive', title: 'Cart is empty' });
      return;
    }
    setPaymentDialogOpen(true);
  };

  // Get grid columns based on display settings
  const gridCols = displaySettings.items_per_row || 3;

  return (
    <div className="billing-page flex flex-col h-[calc(100dvh-8rem)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <h1 className="text-2xl font-bold">Billing</h1>
        <TableSelector
          selectedTableId={selectedTableId}
          onSelectTable={(tableId, tableNumber) => {
            setSelectedTableId(tableId);
            setSelectedTableNumber(tableNumber);
          }}
        />
      </div>

      {/* Search */}
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search items..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="px-4 pb-2">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
          <Button
            variant={selectedCategory === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory('all')}
            className="rounded-full whitespace-nowrap text-xs h-8"
          >
            All ({getCategoryCount('all')})
          </Button>
          {categories.map(cat => (
            <Button
              key={cat}
              variant={selectedCategory === cat ? 'default' : 'outline'}
              size="sm"
              onClick={() => setSelectedCategory(cat)}
              className="rounded-full whitespace-nowrap text-xs h-8"
            >
              {cat} ({getCategoryCount(cat)})
            </Button>
          ))}
        </div>
      </div>

      {/* Items Grid - scrollable */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No items found</p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))` }}
          >
            {filteredItems.map(item => {
              const inCartQty = getCartQuantity(item.id);
              const isLowStock = !item.unlimited_stock && item.stock_quantity !== null && item.stock_quantity !== undefined && item.stock_quantity <= (item.minimum_stock_alert || 10) && item.stock_quantity > 0;
              const isOutOfStock = !item.unlimited_stock && item.stock_quantity !== null && item.stock_quantity !== undefined && item.stock_quantity <= 0;
              const shortUnit = getShortUnit(item.unit);

              return (
                <div
                  key={item.id}
                  className={`relative border-2 rounded-xl overflow-hidden transition-all ${
                    inCartQty > 0 ? 'border-primary shadow-md' : 'border-border'
                  } ${isOutOfStock ? 'opacity-50' : 'cursor-pointer'}`}
                  onClick={() => !isOutOfStock && addToCart(item)}
                >
                  {/* Low stock badge */}
                  {isLowStock && (
                    <Badge className="absolute top-1.5 left-1.5 z-10 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5">
                      <AlertTriangle className="w-3 h-3 mr-0.5" />
                      Low: {formatQuantityWithUnit(item.stock_quantity, item.unit)}
                    </Badge>
                  )}

                  {/* Quantity badge when in cart */}
                  {inCartQty > 0 && (
                    <Badge className="absolute top-1.5 right-1.5 z-10 bg-[hsl(var(--qty-badge))] text-primary-foreground text-xs px-2 py-0.5">
                      {formatQuantityWithUnit(inCartQty, item.unit)}
                    </Badge>
                  )}

                  {/* Image */}
                  {item.image_url ? (
                    <img
                      src={getCachedImageUrl(item.id) || item.image_url}
                      alt={item.name}
                      className="w-full aspect-square object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-muted flex items-center justify-center">
                      <Package size={32} className="text-muted-foreground" />
                    </div>
                  )}

                  {/* Item info */}
                  <div className="p-2">
                    <div className="font-semibold text-sm truncate">{item.name}</div>
                    <div className="text-sm font-bold text-primary">
                      ₹{item.price.toFixed(2)} / {item.base_value || 1}{shortUnit}
                    </div>
                  </div>

                  {/* Action button */}
                  {inCartQty > 0 ? (
                    <div className="flex items-center justify-center gap-2 px-2 pb-2" onClick={e => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0 rounded-full bg-[hsl(var(--btn-decrement))] text-primary-foreground border-0"
                        onClick={() => updateQuantity(item.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="font-bold text-sm min-w-[2rem] text-center">
                        {isWeightOrVolumeUnit(item.unit) ? inCartQty : inCartQty}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0 rounded-full bg-[hsl(var(--btn-increment))] text-primary-foreground border-0"
                        onClick={() => updateQuantity(item.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="px-2 pb-2">
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs font-semibold"
                        disabled={isOutOfStock}
                        onClick={(e) => { e.stopPropagation(); addToCart(item); }}
                      >
                        {isOutOfStock ? 'Out of Stock' : 'Add'}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Cart Bar - Sticky within billing content, not overlapping sidebar */}
      {cartItems.length > 0 && (
        <div className="sticky bottom-0 z-40 px-4 pb-2 pt-2 -mx-3 sm:-mx-4 bg-gradient-to-t from-background via-background to-transparent">
          <div className="bg-primary text-primary-foreground rounded-2xl shadow-lg px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShoppingCart className="w-5 h-5" />
              <div>
                <span className="font-bold">{totalItemsCount} items</span>
                <span className="ml-2 font-bold text-lg">₹{totalPrice.toFixed(2)}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-primary-foreground hover:bg-primary-foreground/20 h-8 w-8 p-0"
                onClick={clearCart}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="font-bold px-4 h-9 rounded-xl"
                onClick={handlePayClick}
              >
                Pay
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CompletePaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        cart={cartItems}
        paymentTypes={paymentTypes}
        additionalCharges={additionalCharges}
        onUpdateQuantity={(itemId, change) => updateQuantity(itemId, change)}
        onRemoveItem={removeFromCart}
        onCompletePayment={handleCompletePayment}
        whatsappEnabled={whatsappEnabled}
        whatsappShareMode={whatsappShareMode}
        gstEnabled={gstEnabled}
      />

      <PrinterErrorDialog
        open={printerErrorOpen}
        onOpenChange={setPrinterErrorOpen}
        errorMessage={printerErrorMessage}
        onRetry={handleRetryPrint}
        onSaveWithoutPrint={handleBrowserPrint}
        isRetrying={isRetrying}
      />

      {/* Pending Bills Queue (offline support) */}
      <PendingBillsQueue />
    </div>
  );
};

export default Billing;
