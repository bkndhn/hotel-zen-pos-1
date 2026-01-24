import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { ShoppingCart, Plus, Minus, Search, Grid, List, X, Trash2, Edit2, Check, Package, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CompletePaymentDialog } from '@/components/CompletePaymentDialog';
import { PrinterErrorDialog } from '@/components/PrinterErrorDialog';
import { getCachedImageUrl, cacheImageUrl } from '@/utils/imageUtils';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { printReceipt, PrintData } from '@/utils/bluetoothPrinter';
import { printBrowserReceipt } from '@/utils/browserPrinter';
import { format } from 'date-fns';
import { getShortUnit, formatQuantityWithUnit, isWeightOrVolumeUnit } from '@/utils/timeUtils';

// BroadcastChannel for instant cross-tab sync
const billsChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bills-updates') : null;
interface Item {
  id: string;
  name: string;
  price: number;
  image_url?: string;
  is_active: boolean;
  category?: string;
  unit?: string;
  base_value?: number;
  quantity_step?: number;
  stock_quantity?: number;
  minimum_stock_alert?: number;
}

// Helper to check if item has low stock
const isLowStock = (item: Item): boolean => {
  if (item.stock_quantity === null || item.stock_quantity === undefined) return false;
  if (item.minimum_stock_alert === null || item.minimum_stock_alert === undefined) return false;
  return item.stock_quantity <= item.minimum_stock_alert;
};

// Removed inline getSimplifiedUnit - now using getShortUnit from timeUtils
interface CartItem extends Item {
  quantity: number;
}
interface PaymentType {
  id: string;
  payment_type: string;
  is_disabled: boolean;
  is_default: boolean;
}
interface ItemCategory {
  id: string;
  name: string;
  is_deleted: boolean;
}

