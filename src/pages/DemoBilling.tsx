import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { 
  ShoppingCart, Search, Plus, Minus, Trash2, Receipt, 
  ArrowLeft, BarChart3, ChefHat, X 
} from 'lucide-react';

// Sample data
const DEMO_CATEGORIES = ['All', 'Breakfast', 'Lunch', 'Snacks', 'Beverages', 'Desserts'];

const DEMO_ITEMS = [
  { id: '1', name: 'Idli (2 pcs)', price: 30, category: 'Breakfast' },
  { id: '2', name: 'Dosa', price: 50, category: 'Breakfast' },
  { id: '3', name: 'Vada (2 pcs)', price: 30, category: 'Breakfast' },
  { id: '4', name: 'Pongal', price: 50, category: 'Breakfast' },
  { id: '5', name: 'Poori Set', price: 60, category: 'Breakfast' },
  { id: '6', name: 'Meals (Veg)', price: 100, category: 'Lunch' },
  { id: '7', name: 'Chicken Biryani', price: 180, category: 'Lunch' },
  { id: '8', name: 'Mutton Biryani', price: 220, category: 'Lunch' },
  { id: '9', name: 'Chapati (2 pcs)', price: 40, category: 'Lunch' },
  { id: '10', name: 'Parotta (2 pcs)', price: 50, category: 'Lunch' },
  { id: '11', name: 'Chicken 65', price: 150, category: 'Snacks' },
  { id: '12', name: 'Gobi Manchurian', price: 100, category: 'Snacks' },
  { id: '13', name: 'Samosa (2 pcs)', price: 30, category: 'Snacks' },
  { id: '14', name: 'Bajji Plate', price: 40, category: 'Snacks' },
  { id: '15', name: 'Tea', price: 15, category: 'Beverages' },
  { id: '16', name: 'Coffee', price: 20, category: 'Beverages' },
  { id: '17', name: 'Fresh Juice', price: 50, category: 'Beverages' },
  { id: '18', name: 'Lassi', price: 40, category: 'Beverages' },
  { id: '19', name: 'Gulab Jamun (2)', price: 40, category: 'Desserts' },
  { id: '20', name: 'Ice Cream', price: 50, category: 'Desserts' },
];

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

const DemoBilling: React.FC = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [billCount, setBillCount] = useState(1);

  useEffect(() => {
    const isDemo = localStorage.getItem('hotel_pos_demo_mode');
    if (isDemo !== 'true') {
      navigate('/landing');
    }
  }, [navigate]);

  const filteredItems = useMemo(() => {
    return DEMO_ITEMS.filter(item => {
      const matchesCategory = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, selectedCategory]);

  const addToCart = (item: typeof DEMO_ITEMS[0]) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) {
        return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + 1 } : c);
      }
      return [...prev, { id: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.id === id) {
        const newQty = c.quantity + delta;
        return newQty <= 0 ? c : { ...c, quantity: newQty };
      }
      return c;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(c => c.id !== id));
  };

  const total = cart.reduce((sum, c) => sum + c.price * c.quantity, 0);

  const handleBill = () => {
    if (cart.length === 0) return;
    toast({
      title: `Demo Bill #${billCount} Created!`,
      description: `Total: ₹${total} • ${cart.length} items • This is a demo — no data is saved.`,
    });
    setBillCount(prev => prev + 1);
    setCart([]);
  };

  const exitDemo = () => {
    localStorage.removeItem('hotel_pos_demo_mode');
    navigate('/landing');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Demo Header */}
      <div className="bg-warning/10 border-b border-warning/30 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-warning text-warning-foreground bg-warning/20 text-xs">
            DEMO MODE
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Sample data — nothing is saved
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={exitDemo} className="text-xs h-7">
          <X className="h-3 w-3 mr-1" /> Exit Demo
        </Button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Items Panel */}
        <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-hidden">
          {/* Search & Categories */}
          <div className="mb-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
              {DEMO_CATEGORIES.map(cat => (
                <Button
                  key={cat}
                  variant={selectedCategory === cat ? 'default' : 'outline'}
                  size="sm"
                  className="shrink-0 text-xs h-7"
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>

          {/* Items Grid */}
          <div className="flex-1 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 content-start">
            {filteredItems.map(item => {
              const inCart = cart.find(c => c.id === item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className={`relative p-3 rounded-lg border text-left transition-all hover:border-primary/50 hover:shadow-sm ${
                    inCart ? 'border-primary bg-primary/5' : 'border-border'
                  }`}
                >
                  {inCart && (
                    <Badge className="absolute -top-1.5 -right-1.5 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                      {inCart.quantity}
                    </Badge>
                  )}
                  <p className="font-medium text-sm truncate">{item.name}</p>
                  <p className="text-primary font-bold text-sm mt-1">₹{item.price}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Cart Panel */}
        <div className="lg:w-80 xl:w-96 border-t lg:border-t-0 lg:border-l border-border flex flex-col bg-card">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> Cart
            </h3>
            <span className="text-sm text-muted-foreground">{cart.length} items</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[30vh] lg:max-h-none">
            {cart.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                Tap items to add to cart
              </p>
            ) : (
              cart.map(item => (
                <div key={item.id} className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">₹{item.price} × {item.quantity}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, -1)}>
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="text-sm w-6 text-center font-medium">{item.quantity}</span>
                    <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, 1)}>
                      <Plus className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => removeFromCart(item.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-border space-y-3">
            <div className="flex justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">₹{total}</span>
            </div>
            <Button className="w-full" size="lg" disabled={cart.length === 0} onClick={handleBill}>
              <Receipt className="mr-2 h-4 w-4" /> Create Bill (Demo)
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DemoBilling;
