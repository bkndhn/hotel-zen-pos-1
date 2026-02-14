import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Utensils, Phone, MapPin, Wifi, WifiOff, Search, X, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, MessageCircle, ShoppingCart, Plus, Minus, Send, Clock, CheckCircle2, Loader2, ChefHat, Trash2, MessageSquare, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getShortUnit } from '@/utils/timeUtils';

// Types
interface MenuItem {
    id: string;
    name: string;
    price: number;
    image_url?: string;
    video_url?: string;
    media_type?: 'image' | 'gif' | 'video';
    category?: string;
    unit?: string;
    base_value?: number;
    is_active: boolean;
}

interface PromoBanner {
    id: string;
    title: string;
    description?: string;
    image_url: string;
    link_url?: string;
    is_text_only?: boolean;
    text_color?: string;
    bg_color?: string;
}

interface ShopSettings {
    shop_name?: string;
    address?: string;
    contact_number?: string;
    logo_url?: string;
    menu_show_shop_name?: boolean;
    menu_show_address?: boolean;
    menu_show_phone?: boolean;
    // Appearance settings
    menu_primary_color?: string;
    menu_secondary_color?: string;
    menu_background_color?: string;
    menu_text_color?: string;
    menu_items_per_row?: number;
    // Location settings
    shop_latitude?: number;
    shop_longitude?: number;
}


// Table ordering types
interface CartItem {
    id: string;
    name: string;
    price: number;
    quantity: number;
    unit?: string;
    base_value?: number;
    instructions: string;
}

interface TableOrder {
    id: string;
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
    const [banners, setBanners] = useState<PromoBanner[]>([]);
    const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Banner swipe state
    const [touchStart, setTouchStart] = useState<number | null>(null);
    const [touchEnd, setTouchEnd] = useState<number | null>(null);
    const [isPaused, setIsPaused] = useState(false);

    // Collapsible categories state
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

    // ========== TABLE ORDERING STATE (only active when ?table=N) ==========
    const isTableMode = !!tableNo;

    // Session ID: persisted in localStorage so it survives app close/reopen
    const sessionStorageKey = isTableMode ? `table - session - ${urlParam} -${tableNo} ` : null;
    const [sessionId, setSessionId] = useState<string | null>(() => {
        if (!sessionStorageKey) return null;
        return localStorage.getItem(sessionStorageKey) || null;
    });
    const [sessionReady, setSessionReady] = useState(false);

    // Cart
    const [cart, setCart] = useState<CartItem[]>([]);
    const [orderNote, setOrderNote] = useState('');
    const [isPlacingOrder, setIsPlacingOrder] = useState(false);
    const [showCart, setShowCart] = useState(false);
    const [showMyOrders, setShowMyOrders] = useState(false);
    const [instructionItemId, setInstructionItemId] = useState<string | null>(null);

    // Orders for this session
    const [sessionOrders, setSessionOrders] = useState<TableOrder[]>([]);
    const orderChannelRef = useRef<any>(null);

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
                // Fetch items for this admin (including video/media fields)
                const { data: itemsData, error: itemsError } = await supabase
                    .from('items')
                    .select('id, name, price, image_url, video_url, media_type, category, unit, base_value, is_active')
                    .eq('admin_id', adminId)
                    .eq('is_active', true)
                    .order('category')
                    .order('name');

                // Fetch promotional banners
                const { data: bannersData } = await supabase
                    .from('promo_banners')
                    .select('id, title, description, image_url, link_url, is_text_only, text_color, bg_color')
                    .eq('admin_id', adminId)
                    .eq('is_active', true)
                    .order('display_order');

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

                // Fetch shop settings including display preferences and appearance
                const { data: settingsData, error: settingsError } = await supabase
                    .from('shop_settings')
                    .select('shop_name, address, contact_number, logo_url, menu_show_shop_name, menu_show_address, menu_show_phone, menu_primary_color, menu_secondary_color, menu_background_color, menu_text_color, menu_items_per_row, shop_latitude, shop_longitude')
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
                setBanners(bannersData || []);

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
                    filter: `admin_id = eq.${adminId} `
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

