import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { Package, Search, Plus, GripVertical } from 'lucide-react';
import { AddItemDialog } from '@/components/AddItemDialog';
import { EditItemDialog } from '@/components/EditItemDialog';
import { ItemCategoryManagement } from '@/components/ItemCategoryManagement';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';
import { getShortUnit, formatQuantityWithUnit } from '@/utils/timeUtils';

interface Item {
  id: string;
  name: string;
  price: number;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  image_url?: string;
  description?: string;
  purchase_rate?: number;
  unit?: string;
  base_value?: number;
  stock_quantity?: number;
  minimum_stock_alert?: number;
  quantity_step?: number;
  display_order?: number;
}

const Items: React.FC = () => {
  const { profile } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState<string[]>([]);
  const [isReordering, setIsReordering] = useState(false);

  // Drag and drop refs
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  // Enable real-time updates
  useRealTimeUpdates();

  useEffect(() => {
    fetchItems();
    fetchCategories();
  }, []);

  // Listen for real-time update events
  useEffect(() => {
    const handleItemsUpdated = () => {
      console.log('Items updated event received, refreshing...');
      fetchItems();
    };

    const handleCategoriesUpdated = () => {
      console.log('Categories updated event received, refreshing...');
      fetchCategories();
    };

    window.addEventListener('items-updated', handleItemsUpdated);
    window.addEventListener('categories-updated', handleCategoriesUpdated);

    return () => {
      window.removeEventListener('items-updated', handleItemsUpdated);
      window.removeEventListener('categories-updated', handleCategoriesUpdated);
    };
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, selectedCategory, items]);

  const fetchItems = async () => {
    try {
      // Try with display_order first, fallback to name only if column doesn't exist
      let query = supabase.from('items').select('*');

      const { data, error } = await query.order('name');

      if (error) throw error;

      // Sort by display_order client-side if the field exists
      const sortedData = (data || []).sort((a: any, b: any) => {
        const orderA = a.display_order ?? 9999;
        const orderB = b.display_order ?? 9999;
        if (orderA !== orderB) return orderA - orderB;
        return (a.name || '').localeCompare(b.name || '');
      });

      setItems(sortedData);
    } catch (error) {
      console.error('Error fetching items:', error);
      toast({
        title: "Error",
        description: "Failed to fetch items",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Drag handlers
  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = async () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }

    setIsReordering(true);
    const itemsCopy = [...activeItems];
    const draggedItem = itemsCopy[dragItem.current];
    itemsCopy.splice(dragItem.current, 1);
    itemsCopy.splice(dragOverItem.current, 0, draggedItem);

    // Update display_order for all reordered items
    const updates = itemsCopy.map((item, idx) => ({
      id: item.id,
      display_order: idx + 1
    }));

    try {
      for (const update of updates) {
        const { error } = await supabase
          .from('items')
          .update({ display_order: update.display_order } as any)
          .eq('id', update.id);
        if (error) throw error;
      }

      toast({
        title: "Order Updated",
        description: "Item order saved successfully",
      });
      fetchItems();
    } catch (error) {
      console.error('Error updating order:', error);
      toast({
        title: "Error",
        description: "Failed to update item order",
        variant: "destructive",
      });
    } finally {
      setIsReordering(false);
      dragItem.current = null;
      dragOverItem.current = null;
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('item_categories')
        .select('name')
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      setCategories((data || []).map(cat => cat.name));
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const applyFilters = () => {
    let filtered = items;

    // Search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.name.toLowerCase().includes(searchLower) ||
        (item.category && item.category.toLowerCase().includes(searchLower)) ||
        item.price.toString().includes(searchTerm)
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }

    setFilteredItems(filtered);
  };

  const handleItemAdded = () => {
    fetchItems();
  };

  const handleCategoriesUpdated = () => {
    fetchCategories();
  };

  const activeItems = filteredItems.filter(item => item.is_active);
  const inactiveItems = filteredItems.filter(item => !item.is_active);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading items...</p>
        </div>
      </div>
    );
  }

  const getCategoryCount = (category: string) => {
    return items.filter(item => item.category === category).length;
  };

  // Helper to check if item has low stock based on minimum_stock_alert
  const isLowStock = (item: Item) => {
    if (item.stock_quantity === null || item.stock_quantity === undefined) return false;
    if (item.minimum_stock_alert === null || item.minimum_stock_alert === undefined) return false;
    return item.stock_quantity <= item.minimum_stock_alert;
  };

  return (
    <div className="p-3 sm:p-4 max-w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-gradient-to-br from-primary to-primary/80 rounded-xl flex items-center justify-center shadow-md shadow-primary/20">
            <Package className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">Items</h1>
            <p className="text-muted-foreground text-[10px] sm:text-xs">Manage your menu items</p>
          </div>
        </div>
        <div className="flex gap-2">
          {profile?.role === 'admin' && (
            <>
              <ItemCategoryManagement onCategoriesUpdated={handleCategoriesUpdated} />
              <AddItemDialog onItemAdded={handleItemAdded} existingItems={items} />
            </>
          )}
        </div>
      </div>

      {/* Search and Filter */}
      <Card className="mb-4 bg-card/80 backdrop-blur-sm border-border/50">
        <CardContent className="p-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 h-10 text-sm rounded-xl border-border/50 bg-background/80"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <Button
              variant={selectedCategory === 'all' ? "default" : "outline"}
              onClick={() => setSelectedCategory('all')}
              size="sm"
              className="h-9 text-sm rounded-lg px-4 flex-shrink-0"
            >
              All ({items.length})
            </Button>
            {categories.map(category => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
                size="sm"
                className="h-9 text-sm rounded-lg px-4 flex-shrink-0 whitespace-nowrap"
              >
                {category} ({getCategoryCount(category)})
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Items Tabs */}
      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-9 mb-4">
          <TabsTrigger value="active" className="text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
            Active ({activeItems.length})
          </TabsTrigger>
          <TabsTrigger value="inactive" className="text-xs flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full"></span>
            Inactive ({inactiveItems.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="mt-0">
          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              {activeItems.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-1">No Active Items</h3>
                  <p className="text-xs text-muted-foreground">
                    {searchTerm || selectedCategory !== 'all' ? 'No items match your search.' : 'Add items to get started.'}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                  {activeItems.map((item, index) => (
                    <Card
                      key={item.id}
                      draggable={profile?.role === 'admin'}
                      onDragStart={() => handleDragStart(index)}
                      onDragEnter={() => handleDragEnter(index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className={`overflow-hidden hover:shadow-md transition-all ${isLowStock(item) ? 'border-2 border-orange-500 dark:border-orange-400' : 'border-muted'} ${profile?.role === 'admin' ? 'cursor-grab active:cursor-grabbing' : ''} ${isReordering ? 'opacity-50' : ''}`}
                    >
                      <div className="flex flex-col h-full">
                        {profile?.role === 'admin' && (
                          <div className="bg-muted/50 py-1 px-2 flex items-center justify-center gap-1 text-muted-foreground text-[10px]">
                            <GripVertical className="w-3 h-3" />
                            <span>Drag to reorder</span>
                          </div>
                        )}
                        {item.image_url && (
                          <div className="w-full aspect-[4/3] overflow-hidden bg-muted/20 relative">
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-cover pointer-events-none"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                            />
                            {isLowStock(item) && (
                              <Badge className="absolute top-1 right-1 bg-orange-500 text-white text-[9px] px-1.5 py-0.5">
                                Low Stock
                              </Badge>
                            )}
                          </div>
                        )}

                        <div className="p-2 sm:p-3 flex flex-col flex-1 gap-1.5">
                          <div>
                            <h4 className="font-semibold text-sm leading-tight line-clamp-1" title={item.name}>{item.name}</h4>
                            <div className="flex justify-between items-start mt-0.5">
                              <Badge variant="outline" className="text-[10px] h-4 px-1 rounded bg-muted/50 font-normal">
                                {item.category || 'No Cat'}
                              </Badge>
                            </div>
                          </div>

                          <div className="mt-auto pt-1 flex items-end justify-between">
                            <div>
                              <span className="font-bold text-base text-primary block leading-none">
                                ₹{item.price.toFixed(0)}
                                <span className="text-base text-primary">
                                  /{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}
                                </span>
                              </span>
                              {item.stock_quantity !== null && item.stock_quantity !== undefined && (
                                <span className={`text-[10px] ${isLowStock(item) ? 'text-orange-500 font-semibold' : 'text-muted-foreground'}`}>
                                  Stk: {formatQuantityWithUnit(item.stock_quantity, item.unit)}
                                </span>
                              )}
                            </div>

                            {profile?.role === 'admin' && (
                              <EditItemDialog item={item} onItemUpdated={handleItemAdded} />
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inactive" className="mt-0">
          <Card className="border-0 shadow-none">
            <CardContent className="p-0">
              {inactiveItems.length === 0 ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-1">No Inactive Items</h3>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-4">
                  {inactiveItems.map((item) => (
                    <Card key={item.id} className="overflow-hidden hover:shadow-md transition-shadow border-muted bg-muted/30">
                      <div className="flex flex-col h-full opacity-75">
                        {item.image_url && (
                          <div className="w-full aspect-[4/3] overflow-hidden bg-muted/20 grayscale">
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          </div>
                        )}

                        <div className="p-2 sm:p-3 flex flex-col flex-1 gap-1.5">
                          <div>
                            <h4 className="font-semibold text-sm leading-tight line-clamp-1">{item.name}</h4>
                            <Badge variant="outline" className="text-[10px] h-4 px-1 rounded bg-muted/50 font-normal mt-1">
                              {item.category || 'No Cat'}
                            </Badge>
                          </div>

                          <div className="mt-auto pt-1 flex items-end justify-between">
                            <span className="font-bold text-base text-muted-foreground block leading-none">
                              ₹{item.price.toFixed(0)}
                              <span className="text-base">
                                /{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}
                              </span>
                            </span>
                            {profile?.role === 'admin' && (
                              <EditItemDialog item={item} onItemUpdated={handleItemAdded} />
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Items;
