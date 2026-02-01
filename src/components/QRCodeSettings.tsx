import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import {
    QrCode,
    Copy,
    Download,
    Share2,
    ExternalLink,
    Table2,
    Printer,
    Check,
    Link2,
    Eye,
    AlertCircle,
    Store,
    MapPin,
    Phone,
    Palette,
    LayoutGrid
} from 'lucide-react';
import { PromoBannerManager } from '@/components/PromoBannerManager';

// Simple QR Code generator using a public API
const generateQRCodeUrl = (text: string, size: number = 300): string => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=10`;
};

const QRCodeSettings = () => {
    const { profile } = useAuth();
    const [copied, setCopied] = useState(false);
    const [tableMode, setTableMode] = useState(false);
    const [tableCount, setTableCount] = useState(10);
    const [tableCountInput, setTableCountInput] = useState('10');
    const [selectedTable, setSelectedTable] = useState<number | null>(null);
    const qrRef = useRef<HTMLImageElement>(null);

    // Custom URL State
    const [menuSlug, setMenuSlug] = useState('');
    const [slugStatus, setSlugStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
    const slugTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Menu Display Options
    const [menuShowShopName, setMenuShowShopName] = useState(true);
    const [menuShowAddress, setMenuShowAddress] = useState(true);
    const [menuShowPhone, setMenuShowPhone] = useState(true);

    // Menu Appearance Options
    const [menuPrimaryColor, setMenuPrimaryColor] = useState('#f97316');
    const [menuSecondaryColor, setMenuSecondaryColor] = useState('#ea580c');
    const [menuBackgroundColor, setMenuBackgroundColor] = useState('#fffbeb');
    const [menuTextColor, setMenuTextColor] = useState('#1c1917');
    const [menuItemsPerRow, setMenuItemsPerRow] = useState(1);

    // Determine the admin ID to use for the menu URL
    const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

    // Base menu URL (uses custom slug if available, otherwise admin ID)
    const baseUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/menu/${menuSlug || adminId}`
        : '';

    // Current QR URL (with optional table)
    const currentQrUrl = selectedTable
        ? `${baseUrl}?table=${selectedTable}`
        : baseUrl;

    // Load settings from localStorage and Supabase
    useEffect(() => {
        const loadSettings = async () => {
            // First load from localStorage for instant display
            const saved = localStorage.getItem('hotel_pos_bill_header');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    if (parsed.menuSlug) setMenuSlug(parsed.menuSlug);
                    if (parsed.menuShowShopName !== undefined) setMenuShowShopName(parsed.menuShowShopName);
                    if (parsed.menuShowAddress !== undefined) setMenuShowAddress(parsed.menuShowAddress);
                    if (parsed.menuShowPhone !== undefined) setMenuShowPhone(parsed.menuShowPhone);
                } catch (e) { /* ignore */ }
            }

            // Then sync from Supabase
            if (profile?.user_id) {
                const { data } = await supabase
                    .from('shop_settings')
                    .select('menu_slug, menu_show_shop_name, menu_show_address, menu_show_phone, menu_primary_color, menu_secondary_color, menu_background_color, menu_text_color, menu_items_per_row')
                    .eq('user_id', profile.user_id)
                    .maybeSingle();

                if (data) {
                    if (data.menu_slug) setMenuSlug(data.menu_slug);
                    if (data.menu_show_shop_name !== undefined) setMenuShowShopName(data.menu_show_shop_name);
                    if (data.menu_show_address !== undefined) setMenuShowAddress(data.menu_show_address);
                    if (data.menu_show_phone !== undefined) setMenuShowPhone(data.menu_show_phone);
                    // Appearance settings
                    if (data.menu_primary_color) setMenuPrimaryColor(data.menu_primary_color);
                    if (data.menu_secondary_color) setMenuSecondaryColor(data.menu_secondary_color);
                    if (data.menu_background_color) setMenuBackgroundColor(data.menu_background_color);
                    if (data.menu_text_color) setMenuTextColor(data.menu_text_color);
                    if (data.menu_items_per_row) setMenuItemsPerRow(data.menu_items_per_row);
                }
            }
        };
        loadSettings();
    }, [profile?.user_id]);

    // Save settings when changed
    const saveSettings = async () => {
        // Save to localStorage immediately
        const saved = localStorage.getItem('hotel_pos_bill_header');
        const parsed = saved ? JSON.parse(saved) : {};
        parsed.menuSlug = menuSlug;
        parsed.menuShowShopName = menuShowShopName;
        parsed.menuShowAddress = menuShowAddress;
        parsed.menuShowPhone = menuShowPhone;
        localStorage.setItem('hotel_pos_bill_header', JSON.stringify(parsed));

        // Sync to Supabase
        if (profile?.user_id) {
            await supabase
                .from('shop_settings')
                .upsert({
                    user_id: profile.user_id,
                    menu_slug: menuSlug || null,
                    menu_show_shop_name: menuShowShopName,
                    menu_show_address: menuShowAddress,
                    menu_show_phone: menuShowPhone,
                    menu_primary_color: menuPrimaryColor,
                    menu_secondary_color: menuSecondaryColor,
                    menu_background_color: menuBackgroundColor,
                    menu_text_color: menuTextColor,
                    menu_items_per_row: menuItemsPerRow,
                }, { onConflict: 'user_id' });
        }
    };

    // Debounced slug availability check
    const checkSlugAvailability = async (slug: string) => {
        if (!slug || slug.length < 2) {
            setSlugStatus('idle');
            return;
        }

        setSlugStatus('checking');

        try {
            const { data, error } = await supabase
                .from('shop_settings')
                .select('user_id')
                .eq('menu_slug', slug)
                .neq('user_id', profile?.user_id || '')
                .maybeSingle();

            if (error) throw error;

            if (data) {
                setSlugStatus('taken');
            } else {
                setSlugStatus('available');
            }
        } catch (err) {
            console.error('Error checking slug:', err);
            setSlugStatus('idle');
        }
    };

    const handleSlugChange = (value: string) => {
        // Sanitize slug: lowercase, no spaces, alphanumeric and hyphens only
        const sanitized = value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
        setMenuSlug(sanitized);

        // Debounce the availability check
        if (slugTimeoutRef.current) clearTimeout(slugTimeoutRef.current);
        slugTimeoutRef.current = setTimeout(() => {
            checkSlugAvailability(sanitized);
        }, 500);
    };

    const generateSlugFromName = async () => {
        // Get shop name from localStorage
        const saved = localStorage.getItem('hotel_pos_bill_header');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed.shopName) {
                const slug = parsed.shopName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
                handleSlugChange(slug);
            }
        }
    };

    // Handle toggle changes with auto-save
    const handleDisplayOptionChange = async (option: 'shopName' | 'address' | 'phone', value: boolean) => {
        if (option === 'shopName') setMenuShowShopName(value);
        if (option === 'address') setMenuShowAddress(value);
        if (option === 'phone') setMenuShowPhone(value);

        // Auto-save after a short delay
        setTimeout(() => saveSettings(), 100);
    };

    // Save slug when it changes and is available
    useEffect(() => {
        if (slugStatus === 'available') {
            saveSettings();
        }
    }, [slugStatus]);

    // Auto-save appearance settings when changed (after initial load)
    const [isAppearanceLoaded, setIsAppearanceLoaded] = useState(false);
    useEffect(() => {
        // Skip first render (initial load)
        if (!isAppearanceLoaded) {
            // Set loaded after a delay to ensure initial load completes
            const timer = setTimeout(() => setIsAppearanceLoaded(true), 1000);
            return () => clearTimeout(timer);
        }
        // Save when any appearance setting changes
        saveSettings();
    }, [menuPrimaryColor, menuSecondaryColor, menuBackgroundColor, menuTextColor, menuItemsPerRow]);

    // Copy link to clipboard
    const handleCopyLink = async () => {
        try {
            await navigator.clipboard.writeText(currentQrUrl);
            setCopied(true);
            toast({
                title: "Link copied!",
                description: "Menu link copied to clipboard",
            });
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast({
                title: "Copy failed",
                description: "Please copy the link manually",
                variant: "destructive"
            });
        }
    };

    // Download QR code using canvas to avoid CORS
    const handleDownloadQR = async () => {
        try {
            const qrUrl = generateQRCodeUrl(currentQrUrl, 500);

            // Create a new image element
            const img = new Image();
            img.crossOrigin = 'anonymous';

            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = qrUrl;
            });

            // Create canvas and draw image
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Canvas not supported');
            ctx.drawImage(img, 0, 0);

            // Convert to blob and download
            canvas.toBlob((blob) => {
                if (!blob) {
                    throw new Error('Could not create blob');
                }
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = selectedTable
                    ? `menu-qr-table-${selectedTable}.png`
                    : 'menu-qr-code.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                toast({
                    title: "Downloaded!",
                    description: `QR code saved as ${a.download}`,
                });
            }, 'image/png');
        } catch (err) {
            console.error('QR download error:', err);
            // Fallback: open in new tab for manual save
            window.open(generateQRCodeUrl(currentQrUrl, 500), '_blank');
            toast({
                title: "Manual Download",
                description: "Right-click the image and save it",
            });
        }
    };

    // Download all table QR codes with table number label
    const handleDownloadAllTableQRs = async () => {
        toast({
            title: "Downloading...",
            description: `Generating ${tableCount} QR codes with table numbers`,
        });

        let successCount = 0;

        for (let i = 1; i <= tableCount; i++) {
            const tableUrl = `${baseUrl}?table=${i}`;
            try {
                const qrUrl = generateQRCodeUrl(tableUrl, 400);

                // Create image and load with CORS
                const img = new Image();
                img.crossOrigin = 'anonymous';

                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = qrUrl;
                });

                // Create canvas with extra space for table number header
                const headerHeight = 50;
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height + headerHeight;
                const ctx = canvas.getContext('2d');
                if (!ctx) continue;

                // Fill white background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw table number header
                ctx.fillStyle = '#1e293b';
                ctx.font = 'bold 28px Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`Table ${i}`, canvas.width / 2, 35);

                // Draw QR code below header
                ctx.drawImage(img, 0, headerHeight);

                // Convert to blob and download
                await new Promise<void>((resolve) => {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `menu-qr-table-${i}.png`;
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                            URL.revokeObjectURL(url);
                            successCount++;
                        }
                        resolve();
                    }, 'image/png');
                });

                // Small delay between downloads
                await new Promise(r => setTimeout(r, 300));
            } catch (err) {
                console.error(`Failed to download QR for table ${i}`, err);
            }
        }

        toast({
            title: successCount > 0 ? "Download Complete!" : "Download Failed",
            description: successCount > 0
                ? `${successCount} of ${tableCount} QR codes saved with table numbers`
                : "Could not download QR codes. Try downloading individually.",
            variant: successCount > 0 ? "default" : "destructive"
        });
    };

    // Share link
    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'View Our Menu',
                    text: 'Check out our menu!',
                    url: currentQrUrl,
                });
            } catch (err) {
                console.log('Share cancelled');
            }
        } else {
            handleCopyLink();
        }
    };

    // Print QR card
    const handlePrintQR = () => {
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
            toast({
                title: "Popup blocked",
                description: "Please allow popups to print QR code",
                variant: "destructive"
            });
            return;
        }

        const shopName = 'Your Restaurant';
        const tableLabel = selectedTable ? `Table ${selectedTable}` : 'Scan for Menu';

        printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Menu QR Code</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .card {
            background: white;
            border-radius: 16px;
            padding: 32px;
            text-align: center;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            max-width: 300px;
          }
          h1 { font-size: 24px; margin: 0 0 8px 0; color: #ea580c; }
          h2 { font-size: 18px; margin: 0 0 24px 0; color: #666; font-weight: normal; }
          img { width: 200px; height: 200px; margin: 0 auto 16px; }
          .instructions { font-size: 14px; color: #888; margin-top: 16px; }
          @media print { body { background: white; } .card { box-shadow: none; } }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>${shopName}</h1>
          <h2>${tableLabel}</h2>
          <img src="${generateQRCodeUrl(currentQrUrl, 200)}" alt="QR Code" />
          <p class="instructions">Scan with your phone camera<br/>to view our menu</p>
        </div>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 500); };
        </script>
      </body>
      </html>
    `);
        printWindow.document.close();
    };

    if (!adminId) {
        return (
            <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                    Unable to generate menu link. Please ensure you're logged in.
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Custom Menu URL Card */}
            <Card>
                <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center space-x-2">
                        <Link2 className="w-5 h-5" />
                        <span className="text-base sm:text-lg">Custom Menu URL</span>
                    </CardTitle>
                    <CardDescription>
                        Create a memorable URL for your online menu (e.g., /menu/your-shop-name)
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-4">
                    {/* Custom Slug Input */}
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <div className="flex-1 relative">
                                <span className="absolute left-3 top-2.5 text-sm text-muted-foreground">/menu/</span>
                                <Input
                                    value={menuSlug}
                                    onChange={(e) => handleSlugChange(e.target.value)}
                                    placeholder="your-shop-name"
                                    className="pl-16"
                                    maxLength={50}
                                />
                                {slugStatus === 'checking' && (
                                    <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">Checking...</span>
                                )}
                                {slugStatus === 'available' && (
                                    <Check className="absolute right-3 top-2.5 w-4 h-4 text-green-500" />
                                )}
                                {slugStatus === 'taken' && (
                                    <AlertCircle className="absolute right-3 top-2.5 w-4 h-4 text-red-500" />
                                )}
                            </div>
                            <Button variant="outline" size="sm" onClick={generateSlugFromName}>
                                Auto
                            </Button>
                        </div>
                        {slugStatus === 'taken' && (
                            <p className="text-xs text-red-500">This URL is already taken. Please choose another.</p>
                        )}
                        {slugStatus === 'available' && menuSlug && (
                            <p className="text-xs text-green-600">✓ This URL is available!</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Your menu will be accessible at: <code className="bg-muted px-1 py-0.5 rounded">{baseUrl}</code>
                        </p>
                    </div>

                    {/* Menu Display Options */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <Label className="text-sm font-medium">What to show on public menu:</Label>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Store className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm">Shop Name</span>
                                </div>
                                <Switch
                                    checked={menuShowShopName}
                                    onCheckedChange={(v) => handleDisplayOptionChange('shopName', v)}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm">Address</span>
                                </div>
                                <Switch
                                    checked={menuShowAddress}
                                    onCheckedChange={(v) => handleDisplayOptionChange('address', v)}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Phone className="w-4 h-4 text-muted-foreground" />
                                    <span className="text-sm">Phone Number</span>
                                </div>
                                <Switch
                                    checked={menuShowPhone}
                                    onCheckedChange={(v) => handleDisplayOptionChange('phone', v)}
                                />
                            </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                            Toggle what customers see on your public menu page
                        </p>
                    </div>
                </CardContent>
            </Card>

            {/* QR Code Card */}
            <Card>
                <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="flex items-center space-x-2">
                        <QrCode className="w-5 h-5" />
                        <span className="text-base sm:text-lg">Online Menu QR Code</span>
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-4 sm:p-6 space-y-6">
                    {/* Menu Link */}
                    <div className="space-y-2">
                        <Label className="text-sm font-medium">Your Menu Link</Label>
                        <div className="flex gap-2">
                            <Input
                                value={currentQrUrl}
                                readOnly
                                className="text-xs sm:text-sm font-mono bg-muted"
                            />
                            <Button
                                variant="outline"
                                size="icon"
                                onClick={handleCopyLink}
                                className="flex-shrink-0"
                            >
                                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </Button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" size="sm" onClick={handleShare}>
                                <Share2 className="w-4 h-4 mr-1" />
                                Share
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(currentQrUrl, '_blank')}
                            >
                                <ExternalLink className="w-4 h-4 mr-1" />
                                Preview
                            </Button>
                        </div>
                    </div>

                    {/* QR Code Display */}
                    <div className="text-center space-y-4">
                        <div className="inline-block p-4 bg-white rounded-2xl border-2 border-dashed border-muted shadow-sm">
                            <img
                                ref={qrRef}
                                src={generateQRCodeUrl(currentQrUrl, 200)}
                                alt="Menu QR Code"
                                className="w-48 h-48 mx-auto"
                            />
                            {selectedTable && (
                                <Badge className="mt-2 bg-orange-500">Table {selectedTable}</Badge>
                            )}
                        </div>
                        <div className="flex flex-wrap justify-center gap-2">
                            <Button variant="default" size="sm" onClick={handleDownloadQR}>
                                <Download className="w-4 h-4 mr-1" />
                                Download
                            </Button>
                            <Button variant="outline" size="sm" onClick={handlePrintQR}>
                                <Printer className="w-4 h-4 mr-1" />
                                Print Card
                            </Button>
                        </div>
                    </div>

                    {/* Table-based QR Toggle */}
                    <div className="border-t pt-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label className="text-sm font-medium flex items-center gap-2">
                                    <Table2 className="w-4 h-4" />
                                    Table-wise QR Codes
                                </Label>
                                <p className="text-xs text-muted-foreground">
                                    Generate different QR for each table
                                </p>
                            </div>
                            <Switch
                                checked={tableMode}
                                onCheckedChange={(checked) => {
                                    setTableMode(checked);
                                    if (!checked) setSelectedTable(null);
                                }}
                            />
                        </div>

                        {tableMode && (
                            <div className="space-y-3 bg-muted/50 rounded-lg p-4">
                                {/* Table Count */}
                                <div className="flex items-center gap-2">
                                    <Label className="text-sm">Number of Tables:</Label>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={100}
                                        value={tableCountInput}
                                        onChange={(e) => {
                                            setTableCountInput(e.target.value);
                                        }}
                                        onBlur={(e) => {
                                            const val = e.target.value;
                                            const num = parseInt(val);
                                            if (!val || isNaN(num) || num < 1) {
                                                setTableCount(1);
                                                setTableCountInput('1');
                                            } else if (num > 100) {
                                                setTableCount(100);
                                                setTableCountInput('100');
                                            } else {
                                                setTableCount(num);
                                                setTableCountInput(num.toString());
                                            }
                                        }}
                                        className="w-20"
                                    />
                                </div>

                                {/* Table Selector */}
                                <div className="space-y-2">
                                    <Label className="text-sm">Select table to preview QR:</Label>
                                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                        {Array.from({ length: tableCount }, (_, i) => i + 1).map(num => (
                                            <Button
                                                key={num}
                                                variant={selectedTable === num ? 'default' : 'outline'}
                                                size="sm"
                                                className="w-10 h-10"
                                                onClick={() => setSelectedTable(selectedTable === num ? null : num)}
                                            >
                                                {num}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* Download All */}
                                <Button
                                    variant="secondary"
                                    className="w-full"
                                    onClick={handleDownloadAllTableQRs}
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download All {tableCount} Table QR Codes
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Menu Appearance Settings */}
                    <div className="border-t pt-4 space-y-4">
                        <div className="flex items-center gap-2 mb-3">
                            <Palette className="w-4 h-4 text-purple-600" />
                            <Label className="text-sm font-medium">Menu Appearance</Label>
                            <Badge variant="secondary" className="text-[10px]">Per Admin</Badge>
                        </div>

                        {/* Color Pickers */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Header Color</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={menuPrimaryColor}
                                        onChange={(e) => setMenuPrimaryColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="w-8 h-8 rounded border cursor-pointer"
                                    />
                                    <Input
                                        value={menuPrimaryColor}
                                        onChange={(e) => setMenuPrimaryColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="h-8 text-xs font-mono flex-1"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Category Pills</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={menuSecondaryColor}
                                        onChange={(e) => setMenuSecondaryColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="w-8 h-8 rounded border cursor-pointer"
                                    />
                                    <Input
                                        value={menuSecondaryColor}
                                        onChange={(e) => setMenuSecondaryColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="h-8 text-xs font-mono flex-1"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Background</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={menuBackgroundColor}
                                        onChange={(e) => setMenuBackgroundColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="w-8 h-8 rounded border cursor-pointer"
                                    />
                                    <Input
                                        value={menuBackgroundColor}
                                        onChange={(e) => setMenuBackgroundColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="h-8 text-xs font-mono flex-1"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-muted-foreground">Text Color</Label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="color"
                                        value={menuTextColor}
                                        onChange={(e) => setMenuTextColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="w-8 h-8 rounded border cursor-pointer"
                                    />
                                    <Input
                                        value={menuTextColor}
                                        onChange={(e) => setMenuTextColor(e.target.value)}
                                        onBlur={saveSettings}
                                        className="h-8 text-xs font-mono flex-1"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Items Per Row */}
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <LayoutGrid className="w-4 h-4 text-blue-600" />
                                <Label className="text-xs text-muted-foreground">Items Per Row</Label>
                            </div>
                            <div className="flex gap-2">
                                {[1, 2, 3].map(num => (
                                    <Button
                                        key={num}
                                        variant={menuItemsPerRow === num ? 'default' : 'outline'}
                                        size="sm"
                                        className="flex-1"
                                        onClick={() => {
                                            setMenuItemsPerRow(num);
                                            setTimeout(saveSettings, 100);
                                        }}
                                    >
                                        {num} {num === 1 ? 'Item' : 'Items'}
                                    </Button>
                                ))}
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                                Changes apply instantly to your public menu
                            </p>
                        </div>
                    </div>

                    {/* Usage Instructions */}
                    <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                        <h4 className="font-medium text-orange-800 mb-2 text-sm">How to use:</h4>
                        <ul className="text-xs text-orange-700 space-y-1">
                            <li>• Print and display the QR code on your counter or tables</li>
                            <li>• Customers scan with their phone camera to view your menu</li>
                            <li>• Menu updates automatically when you change items</li>
                            <li>• No app download needed - works in any browser</li>
                        </ul>
                    </div>
                </CardContent>
            </Card>

            {/* Promotional Banners Section */}
            <PromoBannerManager />
        </div>
    );
};

export default QRCodeSettings;