    // Auto-swipe banners every 4 seconds (pauses when user interacts)
    useEffect(() => {
        if (banners.length <= 1 || isPaused) return;
        const interval = setInterval(() => {
            setCurrentBannerIndex(prev => (prev + 1) % banners.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [banners.length, isPaused]);

    // Resume auto-swipe after 8 seconds of no interaction
    useEffect(() => {
        if (!isPaused) return;
        const resumeTimer = setTimeout(() => setIsPaused(false), 8000);
        return () => clearTimeout(resumeTimer);
    }, [isPaused]);

    // Touch swipe handlers
    const minSwipeDistance = 50;
    const handleTouchStart = (e: React.TouchEvent) => {
        setTouchEnd(null);
        setTouchStart(e.targetTouches[0].clientX);
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };
    const handleTouchEnd = () => {
        if (!touchStart || !touchEnd) return;
        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;
        if (isLeftSwipe) {
            setCurrentBannerIndex(prev => (prev + 1) % banners.length);
            setIsPaused(true);
        } else if (isRightSwipe) {
            setCurrentBannerIndex(prev => (prev - 1 + banners.length) % banners.length);
            setIsPaused(true);
        }
    };
    const goToPrevBanner = () => {
        setCurrentBannerIndex(prev => (prev - 1 + banners.length) % banners.length);
        setIsPaused(true);
    };
    const goToNextBanner = () => {
        setCurrentBannerIndex(prev => (prev + 1) % banners.length);
        setIsPaused(true);
    };

    // Update status bar color to match public menu theme
    useEffect(() => {
        const originalColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '#db2777';
        const menuColor = shopSettings?.menu_primary_color || '#f97316';

        // Update theme-color meta tag for status bar
        let metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (!metaThemeColor) {
            metaThemeColor = document.createElement('meta');
            metaThemeColor.setAttribute('name', 'theme-color');
            document.head.appendChild(metaThemeColor);
        }
        metaThemeColor.setAttribute('content', menuColor);

        // Restore original color on unmount
        return () => {
            if (metaThemeColor) {
                metaThemeColor.setAttribute('content', originalColor);
            }
        };
    }, [shopSettings?.menu_primary_color]);

    // Item Media component with download protection
    const ItemMedia = ({ item }: { item: MenuItem }) => {
        const mediaUrl = item.media_type === 'video' || item.media_type === 'gif'
            ? item.video_url
            : item.image_url;

        if (!mediaUrl) return null;

        if (item.media_type === 'video') {
            return (
                <video
                    src={mediaUrl}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    autoPlay
                    loop
                    muted
                    playsInline
                    controlsList="nodownload nofullscreen noremoteplayback"
                    disablePictureInPicture
                    onContextMenu={(e) => e.preventDefault()}
                />
            );
        }

        return (
            <img
                src={mediaUrl}
                alt={item.name}
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                loading="lazy"
                onContextMenu={(e) => e.preventDefault()}
                draggable={false}
            />
        );
    };

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

    // Toggle category collapse
    const toggleCategory = useCallback((category: string) => {
        setCollapsedCategories(prev => {
            const next = new Set(prev);
            if (next.has(category)) {
                next.delete(category);
            } else {
                next.add(category);
            }
            return next;
        });
    }, []);

    // ========== TABLE ORDERING FUNCTIONS ==========

    // Cart total
    const cartTotal = useMemo(() => {
        return cart.reduce((sum, item) => {
            const bv = item.base_value || 1;
            return sum + Math.round(((item.quantity / bv) * item.price) * 100) / 100;
        }, 0);
    }, [cart]);

    const cartItemCount = useMemo(() => cart.reduce((sum, item) => sum + (item.quantity / (item.base_value || 1)), 0), [cart]);

    // Add item to cart
    const addToCart = useCallback((item: MenuItem) => {
        const step = item.base_value || 1;
        setCart(prev => {
            const existing = prev.find(c => c.id === item.id);
            if (existing) {
                return prev.map(c => c.id === item.id ? { ...c, quantity: c.quantity + step } : c);
            }
            return [...prev, {
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: step,
                unit: item.unit,
                base_value: item.base_value,
                instructions: ''
            }];
        });
    }, []);

    // Remove item from cart
    const removeFromCart = useCallback((itemId: string) => {
        setCart(prev => prev.filter(c => c.id !== itemId));
    }, []);

    // Update quantity
    const updateQuantity = useCallback((itemId: string, delta: number) => {
        setCart(prev => {
            return prev.map(c => {
                if (c.id !== itemId) return c;
                const step = c.base_value || 1;
                const newQty = c.quantity + (delta * step);
                return newQty <= 0 ? c : { ...c, quantity: newQty };
            }).filter(c => c.quantity > 0);
        });
    }, []);

    // Get cart quantity for an item
    const getCartQuantity = useCallback((itemId: string) => {
        const item = cart.find(c => c.id === itemId);
        if (!item) return 0;
        return item.quantity / (item.base_value || 1);
    }, [cart]);

    // Set instructions for a cart item
    const setItemInstructions = useCallback((itemId: string, instructions: string) => {
        setCart(prev => prev.map(c => c.id === itemId ? { ...c, instructions } : c));
    }, []);

    // Place order
    const placeOrder = useCallback(async () => {
        if (!adminId || !tableNo || !sessionId || cart.length === 0) return;
        setIsPlacingOrder(true);
        try {
            const orderItems = cart.map(c => ({
                item_id: c.id,
                name: c.name,
                price: c.price,
                quantity: c.quantity,
                unit: c.unit || 'pcs',
                base_value: c.base_value || 1,
                instructions: c.instructions || undefined
            }));
            const totalAmount = cartTotal;
            const orderNumber = sessionOrders.length + 1;

            const { data, error: insertError } = await supabase
                .from('table_orders')
                .insert({
                    admin_id: adminId,
                    table_number: tableNo,
                    session_id: sessionId,
                    order_number: orderNumber,
                    items: orderItems,
                    total_amount: totalAmount,
                    customer_note: orderNote || null,
                    status: 'pending'
                })
                .select()
                .single();

            if (insertError) throw insertError;

            // Auto update table status to occupied
            const { error: tableErr } = await supabase
                .from('tables')
                .update({ status: 'occupied' })
                .eq('admin_id', adminId)
                .eq('table_number', tableNo);
            if (tableErr) console.warn('Table status update failed:', tableErr);

            // Broadcast table status change + new order to Kitchen/ServiceArea via shared channel
            // Use single channel instance for both sends to avoid create-remove-create race
            const syncChannel = supabase.channel('table-order-sync');
            await syncChannel.send({
                type: 'broadcast',
                event: 'table-status-updated',
                payload: { table_number: tableNo, status: 'occupied', timestamp: Date.now() }
            });
            await syncChannel.send({
                type: 'broadcast',
                event: 'new-table-order',
                payload: {
                    id: data.id,
                    admin_id: adminId,
                    table_number: tableNo,
                    order_number: orderNumber,
                    items: orderItems,
                    total_amount: totalAmount,
                    customer_note: orderNote || null,
                    status: 'pending',
                    session_id: sessionId,
                    created_at: data.created_at
                }
            });
            supabase.removeChannel(syncChannel);

            // Add to local orders
            setSessionOrders(prev => [...prev, {
                id: data.id,
                order_number: orderNumber,
                items: orderItems,
                total_amount: totalAmount,
                status: 'pending',
                customer_note: orderNote || undefined,
                created_at: data.created_at
            }]);

            // Clear cart
            setCart([]);
            setOrderNote('');
            setShowCart(false);
            setShowMyOrders(true);
        } catch (err) {
            console.error('Order placement error:', err);
            alert('Failed to place order. Please try again.');
        } finally {
            setIsPlacingOrder(false);
        }
    }, [adminId, tableNo, sessionId, cart, cartTotal, orderNote, sessionOrders.length]);

    // Smart session initialization: check for active orders on this table
    useEffect(() => {
        if (!adminId || !isTableMode || !tableNo || !sessionStorageKey) return;

        const initSession = async () => {
            // Step 1: If we have a stored session, check if it still has active orders
            const storedSid = localStorage.getItem(sessionStorageKey);
            if (storedSid) {
                const { data: existingOrders } = await supabase
                    .from('table_orders')
                    .select('id, order_number, items, total_amount, status, customer_note, created_at, is_billed')
                    .eq('admin_id', adminId)
                    .eq('session_id', storedSid)
                    .order('order_number');

                if (existingOrders && existingOrders.length > 0) {
                    // Check if ANY order is still active (not terminal)
                    const hasActive = existingOrders.some(
                        (o: any) => !['served', 'cancelled'].includes(o.status) || !o.is_billed
                    );
                    if (hasActive) {
                        // Resume this session
                        setSessionId(storedSid);
                        setSessionOrders(existingOrders as TableOrder[]);
                        setShowMyOrders(true);
                        setSessionReady(true);
                        return;
                    }
                    // All orders are terminal+billed → clear old session
                    localStorage.removeItem(sessionStorageKey);
                }
            }

            // Step 2: No stored session or old one expired. Check DB for ANY active order on this table.
            const { data: tableActiveOrders } = await supabase
                .from('table_orders')
                .select('session_id, id, order_number, items, total_amount, status, customer_note, created_at, is_billed')
                .eq('admin_id', adminId)
                .eq('table_number', tableNo)
                .in('status', ['pending', 'preparing', 'ready'])
                .eq('is_billed', false)
                .order('created_at', { ascending: false })
                .limit(20);

            if (tableActiveOrders && tableActiveOrders.length > 0) {
                // Adopt the session of the most recent active order
                const adoptSid = (tableActiveOrders[0] as any).session_id;
                localStorage.setItem(sessionStorageKey, adoptSid);
                setSessionId(adoptSid);

                // Fetch all orders for that session
                const { data: allSessionOrders } = await supabase
                    .from('table_orders')
                    .select('id, order_number, items, total_amount, status, customer_note, created_at')
                    .eq('admin_id', adminId)
                    .eq('session_id', adoptSid)
                    .order('order_number');

                if (allSessionOrders) {
                    setSessionOrders(allSessionOrders as TableOrder[]);
                    setShowMyOrders(true);
                }
                setSessionReady(true);
                return;
            }

            // Step 3: No active orders at all → generate new session
            const newSid = crypto.randomUUID();
            localStorage.setItem(sessionStorageKey, newSid);
            setSessionId(newSid);
            setSessionReady(true);
        };

        initSession();
    }, [adminId, isTableMode, tableNo, sessionStorageKey]);

    // Real-time subscription for order status updates
    useEffect(() => {
        if (!adminId || !sessionId || !isTableMode) return;

        // Subscribe to broadcast for instant updates
        const channel = supabase.channel(`table-order-status-${sessionId}`)
            .on('broadcast', { event: 'order-status-update' }, (payload: any) => {
                const { order_id, status } = payload.payload || {};
                if (order_id && status) {
                    setSessionOrders(prev => prev.map(o =>
                        o.id === order_id ? { ...o, status } : o
                    ));
                }
            })
            .subscribe();

        // Also subscribe to postgres_changes as fallback
        const pgChannel = supabase.channel(`table-order-pg-${sessionId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'table_orders',
                    filter: `session_id=eq.${sessionId}`
                },
                (payload: any) => {
                    const updated = payload.new;
                    if (updated) {
                        setSessionOrders(prev => prev.map(o =>
                            o.id === updated.id ? { ...o, status: updated.status } : o
                        ));
                    }
                }
            )
            .subscribe();

        orderChannelRef.current = channel;

        return () => {
            supabase.removeChannel(channel);
            supabase.removeChannel(pgChannel);
        };
    }, [adminId, sessionId, isTableMode]);

    // Status helpers
    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'pending': return <Clock className="w-4 h-4 text-amber-500" />;
            case 'preparing': return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
            case 'ready': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
            case 'served': return <CheckCircle2 className="w-4 h-4 text-gray-400" />;
            case 'cancelled': return <X className="w-4 h-4 text-red-500" />;
            default: return <Clock className="w-4 h-4 text-gray-400" />;
        }
    };
    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'pending': return 'Waiting';
            case 'preparing': return 'Being Prepared 👨‍🍳';
            case 'ready': return 'Ready! 🔔';
            case 'served': return 'Served ✅';
            case 'cancelled': return 'Cancelled';
            default: return status;
        }
    };
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'preparing': return 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse';
            case 'ready': return 'bg-green-100 text-green-700 border-green-200';
            case 'served': return 'bg-gray-100 text-gray-500 border-gray-200';
            case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
            default: return 'bg-gray-100 text-gray-500';
        }
    };

    const sessionTotal = useMemo(() => sessionOrders.reduce((sum, o) => sum + o.total_amount, 0), [sessionOrders]);

    // Check if session is complete (all orders terminal + billed)
    const isSessionComplete = useMemo(() => {
        if (sessionOrders.length === 0) return false;
        return sessionOrders.every(
            o => ['served', 'cancelled'].includes(o.status) && (o as any).is_billed === true
        );
    }, [sessionOrders]);

    // Reset session when complete
    const startNewOrder = useCallback(() => {
        if (!sessionStorageKey) return;
        localStorage.removeItem(sessionStorageKey);
        const newSid = crypto.randomUUID();
        localStorage.setItem(sessionStorageKey, newSid);
        setSessionId(newSid);
        setSessionOrders([]);
        setShowMyOrders(false);
        setCart([]);
        setOrderNote('');
    }, [sessionStorageKey]);

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
        <div
            className="min-h-screen"
            style={{
                background: shopSettings?.menu_background_color
                    ? `linear-gradient(135deg, ${shopSettings.menu_background_color}15 0%, ${shopSettings.menu_background_color}08 50%, ${shopSettings.menu_background_color}15 100%)`
                    : 'linear-gradient(135deg, #fef7ed 0%, #fff7ed 25%, #fefce8 50%, #f0fdf4 75%, #fef7ed 100%)'
            }}
        >
            {/* Header with Shop Name */}
            <header
                className="sticky top-0 z-50 text-white shadow-xl"
                style={{
                    background: shopSettings?.menu_primary_color
                        ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color}cc)`
                        : 'linear-gradient(135deg, #ea580c, #dc2626)'
                }}
            >
                <div className="max-w-2xl mx-auto px-4 py-3.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3.5 flex-1 min-w-0">
                            {shopSettings?.logo_url ? (
                                <img
                                    src={shopSettings.logo_url}
                                    alt="Logo"
                                    className="w-12 h-12 rounded-xl object-cover border-2 border-white/40 flex-shrink-0 shadow-lg"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center flex-shrink-0 border border-white/20">
                                    <Utensils className="w-6 h-6" />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <h1 className="text-xl font-extrabold leading-tight truncate tracking-tight" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
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
                    "sticky z-40 bg-white/95 backdrop-blur-md border-b shadow-sm",
                    showSearch ? "top-[120px]" : "top-[72px]"
                )}
                    style={{ borderColor: shopSettings?.menu_primary_color ? `${shopSettings.menu_primary_color} 20` : '#fed7aa' }}
                >
                    <div className="max-w-2xl mx-auto px-4 py-2.5">
                        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                            <button
                                onClick={() => setSelectedCategory('all')}
                                className={cn(
                                    "flex-shrink-0 rounded-full h-8 px-4 text-xs font-semibold transition-all duration-200 border",
                                    selectedCategory === 'all'
                                        ? "text-white border-transparent shadow-md scale-105"
                                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm"
                                )}
                                style={selectedCategory === 'all' ? {
                                    background: shopSettings?.menu_primary_color
                                        ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})`
                                        : 'linear-gradient(135deg, #ea580c, #dc2626)'
                                } : {}}
                            >
                                All ({items.length})
                            </button>
                            {itemCategories.map(cat => {
                                const count = items.filter(i => i.category === cat).length;
                                return (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={cn(
                                            "flex-shrink-0 rounded-full h-8 px-4 text-xs font-semibold transition-all duration-200 border",
                                            selectedCategory === cat
                                                ? "text-white border-transparent shadow-md scale-105"
                                                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm"
                                        )}
                                        style={selectedCategory === cat ? {
                                            background: shopSettings?.menu_primary_color
                                                ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})`
                                                : 'linear-gradient(135deg, #ea580c, #dc2626)'
                                        } : {}}
                                    >
                                        {cat} ({count})
                                    </button>
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

            {/* Get Directions Bar - Shows when shop location is set */}
            {shopSettings?.shop_latitude && shopSettings?.shop_longitude && (
                <div className="max-w-2xl mx-auto px-4 pt-3">
                    <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${shopSettings.shop_latitude},${shopSettings.shop_longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-green-500 text-white py-2.5 px-4 rounded-xl shadow-md hover:shadow-lg transition-all text-sm font-medium"
                    >
                        <MapPin className="w-4 h-4" />
                        <span>Get Directions to Our Shop</span>
                        <ChevronRight className="w-4 h-4" />
                    </a >
                </div >
            )}

            {/* Promotional Banners Carousel */}
            {
                banners.length > 0 && (
                    <div className="max-w-2xl mx-auto px-4 pt-4">
                        <div className="relative rounded-xl overflow-hidden shadow-lg">
                            <div
                                className="flex transition-transform duration-500 ease-in-out touch-pan-y"
                                style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}
                                onTouchStart={handleTouchStart}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                            >
                                {banners.map((banner) => (
                                    <div
                                        key={banner.id}
                                        className="w-full flex-shrink-0"
                                        onContextMenu={(e) => e.preventDefault()}
                                    >
                                        {banner.is_text_only ? (
                                            // Text-only banner with solid color background
                                            <div
                                                className="relative aspect-[16/7] flex items-center justify-center"
                                                style={{ backgroundColor: banner.bg_color || '#22c55e' }}
                                            >
                                                <div className="text-center px-6">
                                                    <h3
                                                        className="font-bold text-xl md:text-2xl drop-shadow-lg"
                                                        style={{ color: banner.text_color || '#ffffff' }}
                                                    >
                                                        {banner.title}
                                                    </h3>
                                                    {banner.description && (
                                                        <p
                                                            className="text-sm md:text-base mt-1 opacity-90"
                                                            style={{ color: banner.text_color || '#ffffff' }}
                                                        >
                                                            {banner.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            // Image banner
                                            <div className="relative aspect-[16/7] bg-gradient-to-r from-orange-400 to-amber-400">
                                                <img
                                                    src={banner.image_url}
                                                    alt={banner.title}
                                                    className="w-full h-full object-cover"
                                                    draggable={false}
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                                <div className="absolute bottom-0 left-0 right-0 p-3 text-white">
                                                    <h3 className="font-bold text-sm drop-shadow-lg">{banner.title}</h3>
                                                    {banner.description && (
                                                        <p className="text-xs opacity-90 line-clamp-1">{banner.description}</p>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            {banners.length > 1 && (
                                <>
                                    {/* Arrow Navigation */}
                                    <button
                                        onClick={goToPrevBanner}
                                        className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
                                        aria-label="Previous banner"
                                    >
                                        <ChevronLeft className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={goToNextBanner}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/30 hover:bg-black/50 flex items-center justify-center text-white transition-colors"
                                        aria-label="Next banner"
                                    >
                                        <ChevronRight className="w-5 h-5" />
                                    </button>
                                    {/* Dot Indicators */}
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                                        {banners.map((_, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => { setCurrentBannerIndex(idx); setIsPaused(true); }}
                                                className={cn(
                                                    "w-2 h-2 rounded-full transition-all",
                                                    idx === currentBannerIndex
                                                        ? "bg-white w-4"
                                                        : "bg-white/50 hover:bg-white/70"
                                                )}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                )
            }

            {/* Menu Items */}
            <main className="max-w-2xl mx-auto px-4 py-4 pb-36">
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
                    Object.entries(groupedItems).map(([category, categoryItems]) => {
                        const isCollapsed = collapsedCategories.has(category);
                        return (
                            <div key={category} className="mb-8">
                                {/* Clickable category header */}
                                <button
                                    onClick={() => toggleCategory(category)}
                                    className="w-full text-left text-base font-bold mb-3 flex items-center gap-2.5 sticky top-[114px] py-2.5 z-10 cursor-pointer transition-colors"
                                    style={{ color: shopSettings?.menu_primary_color || '#9a3412' }}
                                >
                                    <span className="w-8 h-0.5 rounded-full" style={{ background: `linear-gradient(to right, ${shopSettings?.menu_primary_color || '#ea580c'}, transparent)` }} />
                                    <span className="text-[15px] tracking-tight">{category}</span>
                                    <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: `${shopSettings?.menu_primary_color || '#ea580c'}15`, color: shopSettings?.menu_primary_color || '#ea580c' }}>({categoryItems.length})</span>
                                    <span className="ml-auto pr-2">
                                        {isCollapsed ? (
                                            <ChevronDown className="w-4 h-4" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }} />
                                        ) : (
                                            <ChevronUp className="w-4 h-4" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }} />
                                        )}
                                    </span>
                                </button>

                                {/* Collapsible items section */}
                                <div
                                    className={cn(
                                        "grid gap-3 transition-all duration-300 ease-in-out overflow-hidden",
                                        shopSettings?.menu_items_per_row === 3 ? "grid-cols-3" :
                                            shopSettings?.menu_items_per_row === 2 ? "grid-cols-2" :
                                                "grid-cols-1",
                                        isCollapsed ? "max-h-0 opacity-0" : "max-h-[5000px] opacity-100"
                                    )}
                                >
                                    {categoryItems.map(item => (
                                        <div
                                            key={item.id}
                                            className={cn(
                                                "bg-white rounded-2xl shadow-sm border hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 overflow-hidden group",
                                                shopSettings?.menu_items_per_row === 1 ? "flex items-center p-3.5 gap-3.5" : "flex flex-col"
                                            )}
                                            style={{ borderColor: shopSettings?.menu_primary_color ? `${shopSettings.menu_primary_color}15` : '#ffedd5' }}
                                        >
                                            {/* Image - larger for multi-column, side for single */}
                                            {shopSettings?.menu_items_per_row === 1 ? (
                                                // Single column: horizontal layout
                                                <>
                                                    <ItemMedia item={item} />
                                                    <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                                                        <h3 className="font-semibold text-gray-900 text-sm leading-tight">
                                                            {item.name}
                                                        </h3>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <span className="text-base font-bold" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                ₹{item.price}
                                                                <span className="text-xs font-medium text-gray-400 ml-0.5">
                                                                    /{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}
                                                                </span>
                                                            </span>
                                                            {isTableMode && (
                                                                getCartQuantity(item.id) > 0 ? (
                                                                    <div className="flex items-center gap-1">
                                                                        <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                                                                            <Minus className="w-3.5 h-3.5" />
                                                                        </button>
                                                                        <span className="text-sm font-bold w-5 text-center">{getCartQuantity(item.id)}</span>
                                                                        <button onClick={() => addToCart(item)} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                            <Plus className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button onClick={() => addToCart(item)} className="px-3 py-1.5 rounded-full text-white text-xs font-semibold shadow-sm" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                        ADD
                                                                    </button>
                                                                )
                                                            )}
                                                        </div>
                                                    </div>
                                                </>
                                            ) : (
                                                // Multi-column: vertical card with large image on top
                                                <>
                                                    <div className="aspect-square bg-orange-50 relative overflow-hidden">
                                                        {item.video_url || item.media_type === 'gif' || item.media_type === 'video' ? (
                                                            item.media_type === 'gif' ? (
                                                                <img
                                                                    src={item.video_url || item.image_url}
                                                                    alt={item.name}
                                                                    className="w-full h-full object-cover"
                                                                    loading="lazy"
                                                                    draggable={false}
                                                                    onContextMenu={(e) => e.preventDefault()}
                                                                />
                                                            ) : (
                                                                <video
                                                                    src={item.video_url}
                                                                    className="w-full h-full object-cover"
                                                                    autoPlay
                                                                    loop
                                                                    muted
                                                                    playsInline
                                                                />
                                                            )
                                                        ) : item.image_url ? (
                                                            <img
                                                                src={item.image_url}
                                                                alt={item.name}
                                                                className="w-full h-full object-cover"
                                                                loading="lazy"
                                                                draggable={false}
                                                                onContextMenu={(e) => e.preventDefault()}
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-orange-300">
                                                                <Utensils className="w-12 h-12" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-2.5 text-center">
                                                        <h3 className={cn(
                                                            "font-semibold text-gray-800 leading-tight line-clamp-2",
                                                            shopSettings?.menu_items_per_row === 3 ? "text-xs" : "text-sm"
                                                        )}>
                                                            {item.name}
                                                        </h3>
                                                        <div className="mt-1.5 flex items-center justify-center gap-2">
                                                            <span
                                                                className={cn(
                                                                    "font-extrabold",
                                                                    shopSettings?.menu_items_per_row === 3 ? "text-sm" : "text-base"
                                                                )}
                                                                style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}
                                                            >
                                                                ₹{item.price}
                                                                <span className="text-[10px] font-medium text-gray-400 ml-0.5">
                                                                    /{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}
                                                                </span>
                                                            </span>
                                                        </div>
                                                        {isTableMode && (
                                                            <div className="mt-2">
                                                                {getCartQuantity(item.id) > 0 ? (
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <button onClick={() => updateQuantity(item.id, -1)} className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">
                                                                            <Minus className="w-3 h-3" />
                                                                        </button>
                                                                        <span className="text-xs font-bold w-5 text-center">{getCartQuantity(item.id)}</span>
                                                                        <button onClick={() => addToCart(item)} className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                            <Plus className="w-3 h-3" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button onClick={() => addToCart(item)} className={cn(
                                                                        "px-3 py-1 rounded-full text-white font-semibold shadow-sm",
                                                                        shopSettings?.menu_items_per_row === 3 ? "text-[10px]" : "text-xs"
                                                                    )} style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                                        ADD
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}
            </main>

            {/* ========== TABLE ORDERING UI ========== */}

            {/* My Orders Section (when table mode + has orders) */}
            {
                isTableMode && sessionOrders.length > 0 && showMyOrders && (
                    <div className="max-w-2xl mx-auto px-4 pb-4">
                        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
                            <button
                                onClick={() => setShowMyOrders(!showMyOrders)}
                                className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50"
                            >
                                <div className="flex items-center gap-2">
                                    <ChefHat className="w-5 h-5 text-blue-600" />
                                    <span className="font-bold text-blue-900">Your Orders — Table {tableNo}</span>
                                    <Badge className="bg-blue-100 text-blue-700 text-xs">{sessionOrders.length}</Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-blue-700">₹{sessionTotal.toFixed(0)}</span>
                                    <ChevronUp className="w-4 h-4 text-blue-500" />
                                </div>
                            </button>

                            <div className="divide-y divide-gray-50">
                                {sessionOrders.map(order => (
                                    <div key={order.id} className="p-4">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="font-semibold text-gray-800 text-sm">Order #{order.order_number}</span>
                                            <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", getStatusColor(order.status))}>
                                                {getStatusIcon(order.status)}
                                                <span>{getStatusLabel(order.status)}</span>
                                            </div>
                                        </div>
                                        {order.items.map((item: any, idx: number) => (
                                            <div key={idx} className="flex justify-between text-sm text-gray-600 py-0.5">
                                                <div>
                                                    <span>{item.name} ×{item.quantity}</span>
                                                    {item.instructions && (
                                                        <p className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                                                            <MessageSquare className="w-3 h-3" /> {item.instructions}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="font-medium">₹{((item.quantity / (item.base_value || 1)) * item.price).toFixed(0)}</span>
                                            </div>
                                        ))}
                                        {order.customer_note && (
                                            <p className="text-xs text-gray-400 mt-1 italic">Note: {order.customer_note}</p>
                                        )}
                                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-100">
                                            <span className="text-xs text-gray-400">
                                                {new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="font-bold text-sm" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>₹{order.total_amount.toFixed(0)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Cart Overlay */}
            {
                isTableMode && showCart && cart.length > 0 && (
                    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end" onClick={() => setShowCart(false)}>
                        <div className="w-full max-w-2xl mx-auto bg-white rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between p-4 border-b">
                                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                    <ShoppingCart className="w-5 h-5" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }} />
                                    Your Cart
                                </h2>
                                <button onClick={() => setShowCart(false)} className="p-1 rounded-full hover:bg-gray-100">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                {cart.map(item => (
                                    <div key={item.id} className="bg-gray-50 rounded-xl p-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-semibold text-sm text-gray-800 truncate">{item.name}</h4>
                                                <span className="text-xs text-gray-500">₹{item.price}/{item.base_value && item.base_value > 1 ? item.base_value : ''}{getShortUnit(item.unit)}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => updateQuantity(item.id, -1)} className="w-7 h-7 rounded-full bg-white border flex items-center justify-center hover:bg-gray-100">
                                                    <Minus className="w-3.5 h-3.5" />
                                                </button>
                                                <span className="text-sm font-bold w-5 text-center">{item.quantity / (item.base_value || 1)}</span>
                                                <button onClick={() => updateQuantity(item.id, 1)} className="w-7 h-7 rounded-full flex items-center justify-center text-white" style={{ background: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                    <Plus className="w-3.5 h-3.5" />
                                                </button>
                                                <button onClick={() => removeFromCart(item.id)} className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center hover:bg-red-100">
                                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                                </button>
                                            </div>
                                        </div>
                                        {/* Per-item instructions */}
                                        <div className="mt-2">
                                            {instructionItemId === item.id ? (
                                                <div className="flex gap-1">
                                                    <Input
                                                        placeholder="e.g. Extra spicy, no onion..."
                                                        value={item.instructions}
                                                        onChange={e => setItemInstructions(item.id, e.target.value)}
                                                        className="h-8 text-xs"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => setInstructionItemId(null)} className="px-2 py-1 text-xs rounded bg-gray-200 hover:bg-gray-300">
                                                        Done
                                                    </button>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setInstructionItemId(item.id)}
                                                    className="text-xs text-amber-600 flex items-center gap-1 hover:text-amber-700"
                                                >
                                                    <MessageSquare className="w-3 h-3" />
                                                    {item.instructions || 'Add instructions'}
                                                </button>
                                            )}
                                        </div>
                                        <div className="text-right mt-1">
                                            <span className="font-bold text-sm" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>
                                                ₹{((item.quantity / (item.base_value || 1)) * item.price).toFixed(0)}
                                            </span>
                                        </div>
                                    </div>
                                ))}

                                {/* General order note */}
                                <div className="pt-2">
                                    <label className="text-xs font-medium text-gray-500 mb-1 block">Note for kitchen (optional)</label>
                                    <Input
                                        placeholder="Any general instructions..."
                                        value={orderNote}
                                        onChange={e => setOrderNote(e.target.value)}
                                        className="h-9 text-sm"
                                    />
                                </div>
                            </div>

                            {/* Cart summary + Place Order */}
                            <div className="p-4 border-t bg-white">
                                <div className="flex justify-between items-center mb-3">
                                    <span className="text-sm text-gray-600">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''}</span>
                                    <span className="text-lg font-bold" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>₹{cartTotal.toFixed(0)}</span>
                                </div>
                                <Button
                                    onClick={placeOrder}
                                    disabled={isPlacingOrder || cart.length === 0}
                                    className="w-full h-12 text-base font-bold rounded-xl text-white"
                                    style={{ background: shopSettings?.menu_primary_color ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})` : 'linear-gradient(135deg, #ea580c, #dc2626)' }}
                                >
                                    {isPlacingOrder ? (
                                        <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Placing Order...</>
                                    ) : (
                                        <><Send className="w-5 h-5 mr-2" /> Place Order ₹{cartTotal.toFixed(0)}</>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Floating Cart Bar (when table mode + items in cart) */}
            {
                isTableMode && cartItemCount > 0 && !showCart && (
                    <div className="fixed bottom-[76px] left-0 right-0 z-50 px-4">
                        <button
                            onClick={() => setShowCart(true)}
                            className="w-full max-w-2xl mx-auto flex items-center justify-between px-5 py-3.5 rounded-2xl shadow-xl text-white transition-transform active:scale-[0.98]"
                            style={{ background: shopSettings?.menu_primary_color ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color})` : 'linear-gradient(135deg, #ea580c, #dc2626)' }}
                        >
                            <div className="flex items-center gap-3">
                                <div className="relative">
                                    <ShoppingCart className="w-5 h-5" />
                                    <span className="absolute -top-2 -right-2 bg-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center" style={{ color: shopSettings?.menu_primary_color || '#ea580c' }}>
                                        {cartItemCount}
                                    </span>
                                </div>
                                <span className="font-semibold">{cartItemCount} item{cartItemCount !== 1 ? 's' : ''} in cart</span>
                            </div>
                            <span className="font-bold text-lg">₹{cartTotal.toFixed(0)} →</span>
                        </button>
                    </div>
                )
            }

            {/* My Orders Toggle Button (table mode, no cart) */}
            {
                isTableMode && sessionOrders.length > 0 && cartItemCount === 0 && !showMyOrders && !isSessionComplete && (
                    <div className="fixed bottom-[76px] left-0 right-0 z-50 px-4">
                        <button
                            onClick={() => setShowMyOrders(true)}
                            className="w-full max-w-2xl mx-auto flex items-center justify-between px-5 py-3 rounded-2xl shadow-lg bg-blue-600 text-white"
                        >
                            <div className="flex items-center gap-2">
                                <ChefHat className="w-5 h-5" />
                                <span className="font-semibold">My Orders ({sessionOrders.length})</span>
                            </div>
                            <span className="font-bold">₹{sessionTotal.toFixed(0)}</span>
                        </button>
                    </div>
                )
            }

            {/* Session Complete — Start New Order */}
            {
                isTableMode && isSessionComplete && (
                    <div className="fixed bottom-[76px] left-0 right-0 z-50 px-4">
                        <div className="w-full max-w-2xl mx-auto bg-green-50 border border-green-200 rounded-2xl shadow-lg p-4 text-center">
                            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                            <p className="text-green-800 font-semibold text-sm mb-1">All orders completed & paid!</p>
                            <p className="text-green-600 text-xs mb-3">Thank you for dining with us 🙏</p>
                            <button
                                onClick={startNewOrder}
                                className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm shadow hover:bg-green-700 transition-colors"
                            >
                                <RefreshCw className="w-4 h-4" />
                                Start New Order
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Footer with Contact Info */}
            <footer
                className="fixed bottom-0 left-0 right-0 text-white py-2 shadow-2xl backdrop-blur-sm"
                style={{
                    background: shopSettings?.menu_primary_color
                        ? `linear-gradient(135deg, ${shopSettings.menu_primary_color}ee, ${shopSettings.menu_secondary_color || shopSettings.menu_primary_color}dd)`
                        : 'linear-gradient(135deg, #ea580cee, #dc2626dd)'
                }}
            >
                <div className="max-w-2xl mx-auto px-4">
                    {(showPhone || showAddress) && (
                        <div className="flex items-center justify-center gap-3 text-xs">
                            {showPhone && shopSettings?.contact_number && (
                                <div className="flex items-center gap-2">
                                    {/* Call Button */}
                                    <a
                                        href={`tel:${shopSettings.contact_number}`}
                                        className="flex items-center justify-center w-9 h-9 bg-white/15 hover:bg-white/25 rounded-xl transition-all duration-200 backdrop-blur-sm border border-white/20 hover:scale-105"
                                        aria-label="Call us"
                                    >
                                        <Phone className="w-4 h-4" />
                                    </a>
                                    {/* WhatsApp Button - Official Logo */}
                                    <a
                                        href={`https://wa.me/${shopSettings.contact_number.replace(/[^0-9]/g, '')}?text=Hi! I visited your restaurant and have a query.`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center justify-center w-9 h-9 bg-[#25D366] hover:bg-[#20BD5A] rounded-xl transition-all duration-200 border border-[#25D366]/40 hover:scale-105 shadow-md"
                                        aria-label="WhatsApp us"
                                    >
                                        <svg viewBox="0 0 32 32" className="w-5 h-5" fill="white">
                                            <path d="M16.004 0h-.008C7.174 0 0 7.176 0 16c0 3.5 1.132 6.744 3.054 9.378L1.054 31.29l6.166-1.964C9.79 30.988 12.79 32 16.004 32 24.826 32 32 24.822 32 16S24.826 0 16.004 0zm9.31 22.608c-.39 1.1-1.932 2.014-3.166 2.28-.846.18-1.95.322-5.668-1.218-4.762-1.97-7.824-6.8-8.062-7.114-.228-.314-1.918-2.554-1.918-4.872s1.214-3.456 1.644-3.928c.43-.472.94-.59 1.254-.59.312 0 .626.002.9.016.288.016.676-.11 1.058.808.39.94 1.328 3.242 1.446 3.476.118.234.196.508.04.82-.158.314-.236.508-.47.784-.236.274-.496.614-.708.824-.236.234-.482.49-.208.962.274.47 1.22 2.014 2.62 3.264 1.8 1.606 3.316 2.104 3.786 2.338.472.234.748.196 1.022-.118.274-.314 1.176-1.372 1.49-1.844.314-.47.626-.39 1.058-.234.43.156 2.736 1.292 3.206 1.526.47.234.784.352.9.548.118.196.118 1.138-.27 2.238z" />
                                        </svg>
                                    </a>
                                </div>
                            )}
                            {showAddress && shopSettings?.address && (
                                <a
                                    href={shopSettings.shop_latitude && shopSettings.shop_longitude
                                        ? `https://www.google.com/maps?q=${shopSettings.shop_latitude},${shopSettings.shop_longitude}`
                                        : `https://www.google.com/maps/search/${encodeURIComponent(shopSettings.address)}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1 text-white/90 hover:text-white transition-colors"
                                >
                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate max-w-[180px] text-[10px]">{shopSettings.address}</span>
                                </a>
                            )}
                        </div>
                    )}
                    <p className={cn(
                        "text-center text-[7px] text-white/25 tracking-wider uppercase",
                        (showPhone || showAddress) ? "mt-1" : ""
                    )}>
                        Powered by ZenPOS
                    </p>
                </div>
            </footer>
        </div >
    );
};

export default PublicMenu;