const CategoryScrollBar: React.FC<{
  categories: ItemCategory[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  categoryOrder: string[];
}> = ({ categories, selectedCategory, onSelectCategory, categoryOrder }) => {
  // Sort categories based on saved order
  const sortedCategories = [...categories].sort((a, b) => {
    const indexA = categoryOrder.indexOf(a.name);
    const indexB = categoryOrder.indexOf(b.name);
    if (indexA === -1 && indexB === -1) return a.name.localeCompare(b.name);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return (
    <div className="mb-3 w-full overflow-hidden">
      <div className="flex gap-2 pb-2 overflow-x-auto scrollbar-hide" style={{ maxWidth: '100%' }}>
        <Button
          variant={selectedCategory === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => onSelectCategory('all')}
          className={`whitespace-nowrap flex-shrink-0 h-8 px-4 ${selectedCategory === 'all'
            ? 'bg-primary text-primary-foreground shadow-md'
            : 'hover:bg-muted'
            }`}
        >
          All Categories
        </Button>
        {sortedCategories.map((category) => (
          <Button
            key={category.id}
            variant={selectedCategory === category.name ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSelectCategory(category.name)}
            className={`whitespace-nowrap flex-shrink-0 h-8 px-4 ${selectedCategory === category.name
              ? 'bg-primary text-primary-foreground shadow-md'
              : 'hover:bg-muted'
              }`}
          >
            {category.name}
          </Button>
        ))}
      </div>
    </div>
  );
};
interface Bill {
  id: string;
  bill_no: string;
  total_amount: number;
  discount: number;
  payment_mode: string;
  date: string;
  created_at: string;
}
interface BillItem {
  id: string;
  item_id: string;
  quantity: number;
  price: number;
  total: number;
  items: {
    id: string;
    name: string;
    price: number;
    image_url?: string;
    is_active: boolean;
  };
}
type PaymentMode = "cash" | "upi" | "card" | "other";
const Billing = () => {
  const {
    profile
  } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return localStorage.getItem('billing-view-mode') as 'grid' | 'list' || 'grid';
  });
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<string>('');
  const [discount, setDiscount] = useState(0);
  const [editingQuantity, setEditingQuantity] = useState<string | null>(null);
  const [tempQuantity, setTempQuantity] = useState<string>('');
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [additionalCharges, setAdditionalCharges] = useState<any[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [displaySettings, setDisplaySettings] = useState({
    items_per_row: 3,
    category_order: [] as string[]
  });
  const [itemCategories, setItemCategories] = useState<ItemCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const syncChannelRef = useRef<any>(null);

  // Setup Global Sync Channel for Cross-Device updates
  useEffect(() => {
    const channel = supabase.channel('pos-global-sync', {
      config: { broadcast: { self: true } }
    }).subscribe();

    syncChannelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, []);
  const [billSettings, setBillSettings] = useState<{
    shopName: string;
    address: string;
    contactNumber: string;
    logoUrl: string;
    facebook: string;
    showFacebook?: boolean;
    instagram: string;
    showInstagram?: boolean;
    whatsapp: string;
    showWhatsapp?: boolean;
    printerWidth: '58mm' | '80mm';
    auto_connect_printer?: boolean;
    printer_name?: string;
  } | null>(null);

  // Printer error dialog state
  const [printerErrorOpen, setPrinterErrorOpen] = useState(false);
  const [printerErrorMessage, setPrinterErrorMessage] = useState('');
  const [isRetryingPrint, setIsRetryingPrint] = useState(false);
  const pendingPaymentRef = useRef<{
    paymentData: any;
    billPayload: any;
    billItems: any[];
    printData: PrintData;
    validCart: CartItem[];
  } | null>(null);

  // Enable real-time updates
  useRealTimeUpdates();

  // Listen for custom real-time events
  useEffect(() => {
    const handleItemsUpdate = () => {
      fetchItems();
    };
    const handleCategoriesUpdate = () => {
      fetchItemCategories();
      fetchDisplaySettings();
    };
    const handlePaymentsUpdate = () => {
      fetchPaymentTypes();
    };
    const handleAdditionalChargesUpdate = () => {
      console.log('Additional charges updated, refreshing...');
      fetchAdditionalCharges();
    };
    const handleShopSettingsUpdate = () => {
      console.log('Shop settings updated, refreshing...');
      fetchShopSettings();
    };
    const handleDisplaySettingsUpdate = () => {
      console.log('Display settings updated, refreshing...');
      fetchDisplaySettings();
    };

    window.addEventListener('items-updated', handleItemsUpdate);
    window.addEventListener('categories-updated', handleCategoriesUpdate);
    window.addEventListener('payment-types-updated', handlePaymentsUpdate);
    window.addEventListener('additional-charges-updated', handleAdditionalChargesUpdate);
    window.addEventListener('shop-settings-updated', handleShopSettingsUpdate);
    window.addEventListener('display-settings-updated', handleDisplaySettingsUpdate);

    return () => {
      window.removeEventListener('items-updated', handleItemsUpdate);
      window.removeEventListener('categories-updated', handleCategoriesUpdate);
      window.removeEventListener('payment-types-updated', handlePaymentsUpdate);
      window.removeEventListener('additional-charges-updated', handleAdditionalChargesUpdate);
      window.removeEventListener('shop-settings-updated', handleShopSettingsUpdate);
      window.removeEventListener('display-settings-updated', handleDisplaySettingsUpdate);
    };
  }, []);

  // Fetch functions defined before useEffect
  const fetchItems = async () => {
    try {
      // Try to get from network first
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from('items')
          .select('*')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;

        // Sort by display_order client-side if the field exists
        const sortedData = (data || []).sort((a: any, b: any) => {
          const orderA = a.display_order ?? 9999;
          const orderB = b.display_order ?? 9999;
          if (orderA !== orderB) return orderA - orderB;
          return (a.name || '').localeCompare(b.name || '');
        });

        setItems(sortedData);

        // Cache items for offline use
        const { offlineManager } = await import('@/utils/offlineManager');
        await offlineManager.cacheItems(sortedData);
      } else {
        // Offline: Use cached items
        const { offlineManager } = await import('@/utils/offlineManager');
        const cachedItems = await offlineManager.getCachedItems();
        if (cachedItems.length > 0) {
          const sortedData = cachedItems.filter((i: any) => i.is_active).sort((a: any, b: any) => {
            const orderA = a.display_order ?? 9999;
            const orderB = b.display_order ?? 9999;
            if (orderA !== orderB) return orderA - orderB;
            return (a.name || '').localeCompare(b.name || '');
          });
          setItems(sortedData);
          toast({
            title: "Offline Mode",
            description: `Loaded ${sortedData.length} items from cache`,
          });
        } else {
          toast({
            title: "No Cached Data",
            description: "Connect to internet to load items",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Error fetching items:', error);
      // Fallback to cache on error
      try {
        const { offlineManager } = await import('@/utils/offlineManager');
        const cachedItems = await offlineManager.getCachedItems();
        if (cachedItems.length > 0) {
          setItems(cachedItems.filter((i: any) => i.is_active));
        }
      } catch (cacheError) {
        toast({
          title: "Error",
          description: "Failed to fetch items",
          variant: "destructive"
        });
      }
    } finally {
      setLoading(false);
    }
  };
  const fetchPaymentTypes = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('payments').select('*').eq('is_disabled', false).order('payment_type');
      if (error) throw error;
      const types = data || [];
      setPaymentTypes(types);

      // Set default payment only if not in edit mode
      if (!isEditMode) {
        const defaultPayment = types.find(p => p.is_default);
        if (defaultPayment) {
          setSelectedPayment(defaultPayment.payment_type);
        } else if (types.length > 0) {
          setSelectedPayment(types[0].payment_type);
        }
      }
    } catch (error) {
      console.error('Error fetching payment types:', error);
      toast({
        title: "Error",
        description: "Failed to fetch payment types",
        variant: "destructive"
      });
    }
  };
  const fetchAdditionalCharges = async () => {
    try {
      const {
        data,
        error
      } = await supabase.from('additional_charges').select('*').eq('is_active', true).order('name');
      if (error) throw error;
      setAdditionalCharges(data || []);
    } catch (error) {
      console.error('Error fetching additional charges:', error);
      toast({
        title: "Error",
        description: "Failed to fetch additional charges",
        variant: "destructive"
      });
    }
  };
  const fetchDisplaySettings = async () => {
    if (!profile?.user_id) return;
    try {
      const {
        data,
        error
      } = await supabase.from('display_settings').select('*').eq('user_id', profile.user_id).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        setDisplaySettings({
          items_per_row: data.items_per_row,
          category_order: data.category_order || []
        });
      }
    } catch (error) {
      console.error('Error fetching display settings:', error);
    }
  };

  const fetchItemCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('item_categories')
        .select('*')
        .eq('is_deleted', false)
        .order('name');
      if (error) throw error;
      setItemCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  // Cache-first shop settings loading
  const loadShopSettingsFromCache = () => {
    const saved = localStorage.getItem('hotel_pos_bill_header');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setBillSettings({
          shopName: parsed.shopName || '',
          address: parsed.address || '',
          contactNumber: parsed.contactNumber || '',
          logoUrl: parsed.logoUrl || '',
          facebook: parsed.facebook || '',
          showFacebook: parsed.showFacebook !== false,
          instagram: parsed.instagram || '',
          showInstagram: parsed.showInstagram !== false,
          whatsapp: parsed.whatsapp || '',
          showWhatsapp: parsed.showWhatsapp !== false,
          printerWidth: parsed.printerWidth || '58mm'
        });
      } catch (e) { /* ignore */ }
    }
  };

  // Fetch shop settings from Supabase (background sync)
  const fetchShopSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('shop_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        const settings = {
          shopName: data.shop_name || '',
          address: data.address || '',
          contactNumber: data.contact_number || '',
          logoUrl: data.logo_url || '',
          facebook: data.facebook || '',
          showFacebook: data.show_facebook,
          instagram: data.instagram || '',
          showInstagram: data.show_instagram,
          whatsapp: data.whatsapp || '',
          showWhatsapp: data.show_whatsapp,
          printerWidth: data.printer_width as '58mm' | '80mm' || '58mm'
        };
        setBillSettings(settings);
        // Update cache
        localStorage.setItem('hotel_pos_bill_header', JSON.stringify(settings));
        return settings;
      }
      return null;
    } catch (error) {
      console.error('Error fetching shop settings:', error);
      return null;
    }
  };

  useEffect(() => {
    fetchItems();
    fetchPaymentTypes();
    fetchAdditionalCharges();
    fetchItemCategories();
    loadShopSettingsFromCache(); // Instant load from cache
    fetchShopSettings();          // Background sync from Supabase
    if (profile?.user_id) {
      fetchDisplaySettings();
    }

    // Check if we're editing a bill
    const billData = location.state?.bill;
    if (billData) {
      setEditingBill(billData);
      setIsEditMode(true);
      loadBillData(billData.id);
    }

    // Load local settings
    const savedHeader = localStorage.getItem('hotel_pos_bill_header');
    const savedWidth = localStorage.getItem('hotel_pos_printer_width') as '58mm' | '80mm';
    if (savedHeader || savedWidth) {
      setBillSettings({
        ...JSON.parse(savedHeader || '{}'),
        printerWidth: savedWidth || '58mm'
      });
    }
  }, [location.state, profile?.user_id]);
  const loadBillData = async (billId: string) => {
    try {
      console.log('Loading bill data for:', billId);

      // Fetch bill items with item details
      const {
        data: billItems,
        error: billItemsError
      } = await supabase.from('bill_items').select(`
          *,
          items (
            id,
            name,
            price,
            image_url,
            is_active,
            unit,
            base_value,
            quantity_step
          )
        `).eq('bill_id', billId);
      if (billItemsError) {
        console.error('Error fetching bill items:', billItemsError);
        throw billItemsError;
      }
      console.log('Bill items loaded:', billItems);

      // Convert bill items to cart items
      if (billItems && billItems.length > 0) {
        const cartItems: CartItem[] = billItems.map((billItem: BillItem) => {
          const itemData = billItem.items as any;
          return {
            id: itemData.id,
            name: itemData.name,
            price: billItem.price, // Use price from bill item
            image_url: itemData.image_url,
            is_active: itemData.is_active,
            unit: itemData.unit,
            base_value: itemData.base_value,
            quantity_step: itemData.quantity_step,
            quantity: billItem.quantity
          };
        });
        setCart(cartItems.filter(item => item.quantity > 0));
        setDiscount(editingBill?.discount || 0);
        setSelectedPayment(editingBill?.payment_mode || '');
      }
    } catch (error) {
      console.error('Error loading bill data:', error);
      toast({
        title: "Error",
        description: "Failed to load bill data",
        variant: "destructive"
      });
    }
  };
  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    // Hide out-of-stock items (items with stock_quantity of 0 or less)
    // Items without stock tracking (null/undefined) are still shown
    const isInStock = item.stock_quantity === null || item.stock_quantity === undefined || item.stock_quantity > 0;
    return matchesSearch && matchesCategory && isInStock;
  });
  const addToCart = (item: Item) => {
    setCart(prev => {
      const existing = prev.find(cartItem => cartItem.id === item.id);
      const step = item.quantity_step || 1;
      const baseValue = item.base_value || 1;

      if (existing) {
        return prev.map(cartItem => cartItem.id === item.id ? {
          ...cartItem,
          quantity: cartItem.quantity + step
        } : cartItem);
      }
      return [...prev, {
        ...item,
        quantity: baseValue
      }];
    });
    // Clear search after adding to cart for user friendliness
    setSearchQuery('');
  };
  const updateQuantity = (id: string, change: number) => {
    setCart(prev => {
      return prev.map(item => {
        if (item.id === id) {
          const step = item.quantity_step || 1;
          const actualChange = change > 0 ? step : -step;
          const newQuantity = Math.max(0, item.quantity + actualChange);
          return {
            ...item,
            quantity: newQuantity
          };
        }
        return item;
      }).filter(item => item.quantity > 0);
    });
  };
  const startEditingQuantity = (id: string, currentQuantity: number) => {
    setEditingQuantity(id);
    setTempQuantity(currentQuantity.toString());
  };
  const saveQuantity = (id: string) => {
    const newQuantity = parseInt(tempQuantity);
    if (newQuantity && newQuantity > 0) {
      setCart(prev => prev.map(item => item.id === id ? {
        ...item,
        quantity: newQuantity
      } : item).filter(item => item.quantity > 0));
    } else {
      // If quantity is 0 or invalid, remove item from cart
      setCart(prev => prev.filter(item => item.id !== id));
    }
    setEditingQuantity(null);
    setTempQuantity('');
  };
  const cancelEditQuantity = () => {
    setEditingQuantity(null);
    setTempQuantity('');
  };
  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };
  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setIsEditMode(false);
    setEditingBill(null);
    // Navigate back to billing without any state
    navigate('/billing', {
      replace: true
    });
  };
  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('billing-view-mode', mode);
  };
  const getTotalAmount = () => {
    const subtotal = cart.reduce((sum, item) => {
      const baseValue = item.base_value || 1;
      const itemTotal = (item.quantity / baseValue) * item.price;
      return sum + itemTotal;
    }, 0);
    return Math.max(0, subtotal - discount);
  };
  const total = getTotalAmount();

  // Map payment types to valid enum values
  const mapPaymentMode = (paymentType: string): PaymentMode => {
    const normalizedType = paymentType.toLowerCase().trim();
    switch (normalizedType) {
      case 'cash':
        return 'cash';
      case 'upi':
      case 'phonepe':
      case 'gpay':
      case 'paytm':
        return 'upi';
      case 'card':
      case 'debit':
      case 'credit':
        return 'card';
      default:
        return 'other';
    }
  };
  const updateBill = async () => {
    if (!editingBill) return;
    if (cart.length === 0) {
      toast({
        title: "Error",
        description: "Cart is empty",
        variant: "destructive"
      });
      return;
    }
    if (!selectedPayment) {
      toast({
        title: "Error",
        description: "Please select a payment method",
        variant: "destructive"
      });
      return;
    }
    try {
      console.log('Updating bill:', editingBill.id);
      const paymentMode = mapPaymentMode(selectedPayment);

      // Update bill
      const {
        error: billError
      } = await supabase.from('bills').update({
        total_amount: getTotalAmount(),
        discount: discount,
        payment_mode: paymentMode,
        is_edited: true
      }).eq('id', editingBill.id);
      if (billError) {
        console.error('Bill update error:', billError);
        throw billError;
      }

      // Delete existing bill items
      const {
        error: deleteError
      } = await supabase.from('bill_items').delete().eq('bill_id', editingBill.id);
      if (deleteError) {
        console.error('Error deleting old bill items:', deleteError);
        throw deleteError;
      }

      // Insert new bill items
      const billItems = cart.map(item => {
        const baseValue = item.base_value || 1;
        return {
          bill_id: editingBill.id,
          item_id: item.id,
          quantity: item.quantity,
          price: item.price,
          total: (item.quantity / baseValue) * item.price
        };
      });
      const {
        error: itemsError
      } = await supabase.from('bill_items').insert(billItems);
      if (itemsError) {
        console.error('Bill items error:', itemsError);
        throw itemsError;
      }
      toast({
        title: "Success",
        description: `Bill ${editingBill.bill_no} updated successfully!`
      });

      // Clear cart and navigate back to reports
      clearCart();
      navigate('/reports');
    } catch (error) {
      console.error('Error updating bill:', error);
      toast({
        title: "Error",
        description: "Failed to update bill. Please try again.",
        variant: "destructive"
      });
    }
  };

  // Helper function to save bill to database
  const saveBillToDatabase = async (
    billPayload: any,
    validCart: CartItem[],
    billNumber: string
  ) => {
    // 1. Create Bill
    const { data: billData, error: billError } = await supabase
      .from('bills')
      .insert(billPayload)
      .select()
      .single();

    if (billError) throw billError;
    if (!billData) throw new Error('Failed to create bill record');

    // 2. Create Bill Items
    const billItems = validCart.map(item => {
      const baseValue = item.base_value || 1;
      return {
        bill_id: billData.id,
        item_id: item.id,
        quantity: item.quantity,
        price: item.price,
        total: (item.quantity / baseValue) * item.price
      };
    });

    const { error: itemsError } = await supabase
      .from('bill_items')
      .insert(billItems);

    if (itemsError) {
      console.error("Failed to insert items, rolling back bill...", itemsError);
      await supabase.from('bills').delete().eq('id', billData.id);
      throw itemsError;
    }

    // 3. Stock Deduction
    for (const item of validCart) {
      const { data: currentItem } = await supabase
        .from('items')
        .select('stock_quantity')
        .eq('id', item.id)
        .single();

      if (currentItem && currentItem.stock_quantity !== null && currentItem.stock_quantity !== undefined) {
        await supabase
          .from('items')
          .update({ stock_quantity: Math.max(0, (currentItem.stock_quantity || 0) - item.quantity) })
          .eq('id', item.id);
      }
    }

    toast({
      title: "Success",
      description: `Bill ${billNumber} generated!`,
      duration: 2000
    });

    // === INSTANT 4-LAYER SYNC ===
    // Layer 3: Window custom events - same tab (0ms)
    window.dispatchEvent(new CustomEvent('bills-updated'));

    // Layer 1: BroadcastChannel - same browser tabs (0ms) - INSTANT VOICE
    billsChannel?.postMessage({
      type: 'new-bill',
      bill_no: billNumber,
      bill_id: billData.id,
      timestamp: Date.now()
    });

    // Layer 2: Supabase Broadcast - cross-device (<100ms) - INSTANT VOICE
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

    return billData;
  };

  // Handler for retry print button in error dialog
  const handleRetryPrint = async () => {
    if (!pendingPaymentRef.current) return;

    setIsRetryingPrint(true);
    try {
      const printed = await printReceipt(pendingPaymentRef.current.printData);
      if (printed) {
        // Print successful - now save the bill
        setPrinterErrorOpen(false);
        await saveBillToDatabase(
          pendingPaymentRef.current.billPayload,
          pendingPaymentRef.current.validCart,
          pendingPaymentRef.current.printData.billNo
        );
        pendingPaymentRef.current = null;
      } else {
        // Still failed
        setPrinterErrorMessage("Printer did not respond. Check connection.");
      }
    } catch (e: any) {
      console.error("Retry print failed:", e);
      setPrinterErrorMessage(e.message || "Print failed. Try again.");
    } finally {
      setIsRetryingPrint(false);
    }
  };

  // Handler for save without printing button in error dialog
  const handleSaveWithoutPrint = async () => {
    if (!pendingPaymentRef.current) return;

    setPrinterErrorOpen(false);
    try {
      await saveBillToDatabase(
        pendingPaymentRef.current.billPayload,
        pendingPaymentRef.current.validCart,
        pendingPaymentRef.current.printData.billNo
      );

      // Fallback to browser print
      printBrowserReceipt(pendingPaymentRef.current.printData);

      toast({
        title: "Bill Saved",
        description: "Bill saved without Bluetooth printing. Browser print opened.",
      });
    } catch (error: any) {
      console.error('Error saving bill:', error);
      toast({
        title: "Save Error",
        description: error.message || "Failed to save bill",
        variant: "destructive"
      });
    } finally {
      pendingPaymentRef.current = null;
    }
  };

  const handleCompletePayment = async (paymentData: {
    paymentMethod: string;
    paymentAmounts: Record<string, number>;
    discount: number;
    discountType: 'flat' | 'percentage';
    additionalCharges: {
      name: string;
      amount: number;
      enabled: boolean;
    }[];
    finalItems?: CartItem[];
  }) => {
    setPaymentDialogOpen(false);

    const finalCart = paymentData.finalItems || cart;
    const previousCart = [...finalCart];

    // Clear cart immediately for better UX
    clearCart();

    try {
      console.log('Completing payment with data:', paymentData);

      const validCart = previousCart.filter(item => item.quantity > 0);
      if (validCart.length === 0) {
        toast({
          title: "Error",
          description: "Cart was empty",
          variant: "destructive"
        });
        return;
      }

      const isOffline = !navigator.onLine;

      // Generate Bill Number
      let billNumber: string;
      const continueBillFromYesterday = localStorage.getItem('hotel_pos_continue_bill_number') !== 'false';

      if (isOffline) {
        billNumber = `BILL-OFF-${Date.now()}`;
      } else if (continueBillFromYesterday) {
        // Continue sequential numbering from all bills
        const { data: allBillNos } = await supabase
          .from('bills')
          .select('bill_no')
          .order('created_at', { ascending: false })
          .limit(100);

        let maxNumber = 55;
        if (allBillNos && allBillNos.length > 0) {
          allBillNos.forEach(bill => {
            const match = bill.bill_no.match(/^BILL-(\d{6})$/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > maxNumber) {
                maxNumber = num;
              }
            }
          });
        }
        billNumber = `BILL-${String(maxNumber + 1).padStart(6, '0')}`;
      } else {
        // Start fresh daily with date prefix: DD/MM/YY-NNN
        const today = new Date();
        const datePrefix = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getFullYear()).slice(-2)}`;
        const todayDateString = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        // Get today's bills only
        const { data: todayBills } = await supabase
          .from('bills')
          .select('bill_no')
          .eq('date', todayDateString)
          .order('created_at', { ascending: false });

        let todayMaxNumber = 0;
        if (todayBills && todayBills.length > 0) {
          todayBills.forEach(bill => {
            // Match pattern DD/MM/YY-NNN
            const match = bill.bill_no.match(/-(\d{3})$/);
            if (match) {
              const num = parseInt(match[1], 10);
              if (num > todayMaxNumber) {
                todayMaxNumber = num;
              }
            }
          });
        }
        billNumber = `${datePrefix}-${String(todayMaxNumber + 1).padStart(3, '0')}`;
      }

      const now = new Date();
      const subtotal = validCart.reduce((sum, item) => {
        const baseValue = item.base_value || 1;
        return sum + (item.quantity / baseValue) * item.price;
      }, 0);
      const totalAdditionalCharges = paymentData.additionalCharges.reduce((sum, charge) => sum + charge.amount, 0);
      const totalAmount = subtotal + totalAdditionalCharges - paymentData.discount;

      const mapPaymentMode = (method: string): PaymentMode => {
        const lower = method.toLowerCase();
        if (lower.includes('cash')) return 'cash';
        if (lower.includes('upi')) return 'upi';
        if (lower === 'card' || lower.includes('card')) return 'card';
        return 'other';
      };
      const paymentMode = mapPaymentMode(paymentData.paymentMethod);
      const additionalChargesArray = paymentData.additionalCharges.map(c => ({ name: c.name, amount: c.amount }));

      // Get admin_id for data isolation (admin's own id if admin, or parent admin_id if sub-user)
      const adminId = profile?.role === 'admin' ? profile?.id : profile?.admin_id;

      const billPayload = {
        bill_no: billNumber,
        total_amount: totalAmount,
        discount: paymentData.discount,
        payment_mode: paymentMode,
        payment_details: paymentData.paymentAmounts,
        additional_charges: additionalChargesArray,
        created_by: profile?.user_id,
        admin_id: adminId || null,
        date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
        // Service Area & Kitchen Display status - enables realtime updates
        service_status: 'pending',
        kitchen_status: 'pending',
        status_updated_at: now.toISOString()
      };

      // OFFLINE MODE - Use new PendingBill system
      if (isOffline) {
        const { offlineManager } = await import('@/utils/offlineManager');

        const pendingBillId = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Save to pending bills queue (new system)
        await offlineManager.savePendingBill({
          id: pendingBillId,
          bill_no: billNumber,
          total_amount: totalAmount,
          discount: paymentData.discount,
          payment_mode: paymentMode,
          payment_details: paymentData.paymentAmounts,
          additional_charges: additionalChargesArray,
          created_by: profile?.user_id || '',
          date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
          created_at: now.toISOString(),
          items: validCart.map(item => ({
            item_id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: (item.quantity / (item.base_value || 1)) * item.price
          }))
        });

        toast({
          title: "📴 Bill Saved Offline",
          description: `${billNumber} queued. Will sync when online.`,
          duration: 3000
        });

        // Try print in offline mode ONLY if auto-print is enabled
        const offlineAutoPrintEnabled = localStorage.getItem('hotel_pos_auto_print') !== 'false';
        if (offlineAutoPrintEnabled) {
          try {
            const offlinePrintData = {
              billNo: billNumber,
              date: format(now, 'MMM dd, yyyy'),
              time: format(now, 'hh:mm a'),
              items: validCart.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                total: (item.quantity / (item.base_value || 1)) * item.price
              })),
              subtotal,
              discount: paymentData.discount,
              additionalCharges: additionalChargesArray,
              total: totalAmount,
              paymentMethod: paymentMode.toUpperCase(),
              paymentDetails: paymentData.paymentAmounts,
              hotelName: profile?.hotel_name || 'ZEN POS',
              shopName: billSettings?.shopName,
              address: billSettings?.address,
              contactNumber: billSettings?.contactNumber,
              logoUrl: billSettings?.logoUrl,
              facebook: billSettings?.showFacebook !== false ? billSettings?.facebook : undefined,
              instagram: billSettings?.showInstagram !== false ? billSettings?.instagram : undefined,
              whatsapp: billSettings?.showWhatsapp !== false ? billSettings?.whatsapp : undefined
            };
            await printReceipt(offlinePrintData as PrintData);
          } catch (printError) {
            console.log('Print skipped while offline:', printError);
          }
        }
        return;
      }

      // ONLINE MODE - Prepare print data
      const freshSettings = await fetchShopSettings();
      const settingsToUse = freshSettings || billSettings;

      const printData: PrintData = {
        billNo: billNumber,
        date: format(now, 'MMM dd, yyyy'),
        time: format(now, 'hh:mm a'),
        items: validCart.map(item => {
          const baseValue = item.base_value || 1;
          return {
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            total: (item.quantity / baseValue) * item.price
          };
        }),
        subtotal: subtotal,
        additionalCharges: additionalChargesArray,
        discount: paymentData.discount,
        total: totalAmount,
        paymentMethod: paymentData.paymentMethod.toUpperCase(),
        paymentDetails: paymentData.paymentAmounts,
        hotelName: profile?.hotel_name || 'ZEN POS',
        shopName: settingsToUse?.shopName,
        address: settingsToUse?.address,
        contactNumber: settingsToUse?.contactNumber,
        facebook: settingsToUse?.showFacebook !== false ? settingsToUse?.facebook : undefined,
        instagram: settingsToUse?.showInstagram !== false ? settingsToUse?.instagram : undefined,
        whatsapp: settingsToUse?.showWhatsapp !== false ? settingsToUse?.whatsapp : undefined,
        printerWidth: settingsToUse?.printerWidth || '58mm',
        logoUrl: settingsToUse?.logoUrl
      };

      // Check auto-print setting
      const autoPrintEnabled = localStorage.getItem('hotel_pos_auto_print') !== 'false';

      if (autoPrintEnabled) {
        // TRY PRINT FIRST - Block bill save if print fails
        let printed = false;
        let printError = '';

        try {
          printed = await printReceipt(printData);
        } catch (e: any) {
          console.error("Bluetooth print failed:", e);
          printError = e.message || "Unable to connect to printer";
        }

        if (!printed) {
          // Print failed - Store pending data and show error dialog
          pendingPaymentRef.current = {
            paymentData,
            billPayload,
            billItems: validCart.map(item => ({
              item_id: item.id,
              quantity: item.quantity,
              price: item.price,
              total: item.price * item.quantity
            })),
            printData,
            validCart
          };
          setPrinterErrorMessage(printError || "Printer not responding. Check if printer is on and connected.");
          setPrinterErrorOpen(true);
          return; // DON'T SAVE BILL - Wait for user action
        }

        // Print successful - Save bill to database
        await saveBillToDatabase(billPayload, validCart, billNumber);
      } else {
        // Auto-print disabled - Just save bill
        await saveBillToDatabase(billPayload, validCart, billNumber);
        console.log("Auto-print disabled, bill saved without printing.");
      }

    } catch (error: any) {
      console.error('Error completing payment:', error);
      toast({
        title: "Payment Error",
        description: error.message || "Failed to save bill. Check connection.",
        variant: "destructive"
      });
    }
  };




  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
    </div>;
  }
  return <div className="min-h-screen flex overflow-x-hidden max-w-[100vw]">
    {/* Main Items Area */}
    <div className="flex-1 p-4 overflow-hidden max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold leading-none">
              {isEditMode ? `Edit Bill - ${editingBill?.bill_no}` : 'Billing'}
            </h1>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <div className="flex items-center relative">
          <Search className="absolute left-3 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search items..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
        </div>
      </div>

      {/* Category Horizontal Scroll */}
      <CategoryScrollBar
        categories={itemCategories}
        selectedCategory={selectedCategory}
        onSelectCategory={setSelectedCategory}
        categoryOrder={displaySettings.category_order}
      />

      {/* Items Grid - Scrollable */}
      <div
        className="overflow-y-auto pb-40 md:pb-4 scroll-smooth"
        style={{
          height: 'calc(100vh - 200px)',
          WebkitOverflowScrolling: 'touch'  // Smooth scroll on iOS
        }}
      >
        {viewMode === 'grid' ? <div className={`grid gap-2 ${displaySettings.items_per_row === 1 ? 'grid-cols-1' : displaySettings.items_per_row === 2 ? 'grid-cols-2' : displaySettings.items_per_row === 3 ? 'grid-cols-3' : displaySettings.items_per_row === 4 ? 'grid-cols-4' : displaySettings.items_per_row === 5 ? 'grid-cols-5' : 'grid-cols-6'}`}>
          {filteredItems.map(item => {
            const cartItem = cart.find(c => c.id === item.id);
            const cachedImageUrl = getCachedImageUrl(item.id);
            const imageUrl = item.image_url || cachedImageUrl;

            // Cache the image URL if it exists
            if (item.image_url && !cachedImageUrl) {
              cacheImageUrl(item.id, item.image_url);
            }
            const isInCart = cartItem && cartItem.quantity > 0;
            const unitLabel = getShortUnit(item.unit);
            const lowStock = isLowStock(item);
            return <div key={item.id} className={`relative bg-card rounded-xl border-2 p-1.5 flex flex-col shadow-sm transition-all duration-300 ${isInCart ? 'border-primary shadow-primary/20 shadow-md' : lowStock ? 'border-orange-500 dark:border-orange-400' : 'border-gray-200 dark:border-gray-700 hover:border-primary/30'}`}>
              {/* Image container with quantity badge */}
              <div className="relative aspect-[4/3] mb-1 bg-gradient-to-br from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900 rounded-lg overflow-hidden flex-shrink-0">
                {item.image_url ? <img src={getCachedImageUrl(item.id)} alt={item.name} className="w-full h-full object-cover" onError={e => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                  target.nextElementSibling?.classList.remove('hidden');
                }} /> : null}
                <div className={`${item.image_url ? 'hidden' : ''} w-full h-full flex items-center justify-center text-muted-foreground`}>
                  <Package className="w-8 h-8" />
                </div>

                {/* Low stock badge - shown at top left */}
                {lowStock && (
                  <div className="absolute top-1 left-1 bg-orange-500 text-white text-[11px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                    Low: {formatQuantityWithUnit(item.stock_quantity!, item.unit)}
                  </div>
                )}

                {/* Small rectangle quantity badge - shown when item is in cart */}
                {isInCart && (
                  <div className="absolute bottom-1 right-1 bg-[hsl(var(--qty-badge))] text-white text-[13px] font-bold px-2 py-0.5 rounded shadow-md flex items-center gap-0.5">
                    <span>{formatQuantityWithUnit(cartItem.quantity, item.unit)}</span>
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col min-h-0 px-0.5">
                <h3 className="font-semibold text-sm mb-0.5 line-clamp-1 flex-shrink-0">{item.name}</h3>
                <p className="text-primary mb-1 flex-shrink-0 font-bold text-sm">
                  ₹{item.price.toFixed(2)} / {item.base_value && item.base_value > 1 ? `${item.base_value}${unitLabel}` : unitLabel}
                </p>

                {isInCart ? (
                  <div className="flex items-center justify-center gap-1.5 mt-auto">
                    <Button size="sm" variant="outline" onClick={() => updateQuantity(item.id, -1)} className="h-6 w-6 p-0 rounded-full bg-[hsl(var(--btn-decrement))] text-white border-0 hover:opacity-80">
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="font-bold min-w-[1.5rem] text-center text-base">{cartItem.quantity}</span>
                    <Button size="sm" variant="outline" onClick={() => updateQuantity(item.id, 1)} className="h-6 w-6 p-0 rounded-full bg-[hsl(var(--btn-increment))] text-white border-0 hover:opacity-80">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => addToCart(item)} className="w-full h-9 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground text-xs font-semibold mt-auto rounded-lg shadow-sm">
                    Add
                  </Button>
                )}
              </div>
            </div>;
          })}
        </div> :
          // List View
          <div className="space-y-2">
            {filteredItems.map(item => {
              const cartItem = cart.find(c => c.id === item.id);
              const cachedImageUrl = getCachedImageUrl(item.id);
              const imageUrl = item.image_url || cachedImageUrl;
              if (item.image_url && !cachedImageUrl) {
                cacheImageUrl(item.id, item.image_url);
              }
              return <Card key={item.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {/* Image */}
                      <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                        {imageUrl ? <img src={imageUrl} alt={item.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <Package className="w-6 h-6" />
                        </div>}
                      </div>

                      {/* Name and Price */}
                      <div>
                        <h3 className="font-semibold text-sm">{item.name}</h3>
                        <p className="text-lg font-bold text-primary">₹{item.price}/{item.base_value && item.base_value > 1 ? `${item.base_value}${getShortUnit(item.unit)}` : getShortUnit(item.unit)}</p>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center space-x-2">
                      {cartItem ? <div className="flex items-center space-x-2 bg-primary/10 rounded-full py-1 px-3">
                        <Button variant="ghost" size="sm" onClick={() => updateQuantity(item.id, -1)} className="h-6 w-6 p-0 rounded-full">
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="font-semibold min-w-[20px] text-center">
                          {cartItem.quantity}
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => updateQuantity(item.id, 1)} className="h-6 w-6 p-0 rounded-full">
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div> : <Button onClick={() => addToCart(item)} className="bg-primary hover:bg-primary/90 text-white">
                        Add
                      </Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>;
            })}
          </div>}
      </div>
    </div>

    {/* Desktop Cart Section */}
    <div className="hidden md:flex w-80 bg-card border-l flex-col">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold flex items-center">
            <ShoppingCart className="w-5 h-5 mr-2" />
            Cart ({cart.filter(i => i.quantity > 0).length})
          </h2>
          {cart.some(i => i.quantity > 0) && <Button variant="ghost" size="sm" onClick={clearCart} className="text-red-600 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="w-4 h-4" />
          </Button>}
        </div>

        {cart.some(i => i.quantity > 0) && <div className="flex justify-between items-center text-sm">
          <span>Total: ₹{total.toFixed(0)}</span>
          <Button onClick={() => setPaymentDialogOpen(true)} className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary text-white" size="sm">
            Pay
          </Button>
        </div>}
      </div>

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-4">
        {cart.length === 0 ? <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
            <ShoppingCart className="w-8 h-8 text-gray-400" />
          </div>
          <p className="text-gray-500 font-medium">Your cart is empty</p>
          <p className="text-gray-400 text-sm mt-1">Add items to get started</p>
        </div> : <div className="space-y-3">
          {cart.map(item => <div key={item.id} className="bg-gradient-to-r from-white to-gray-50 dark:from-gray-800 dark:to-gray-700 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 transition-all hover:shadow-md">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-bold text-sm line-clamp-2 flex-1 text-gray-800 dark:text-white">{item.name}</h3>
              <Button variant="ghost" size="sm" onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 ml-2 rounded-full h-8 w-8 p-0">
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="flex justify-between items-center">
              <span className="font-bold text-lg bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">₹{item.price}</span>

              <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-600 rounded-full p-1">
                <Button variant="ghost" size="sm" onClick={() => updateQuantity(item.id, -1)} className="h-8 w-8 p-0 rounded-full bg-[hsl(var(--btn-decrement))] text-white hover:opacity-80 shadow-sm">
                  <Minus className="w-4 h-4" />
                </Button>

                {editingQuantity === item.id ? <div className="flex items-center space-x-1">
                  <Input type="number" value={tempQuantity} onChange={e => setTempQuantity(e.target.value)} className="w-12 h-8 text-center p-0 rounded-lg" autoFocus />
                  <Button variant="ghost" size="sm" onClick={() => saveQuantity(item.id)} className="h-6 w-6 p-0 rounded-full bg-[hsl(var(--btn-increment))] text-white">
                    <Check className="w-3 h-3" />
                  </Button>
                </div> : <span className="font-bold min-w-[40px] text-center cursor-pointer hover:bg-white dark:hover:bg-gray-500 rounded-full px-3 py-1 transition-colors" onClick={() => startEditingQuantity(item.id, item.quantity)}>
                  {item.quantity}
                </span>}

                <Button variant="ghost" size="sm" onClick={() => updateQuantity(item.id, 1)} className="h-8 w-8 p-0 rounded-full bg-[hsl(var(--btn-increment))] text-white hover:opacity-80 shadow-sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="flex justify-end mt-3 pt-2 border-t border-gray-200 dark:border-gray-600">
              <span className="text-sm font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                Total: ₹{((item.quantity / (item.base_value || 1)) * item.price).toFixed(0)}
              </span>
            </div>
          </div>)}
        </div>}
      </div>
    </div>

    {/* Mobile Cart Button - Blue gradient bar above bottom nav */}
    {cart.some(i => i.quantity > 0) && <div className="fixed bottom-20 left-0 right-0 md:hidden z-40 px-3">
      <div className="bg-gradient-to-r from-primary to-primary/80 rounded-xl shadow-2xl px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-white">
            <ShoppingCart className="w-5 h-5" />
            <span className="font-bold text-lg">
              {cart.filter(i => i.quantity > 0).length} {cart.filter(i => i.quantity > 0).length === 1 ? 'item' : 'items'}
            </span>
            <span className="font-bold text-xl">₹{total.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={clearCart} className="h-9 w-9 p-0 text-white hover:bg-white/20 rounded-full">
              <Trash2 className="w-5 h-5" />
            </Button>
            <Button onClick={() => setPaymentDialogOpen(true)} className="h-9 px-5 bg-white text-primary hover:bg-gray-100 font-bold rounded-full shadow-md">
              Pay
            </Button>
          </div>
        </div>
      </div>
    </div>}

    {/* Payment Dialog */}
    <CompletePaymentDialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen} cart={cart} paymentTypes={paymentTypes} additionalCharges={additionalCharges} onUpdateQuantity={updateQuantity} onRemoveItem={removeFromCart} onCompletePayment={handleCompletePayment} />

    {/* Printer Error Dialog */}
    <PrinterErrorDialog
      open={printerErrorOpen}
      onOpenChange={setPrinterErrorOpen}
      errorMessage={printerErrorMessage}
      onRetry={handleRetryPrint}
      onSaveWithoutPrint={handleSaveWithoutPrint}
      isRetrying={isRetryingPrint}
    />
  </div>;
};
export default Billing;