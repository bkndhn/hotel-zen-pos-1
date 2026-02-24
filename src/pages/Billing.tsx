import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranchFilter } from '@/hooks/useBranchFilter';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { ShoppingCart, Plus, Minus, Search, Grid, List, X, Trash2, Edit2, Check, Package, ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { CompletePaymentDialog } from '@/components/CompletePaymentDialog';
import { PrinterErrorDialog } from '@/components/PrinterErrorDialog';
import { TableSelector } from '@/components/TableSelector';
import { getCachedImageUrl, cacheImageUrl } from '@/utils/imageUtils';
import { getInstantBillNumber, initBillCounter } from '@/utils/billNumberGenerator';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { printReceipt, PrintData } from '@/utils/bluetoothPrinter';
import { printBrowserReceipt } from '@/utils/browserPrinter';
import { format } from 'date-fns';
import { getShortUnit, formatQuantityWithUnit, isWeightOrVolumeUnit } from '@/utils/timeUtils';

const Billing: React.FC = () => {
  const { user } = useAuth();
  const { branchId } = useBranchFilter();
  const location = useLocation();
  const navigate = useNavigate();

  const [products, setProducts] = useState<any[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<any[]>([]);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [isCompletePaymentOpen, setIsCompletePaymentOpen] = useState(false);
  const [isPrinterErrorOpen, setIsPrinterErrorOpen] = useState(false);
  const [printerErrorMessage, setPrinterErrorMessage] = useState('');
  const [billNumber, setBillNumber] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const cartRef = useRef(cartItems);
  cartRef.current = cartItems;

  // Initialize bill counter on mount
  useEffect(() => {
    initBillCounter(branchId);
  }, [branchId]);

  // Fetch products from Supabase
  const fetchProducts = useCallback(async () => {
    if (!branchId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('branch_id', branchId)
        .order('name', { ascending: true });
      if (error) throw error;
      if (data) {
        setProducts(data);
        setFilteredProducts(data);
        // Cache images for faster loading
        data.forEach(product => {
          if (product.image_url) {
            cacheImageUrl(product.image_url);
          }
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Failed to load products',
        description: (error as Error).message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Filter products based on search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredProducts(products);
      return;
    }
    const lowerSearch = searchTerm.toLowerCase();
    setFilteredProducts(
      products.filter(product =>
        product.name.toLowerCase().includes(lowerSearch) ||
        product.code?.toLowerCase().includes(lowerSearch)
      )
    );
  }, [searchTerm, products]);

  // Add product to cart
  const addToCart = (product: any) => {
    setCartItems(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  // Remove product from cart
  const removeFromCart = (productId: string) => {
    setCartItems(prev => prev.filter(item => item.product.id !== productId));
  };

  // Update quantity in cart
  const updateQuantity = (productId: string, quantity: number) => {
    if (quantity < 1) return;
    setCartItems(prev =>
      prev.map(item =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  // Clear cart
  const clearCart = () => {
    setCartItems([]);
  };

  // Calculate total price
  const totalPrice = cartItems.reduce(
    (acc, item) => acc + item.product.price * item.quantity,
    0
  );

  // Generate new bill number
  const generateBillNumber = async () => {
    if (!branchId) return;
    const newBillNumber = await getInstantBillNumber(branchId);
    setBillNumber(newBillNumber);
  };

  // Handle complete payment
  const handleCompletePayment = async () => {
    if (!user || !branchId) {
      toast({
        variant: 'destructive',
        title: 'User or branch not found',
      });
      return;
    }
    if (!selectedTable) {
      toast({
        variant: 'destructive',
        title: 'Please select a table',
      });
      return;
    }
    if (cartItems.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Cart is empty',
      });
      return;
    }
    setIsCompletePaymentOpen(true);
  };

  // Confirm payment and save to database
  const confirmPayment = async () => {
    if (!user || !branchId || !selectedTable) return;
    setIsCompletePaymentOpen(false);
    setIsLoading(true);
    try {
      const newBillNumber = await getInstantBillNumber(branchId);
      setBillNumber(newBillNumber);

      const billData = {
        branch_id: branchId,
        user_id: user.id,
        table: selectedTable,
        bill_number: newBillNumber,
        items: cartItems.map(item => ({
          product_id: item.product.id,
          quantity: item.quantity,
          price: item.product.price,
        })),
        total: totalPrice,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase.from('bills').insert([billData]);
      if (error) throw error;

      // Print receipt
      const printData: PrintData = {
        billNumber: newBillNumber,
        table: selectedTable,
        items: cartItems,
        total: totalPrice,
        date: new Date(),
      };

      try {
        await printReceipt(printData);
      } catch (printError) {
        // Fallback to browser print
        try {
          printBrowserReceipt(printData);
        } catch (browserPrintError) {
          setPrinterErrorMessage('Failed to print receipt.');
          setIsPrinterErrorOpen(true);
        }
      }

      toast({
        title: 'Payment completed',
        description: `Bill #${newBillNumber} has been saved.`,
      });

      clearCart();
      setSelectedTable(null);
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

  // Real-time updates for products and bills
  useRealTimeUpdates(branchId, () => {
    fetchProducts();
  });

  return (
    <div className="billing-page container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>Billing</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Search products..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                icon={<Search />}
              />
              <div className="flex justify-end my-2 gap-2">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'outline'}
                  onClick={() => setViewMode('grid')}
                  aria-label="Grid view"
                >
                  <Grid size={16} />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'default' : 'outline'}
                  onClick={() => setViewMode('list')}
                  aria-label="List view"
                >
                  <List size={16} />
                </Button>
              </div>
              <div
                className={`products-list grid ${
                  viewMode === 'grid' ? 'grid-cols-2 md:grid-cols-4 gap-4' : ''
                }`}
              >
                {filteredProducts.map(product => (
                  <div
                    key={product.id}
                    className={`product-item border rounded p-2 cursor-pointer flex ${
                      viewMode === 'list' ? 'items-center gap-4' : 'flex-col'
                    }`}
                    onClick={() => addToCart(product)}
                  >
                    {product.image_url ? (
                      <img
                        src={getCachedImageUrl(product.image_url)}
                        alt={product.name}
                        className={`product-image ${
                          viewMode === 'list' ? 'w-16 h-16' : 'w-full h-32 object-cover'
                        }`}
                      />
                    ) : (
                      <div className="w-full h-32 bg-gray-200 flex items-center justify-center">
                        <Package size={32} />
                      </div>
                    )}
                    <div className="product-info mt-2">
                      <div className="font-semibold">{product.name}</div>
                      <div className="text-sm text-gray-600">
                        {product.code && <Badge variant="secondary">{product.code}</Badge>}
                      </div>
                      <div className="text-lg font-bold mt-1">${product.price.toFixed(2)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="cart flex-1 border rounded p-4 flex flex-col">
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
                  <div className="text-center text-gray-500">No items in cart</div>
                )}
                {cartItems.map(item => (
                  <div
                    key={item.product.id}
                    className="cart-item flex items-center justify-between gap-2 border-b py-2"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      {item.product.image_url ? (
                        <img
                          src={getCachedImageUrl(item.product.image_url)}
                          alt={item.product.name}
                          className="w-12 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-12 h-12 bg-gray-200 flex items-center justify-center rounded">
                          <Package size={20} />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold">{item.product.name}</div>
                        <div className="text-sm text-gray-600">
                          {item.product.code && <Badge variant="secondary">{item.product.code}</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity - 1)
                        }
                        aria-label={`Decrease quantity of ${item.product.name}`}
                      >
                        <Minus size={16} />
                      </Button>
                      <div className="w-8 text-center">{item.quantity}</div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateQuantity(item.product.id, item.quantity + 1)
                        }
                        aria-label={`Increase quantity of ${item.product.name}`}
                      >
                        <Plus size={16} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromCart(item.product.id)}
                        aria-label={`Remove ${item.product.name} from cart`}
                      >
                        <X size={16} />
                      </Button>
                    </div>
                    <div className="w-20 text-right font-semibold">
                      ${(item.product.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <TableSelector
                  selectedTable={selectedTable}
                  onSelectTable={setSelectedTable}
                />
              </div>
              <div className="mt-4 flex justify-between items-center">
                <div className="text-lg font-bold">Total: ${totalPrice.toFixed(2)}</div>
                <Button
                  onClick={handleCompletePayment}
                  disabled={cartItems.length === 0 || !selectedTable || isLoading}
                >
                  Complete Payment
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <CompletePaymentDialog
        open={isCompletePaymentOpen}
        onClose={() => setIsCompletePaymentOpen(false)}
        onConfirm={confirmPayment}
        billNumber={billNumber}
        total={totalPrice}
        table={selectedTable}
        items={cartItems}
      />

      <PrinterErrorDialog
        open={isPrinterErrorOpen}
        onClose={() => setIsPrinterErrorOpen(false)}
        message={printerErrorMessage}
      />
    </div>
  );
};

export default Billing;
