import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { ShoppingCart, Plus, Minus, Search, Grid, List, X, Trash2, Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TableSelector } from '@/components/TableSelector';
import { getCachedImageUrl, cacheImageUrl } from '@/utils/imageUtils';
import { getInstantBillNumber, initBillCounter } from '@/utils/billNumberGenerator';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { printReceipt, PrintData } from '@/utils/bluetoothPrinter';
import { printBrowserReceipt } from '@/utils/browserPrinter';
import { getShortUnit, formatQuantityWithUnit, isWeightOrVolumeUnit } from '@/utils/timeUtils';

const Billing: React.FC = () => {
  const { user } = useAuth();
  const { branchId } = useBranchFilter();
  const location = useLocation();
  const navigate = useNavigate();

  const [items, setItems] = useState<any[]>([]);
  const [filteredItems, setFilteredItems] = useState<any[]>([]);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [selectedTableNumber, setSelectedTableNumber] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const cartRef = useRef(cartItems);
  cartRef.current = cartItems;

  // Real-time updates
  useRealTimeUpdates();

  // Initialize bill counter on mount
  useEffect(() => {
    if (branchId) initBillCounter(branchId);
  }, [branchId]);

  // Fetch items from Supabase
  const fetchItems = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    try {
      let query = supabase
        .from('items')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      const { data, error } = await query;
      if (error) throw error;
      if (data) {
        setItems(data);
        setFilteredItems(data);
        data.forEach(item => {
          if (item.image_url) {
            cacheImageUrl(item.id, item.image_url);
          }
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to load items',
        description: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  // Filter items based on search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredItems(items);
      return;
    }
    const lowerSearch = searchTerm.toLowerCase();
    setFilteredItems(
      items.filter(item =>
        item.name.toLowerCase().includes(lowerSearch) ||
        item.category?.toLowerCase().includes(lowerSearch)
      )
    );
  }, [searchTerm, items]);

  // Add item to cart
  const addToCart = (item: any) => {
    setCartItems(prev => {
      const existing = prev.find(ci => ci.id === item.id);
      if (existing) {
        return prev.map(ci =>
          ci.id === item.id
            ? { ...ci, quantity: ci.quantity + 1 }
            : ci
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  // Remove item from cart
  const removeFromCart = (itemId: string) => {
    setCartItems(prev => prev.filter(ci => ci.id !== itemId));
  };

  // Update quantity in cart
  const updateQuantity = (itemId: string, quantity: number) => {
    if (quantity < 1) return;
    setCartItems(prev =>
      prev.map(ci =>
        ci.id === itemId ? { ...ci, quantity } : ci
      )
    );
  };

  // Clear cart
  const clearCart = () => {
    setCartItems([]);
  };

  // Calculate total price
  const totalPrice = cartItems.reduce(
    (acc: number, ci: any) => acc + ci.price * ci.quantity,
    0
  );

  // Handle complete payment
  const handleCompletePayment = async () => {
    if (!user || !branchId) {
      toast({ variant: 'destructive', title: 'User or branch not found' });
      return;
    }
    if (!selectedTableId) {
      toast({ variant: 'destructive', title: 'Please select a table' });
      return;
    }
    if (cartItems.length === 0) {
      toast({ variant: 'destructive', title: 'Cart is empty' });
      return;
    }

    setIsLoading(true);
    try {
      const newBillNumber = await getInstantBillNumber(branchId);

      const { error } = await supabase.from('bills').insert([{
        branch_id: branchId,
        created_by: user.id,
        bill_no: newBillNumber,
        payment_mode: 'cash' as const,
        total_amount: totalPrice,
        table_no: selectedTableNumber,
      }]);
      if (error) throw error;

      toast({
        title: 'Payment completed',
        description: `Bill #${newBillNumber} has been saved.`,
      });

      clearCart();
      setSelectedTableId(null);
      setSelectedTableNumber(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to complete payment',
        description: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="billing-page container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search items..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="flex justify-end my-2 gap-2">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                  size="sm"
                >
                  <Grid size={16} />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                  size="sm"
                >
                  <List size={16} />
                </Button>
              </div>
              <div
                className={`items-list grid ${
                  viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-4 gap-4' : 'gap-2'
                }`}
              >
                {filteredItems.map(item => (
                  <div
                    key={item.id}
                    className={`item-card border rounded-lg p-2 cursor-pointer flex ${
                      viewMode === 'list' ? 'items-center gap-4' : 'flex-col'
                    } hover:border-primary transition-colors`}
                    onClick={() => addToCart(item)}
                  >
                    {item.image_url ? (
                      <img
                        src={getCachedImageUrl(item.id) || item.image_url}
                        alt={item.name}
                        className={`rounded ${
                          viewMode === 'list' ? 'w-16 h-16 object-cover' : 'w-full h-32 object-cover'
                        }`}
                      />
                    ) : (
                      <div className={`bg-muted flex items-center justify-center rounded ${
                        viewMode === 'list' ? 'w-16 h-16' : 'w-full h-32'
                      }`}>
                        <Package size={32} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="mt-2">
                      <div className="font-semibold text-sm">{item.name}</div>
                      {item.category && (
                        <Badge variant="secondary" className="text-xs mt-1">{item.category}</Badge>
                      )}
                      <div className="text-lg font-bold mt-1">₹{item.price.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cart flex-1 border rounded-lg p-4 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <ShoppingCart size={20} /> Cart
                </h2>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={clearCart}
                  disabled={cartItems.length === 0}
                  aria-label="Clear cart"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
              <div className="cart-items flex-1 overflow-auto">
                {cartItems.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">No items in cart</div>
                )}
                {cartItems.map(ci => (
                  <div
                    key={ci.id}
                    className="cart-item flex items-center justify-between gap-2 border-b py-2"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      {ci.image_url ? (
                        <img
                          src={getCachedImageUrl(ci.id) || ci.image_url}
                          alt={ci.name}
                          className="w-10 h-10 object-cover rounded"
                        />
                      ) : (
                        <div className="w-10 h-10 bg-muted flex items-center justify-center rounded">
                          <Package size={16} />
                        </div>
                      )}
                      <div className="truncate">
                        <div className="font-medium text-sm truncate">{ci.name}</div>
                        <div className="text-xs text-muted-foreground">₹{ci.price.toFixed(2)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => updateQuantity(ci.id, ci.quantity - 1)}
                      >
                        <Minus size={14} />
                      </Button>
                      <div className="w-8 text-center text-sm">{ci.quantity}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => updateQuantity(ci.id, ci.quantity + 1)}
                      >
                        <Plus size={14} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => removeFromCart(ci.id)}
                      >
                        <X size={14} />
                      </Button>
                    </div>
                    <div className="w-16 text-right font-semibold text-sm">
                      ₹{(ci.price * ci.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <TableSelector
                  selectedTableId={selectedTableId}
                  onSelectTable={(tableId, tableNumber) => {
                    setSelectedTableId(tableId);
                    setSelectedTableNumber(tableNumber);
                  }}
                />
              </div>
              <div className="mt-4 flex justify-between items-center">
                <div className="text-lg font-bold">Total: ₹{totalPrice.toFixed(2)}</div>
                <Button
                  onClick={handleCompletePayment}
                  disabled={cartItems.length === 0 || !selectedTableId || isLoading}
                >
                  Complete Payment
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Billing;
