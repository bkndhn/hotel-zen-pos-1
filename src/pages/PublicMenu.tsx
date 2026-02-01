import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Utensils, Phone, MapPin, Wifi, WifiOff, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// Types
interface MenuItem {
    id: string;
    name: string;
    price: number;
    image_url?: string;
    category?: string;
    unit?: string;
    is_active: boolean;
}

interface ShopSettings {
    shop_name?: string;
    address?: string;
    contact_number?: string;
    logo_url?: string;
    menu_show_shop_name?: boolean;
    menu_show_address?: boolean;
    menu_show_phone?: boolean;
}



interface ItemCategory {
    id: string;
    name: string;
}

/**
 * Public Menu Page
 * Accessible at /menu/:adminId (UUID) or /menu/:slug (custom URL)
 * Optional query param: ?table=5
 * No authentication required - public read-only
 * 
 * Features:
 * - Shop name displayed prominently (if enabled)
 * - Search functionality
 * - Category filters
 * - Real-time updates when items become unavailable
 * - Custom URL slug support
 */
const PublicMenu = () => {
    const { adminId: urlParam } = useParams<{ adminId: string }>();
    const [searchParams] = useSearchParams();
    const tableNo = searchParams.get('table');

    const [adminId, setAdminId] = useState<string | null>(null);
    const [items, setItems] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<ItemCategory[]>([]);
    const [shopSettings, setShopSettings] = useState<ShopSettings | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Online/Offline detection
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Resolve slug or UUID to admin ID
    useEffect(() => {
        const resolveAdminId = async () => {
            if (!urlParam) {
                setError('Invalid menu link');
                setLoading(false);
                return;
            }

            // Check if it's a UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            if (uuidRegex.test(urlParam)) {
                // It's a UUID, use directly
                setAdminId(urlParam);
            } else {
                // It's a slug, look up the admin ID
                try {
                    const { data, error: slugError } = await supabase
                        .from('shop_settings')
                        .select('user_id')
                        .eq('menu_slug', urlParam)
                        .maybeSingle();

                    if (slugError && slugError.code !== 'PGRST116') {
                        console.error('Slug lookup error:', slugError);
                    }

                    if (data?.user_id) {
                        // Now get the profile.id from user_id
                        const { data: profileData, error: profileError } = await supabase
                            .from('profiles')
                            .select('id')
                            .eq('user_id', data.user_id)
                            .maybeSingle();

                        if (profileError) {
                            console.error('Profile lookup error:', profileError);
                        }

                        if (profileData?.id) {
                            setAdminId(profileData.id);
                        } else {
                            setError('Menu not found');
                            setLoading(false);
                            return;
                        }
                    } else {
                        setError('Menu not found');
                        setLoading(false);
                        return;
                    }
                } catch (err) {
                    console.error('Error resolving slug:', err);
                    setError('Failed to load menu');
                    setLoading(false);
                    return;
                }
            }
        };

        resolveAdminId();
    }, [urlParam]);

    // Fetch menu data once adminId is resolved
    useEffect(() => {
        if (!adminId) return;

        const fetchMenuData = async () => {
            try {
                // Fetch items for this admin
                const { data: itemsData, error: itemsError } = await supabase
                    .from('items')
                    .select('id, name, price, image_url, category, unit, is_active')
                    .eq('admin_id', adminId)
                    .eq('is_active', true)
                    .order('category')
                    .order('name');

                if (itemsError) {
                    console.error('Items fetch error:', itemsError);
                }

                // Fetch profile to get user_id for shop_settings
                const { data: profileData, error: profileError } = await supabase
                    .from('profiles')
                    .select('user_id')
                    .eq('id', adminId)
                    .maybeSingle();

                if (profileError) {
                    console.error('Profile fetch error:', profileError);
                }

                const userId = profileData?.user_id || adminId;

                // Fetch shop settings including display preferences
                const { data: settingsData, error: settingsError } = await supabase
                    .from('shop_settings')
                    .select('shop_name, address, contact_number, logo_url, menu_show_shop_name, menu_show_address, menu_show_phone')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (settingsError && settingsError.code !== 'PGRST116') {
                    console.error('Settings error:', settingsError);
                }

                // Fetch categories
                const { data: categoriesData, error: categoriesError } = await supabase
                    .from('item_categories')
                    .select('id, name')
                    .eq('admin_id', adminId)
                    .eq('is_deleted', false)
                    .order('name');

                if (categoriesError) {
                    console.error('Categories error:', categoriesError);
                }

                setItems(itemsData || []);
                setShopSettings(settingsData as ShopSettings | null);
                setCategories(categoriesData || []);

                if (!itemsData?.length && itemsError) {
                    setError('Failed to load menu. Please try again.');
                } else {
                    setError(null);
                }
            } catch (err) {
                console.error('Error fetching menu:', err);
                setError('Failed to load menu. Please try again.');
            } finally {
                setLoading(false);
            }
        };

        fetchMenuData();
    }, [adminId]);

    // Real-time subscription for item updates
    useEffect(() => {
        if (!adminId) return;

        const channel = supabase
            .channel(`public-menu-${adminId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'items',
                    filter: `admin_id=eq.${adminId}`
                },
                (payload) => {
                    console.log('Menu item update:', payload);

                    if (payload.eventType === 'UPDATE') {
                        const updatedItem = payload.new as MenuItem;

                        if (!updatedItem.is_active) {
                            setItems(prev => prev.filter(item => item.id !== updatedItem.id));
                        } else {
                            setItems(prev => prev.map(item =>
                                item.id === updatedItem.id ? updatedItem : item
                            ));
                        }
                    } else if (payload.eventType === 'INSERT') {
                        const newItem = payload.new as MenuItem;
                        if (newItem.is_active) {
                            setItems(prev => [...prev, newItem].sort((a, b) =>
                                (a.category || '').localeCompare(b.category || '') ||
                                a.name.localeCompare(b.name)
                            ));
                        }
                    } else if (payload.eventType === 'DELETE') {
                        const deletedItem = payload.old as MenuItem;
                        setItems(prev => prev.filter(item => item.id !== deletedItem.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [adminId]);

    // Get unique categories from items
    const itemCategories = useMemo(() => {
        const cats = new Set<string>();
        items.forEach(item => {
            if (item.category) cats.add(item.category);
        });
        return Array.from(cats).sort();
    }, [items]);

    // Filter items by category AND search query
    const filteredItems = useMemo(() => {
        let result = items;

        if (selectedCategory !== 'all') {
            result = result.filter(item => item.category === selectedCategory);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            result = result.filter(item =>
                item.name.toLowerCase().includes(query) ||
                (item.category && item.category.toLowerCase().includes(query))
            );
        }

        return result;
    }, [items, selectedCategory, searchQuery]);

    // Group items by category
    const groupedItems = useMemo(() => {
        const groups: Record<string, MenuItem[]> = {};
        filteredItems.forEach(item => {
            const cat = item.category || 'Other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(item);
        });
        return groups;
    }, [filteredItems]);

    // Clear search
    const clearSearch = useCallback(() => {
        setSearchQuery('');
        setShowSearch(false);
    }, []);

    // Determine what to show based on settings
    const showShopName = shopSettings?.menu_show_shop_name !== false;
    const showAddress = shopSettings?.menu_show_address !== false;
    const showPhone = shopSettings?.menu_show_phone !== false;
    const headerTitle = showShopName && shopSettings?.shop_name ? shopSettings.shop_name : 'Our Menu';

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4" />
                    <p className="text-orange-700">Loading menu...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <Utensils className="w-16 h-16 mx-auto mb-4 text-red-400" />
                    <h1 className="text-2xl font-bold text-red-700 mb-2">Menu Unavailable</h1>
                    <p className="text-red-600">{error}</p>
                </div>
            </div>
        );
    }

    if (items.length === 0 && !searchQuery) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <Utensils className="w-16 h-16 mx-auto mb-4 text-orange-400" />
                    <h1 className="text-2xl font-bold text-orange-700 mb-2">
                        {headerTitle}
                    </h1>
                    <p className="text-orange-600">Menu is being updated. Please check back soon!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50">
            {/* Header with Shop Name */}
            <header className="sticky top-0 z-50 bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-lg">
                <div className="max-w-2xl mx-auto px-4 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            {shopSettings?.logo_url ? (
                                <img
                                    src={shopSettings.logo_url}
                                    alt="Logo"
                                    className="w-11 h-11 rounded-full object-cover border-2 border-white/30 flex-shrink-0"
                                />
                            ) : (
                                <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                                    <Utensils className="w-5 h-5" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <h1 className="text-lg font-bold leading-tight truncate">
                                    {headerTitle}
                                </h1>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            {tableNo && (
                                <Badge className="bg-white/20 text-white border-white/30 text-xs">
                                    T{tableNo}
                                </Badge>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-9 w-9 text-white hover:bg-white/20"
                                onClick={() => setShowSearch(!showSearch)}
                            >
                                <Search className="w-5 h-5" />
                            </Button>
                            {isOnline ? (
                                <Wifi className="w-4 h-4 text-white/70" />
                            ) : (
                                <WifiOff className="w-4 h-4 text-red-300" />
                            )}
                        </div>
                    </div>

                    {/* Search Bar */}
                    {showSearch && (
                        <div className="mt-3 flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-orange-400" />
                                <Input
                                    type="text"
                                    placeholder="Search items..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-9 pr-9 bg-white/95 border-0 text-gray-800 placeholder:text-gray-400"
                                    autoFocus
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-white hover:bg-white/20"
                                onClick={clearSearch}
                            >
                                Cancel
                            </Button>
                        </div>
                    )}
                </div>
            </header>

            {/* Category Filter */}
            {itemCategories.length > 0 && (
                <div className={cn(
                    "sticky z-40 bg-white/90 backdrop-blur-sm border-b border-orange-100 shadow-sm",
                    showSearch ? "top-[120px]" : "top-[68px]"
                )}>
                    <div className="max-w-2xl mx-auto px-4 py-2">
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                            <Button
                                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setSelectedCategory('all')}
                                className={cn(
                                    "flex-shrink-0 rounded-full h-8 text-xs",
                                    selectedCategory === 'all' && "bg-orange-500 hover:bg-orange-600"
                                )}
                            >
                                All ({items.length})
                            </Button>
                            {itemCategories.map(cat => {
                                const count = items.filter(i => i.category === cat).length;
                                return (
                                    <Button
                                        key={cat}
                                        variant={selectedCategory === cat ? 'default' : 'outline'}
                                        size="sm"
                                        onClick={() => setSelectedCategory(cat)}
                                        className={cn(
                                            "flex-shrink-0 rounded-full h-8 text-xs",
                                            selectedCategory === cat && "bg-orange-500 hover:bg-orange-600"
                                        )}
                                    >
                                        {cat} ({count})
                                    </Button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Search Results Info */}
            {searchQuery && (
                <div className="max-w-2xl mx-auto px-4 pt-4">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-orange-700">
                            {filteredItems.length} result{filteredItems.length !== 1 ? 's' : ''} for "{searchQuery}"
                        </span>
                        <button
                            onClick={() => setSearchQuery('')}
                            className="text-orange-500 hover:text-orange-700 underline text-xs"
                        >
                            Clear search
                        </button>
                    </div>
                </div>
            )}

            {/* Menu Items */}
            <main className="max-w-2xl mx-auto px-4 py-4 pb-28">
                {filteredItems.length === 0 ? (
                    <div className="text-center py-12">
                        <Search className="w-12 h-12 mx-auto mb-4 text-orange-300" />
                        <p className="text-orange-600">No items found for "{searchQuery}"</p>
                        <button
                            onClick={() => setSearchQuery('')}
                            className="mt-2 text-orange-500 hover:text-orange-700 underline text-sm"
                        >
                            Show all items
                        </button>
                    </div>
                ) : (
                    Object.entries(groupedItems).map(([category, categoryItems]) => (
                        <div key={category} className="mb-6">
                            <h2 className="text-base font-bold text-orange-800 mb-2 flex items-center gap-2 sticky top-[110px] bg-gradient-to-r from-orange-50 to-transparent py-1 z-10">
                                <span className="w-6 h-0.5 bg-orange-300 rounded-full" />
                                {category}
                                <span className="text-xs font-normal text-orange-500">({categoryItems.length})</span>
                            </h2>
                            <div className="grid gap-2">
                                {categoryItems.map(item => (
                                    <div
                                        key={item.id}
                                        className="bg-white rounded-xl p-3 shadow-sm border border-orange-100 hover:shadow-md transition-all duration-200"
                                    >
                                        <div className="flex gap-3">
                                            {item.image_url && (
                                                <img
                                                    src={item.image_url}
                                                    alt={item.name}
                                                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                                                    loading="lazy"
                                                />
                                            )}
                                            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                                <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                                                    {item.name}
                                                </h3>
                                                <div className="flex-shrink-0 text-right">
                                                    <span className="text-base font-bold text-orange-600">
                                                        ₹{item.price}
                                                    </span>
                                                    {item.unit && (
                                                        <span className="block text-[10px] text-gray-500">
                                                            /{item.unit}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </main>

            {/* Footer with Contact Info */}
            <footer className="fixed bottom-0 left-0 right-0 bg-gradient-to-r from-orange-600 to-amber-600 text-white py-3 shadow-lg">
                <div className="max-w-2xl mx-auto px-4">
                    {(showPhone || showAddress) && (
                        <div className="flex flex-wrap items-center justify-center gap-3 text-xs">
                            {showPhone && shopSettings?.contact_number && (
                                <a
                                    href={`tel:${shopSettings.contact_number}`}
                                    className="flex items-center gap-1 hover:underline"
                                >
                                    <Phone className="w-3.5 h-3.5" />
                                    {shopSettings.contact_number}
                                </a>
                            )}
                            {showAddress && shopSettings?.address && (
                                <span className="flex items-center gap-1 text-white/80">
                                    <MapPin className="w-3.5 h-3.5" />
                                    <span className="truncate max-w-[180px]">{shopSettings.address}</span>
                                </span>
                            )}
                        </div>
                    )}
                    <p className={cn(
                        "text-center text-[9px] text-white/40",
                        (showPhone || showAddress) && "mt-1.5"
                    )}>
                        Powered by Hotel Zen POS
                    </p>
                </div>
            </footer>
        </div>
    );
};

export default PublicMenu;
