import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { Store, Upload, X, Facebook, Instagram, Phone } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export const ShopSettingsForm = () => {
    const { profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form State
    const [shopName, setShopName] = useState('');
    const [address, setAddress] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [printerWidth, setPrinterWidth] = useState<'58mm' | '80mm'>('58mm');

    // Social Media State
    const [facebook, setFacebook] = useState('');
    const [showFacebook, setShowFacebook] = useState(true);
    const [instagram, setInstagram] = useState('');
    const [showInstagram, setShowInstagram] = useState(true);
    const [whatsapp, setWhatsapp] = useState('');
    const [showWhatsapp, setShowWhatsapp] = useState(true);

    useEffect(() => {
        // 1. Instant load from localStorage cache (no loading state)
        const saved = localStorage.getItem('hotel_pos_bill_header');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setShopName(parsed.shopName || '');
                setAddress(parsed.address || '');
                setContactNumber(parsed.contactNumber || '');
                setLogoUrl(parsed.logoUrl || '');
                setPrinterWidth(parsed.printerWidth || '58mm');
                setFacebook(parsed.facebook || '');
                setShowFacebook(parsed.showFacebook !== false);
                setInstagram(parsed.instagram || '');
                setShowInstagram(parsed.showInstagram !== false);
                setWhatsapp(parsed.whatsapp || '');
                setShowWhatsapp(parsed.showWhatsapp !== false);
            } catch (e) { /* ignore parse errors */ }
        }
        // Always show the form (with cached or empty values)
        setLoading(false);

        // 2. Background sync from Supabase
        if (profile?.user_id) {
            fetchSettings();
        }
    }, [profile?.user_id]);

    const fetchSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('shop_settings')
                .select('*')
                .eq('user_id', profile?.user_id)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;

            if (data) {
                setShopName(data.shop_name || '');
                setAddress(data.address || '');
                setContactNumber(data.contact_number || '');
                setLogoUrl(data.logo_url || '');
                setPrinterWidth((data.printer_width as '58mm' | '80mm') || '58mm');

                setFacebook(data.facebook || '');
                setShowFacebook(data.show_facebook !== false);
                setInstagram(data.instagram || '');
                setShowInstagram(data.show_instagram !== false);
                setWhatsapp(data.whatsapp || '');
                setShowWhatsapp(data.show_whatsapp !== false);

                // Update cache with fresh data from Supabase
                const cacheData = {
                    shopName: data.shop_name || '',
                    address: data.address || '',
                    contactNumber: data.contact_number || '',
                    logoUrl: data.logo_url || '',
                    printerWidth: data.printer_width || '58mm',
                    facebook: data.facebook || '',
                    showFacebook: data.show_facebook !== false,
                    instagram: data.instagram || '',
                    showInstagram: data.show_instagram !== false,
                    whatsapp: data.whatsapp || '',
                    showWhatsapp: data.show_whatsapp !== false
                };
                localStorage.setItem('hotel_pos_bill_header', JSON.stringify(cacheData));
            }
        } catch (error) {
            console.error('Error fetching shop settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (file.size > 1024 * 1024) { // 1MB limit
            toast({
                title: "File too large",
                description: "Please select an image under 1MB",
                variant: "destructive"
            });
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // Resize image
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 384; // Standard thermal printer width in pixels
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height = (height * MAX_WIDTH) / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/png');
                    setLogoUrl(dataUrl);
                    toast({
                        title: "Logo Processed",
                        description: "Logo resized and ready for printing"
                    });
                }
            };
            img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
    };

    const removeLogo = () => {
        setLogoUrl('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const cleanUrl = (url: string) => {
        if (!url) return '';
        // allow simple usernames or full urls? 
        // User might paste "facebook.com/page" or just "page"
        return url.trim();
    };

    const handleSave = async () => {
        if (!profile?.user_id) return;
        setSaving(true);

        try {
            const settingsData = {
                user_id: profile.user_id,
                shop_name: shopName || null,
                address: address || null,
                contact_number: contactNumber || null,
                logo_url: logoUrl || null,
                printer_width: printerWidth,
                facebook: cleanUrl(facebook),
                show_facebook: showFacebook,
                instagram: cleanUrl(instagram),
                show_instagram: showInstagram,
                whatsapp: cleanUrl(whatsapp),
                show_whatsapp: showWhatsapp,
                updated_at: new Date().toISOString()
            };

            const { error } = await supabase
                .from('shop_settings')
                .upsert(settingsData, { onConflict: 'user_id' });

            if (error) throw error;

            // Update Local Cache
            const cacheData = {
                shopName, address, contactNumber, logoUrl, printerWidth,
                facebook, showFacebook, instagram, showInstagram, whatsapp, showWhatsapp
            };
            localStorage.setItem('hotel_pos_bill_header', JSON.stringify(cacheData));
            localStorage.setItem('hotel_pos_printer_width', printerWidth);

            // Trigger global event
            window.dispatchEvent(new Event('shop-settings-updated'));

            toast({
                title: "Settings Saved",
                description: "Shop details updated successfully."
            });
        } catch (error) {
            console.error('Error saving shop settings:', error);
            toast({
                title: "Error",
                description: "Failed to save settings.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading settings...</div>;

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Store className="w-5 h-5" />
                    Shop Details & Bill Header
                </CardTitle>
                <CardDescription>
                    Configure how your shop appears on printed receipts.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">

                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Shop Name</Label>
                        <Input
                            placeholder="e.g. My Awesome Cafe"
                            value={shopName}
                            onChange={e => setShopName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Contact Number</Label>
                        <Input
                            placeholder="e.g. +91 98765 43210"
                            value={contactNumber}
                            onChange={e => setContactNumber(e.target.value)}
                        />
                    </div>
                    <div className="col-span-1 md:col-span-2 space-y-2">
                        <Label>Address</Label>
                        <Input
                            placeholder="Shop No. 1, Main Street, City"
                            value={address}
                            onChange={e => setAddress(e.target.value)}
                        />
                    </div>
                </div>

                {/* Logo & Printer Width */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                    <div className="space-y-2">
                        <Label>Receipt Logo</Label>
                        <div className="flex items-start gap-4">
                            {logoUrl ? (
                                <div className="relative border rounded-md p-1 w-24 h-24 flex items-center justify-center bg-white">
                                    <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                                    <button
                                        onClick={removeLogo}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    className="w-24 h-24 border-2 border-dashed rounded-md flex flex-col items-center justify-center cursor-pointer hover:bg-slate-50"
                                >
                                    <Upload className="w-6 h-6 text-slate-400 mb-1" />
                                    <span className="text-xs text-slate-500">Upload</span>
                                </div>
                            )}
                            <div className="flex-1 space-y-2">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleLogoUpload}
                                />
                                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                                    {logoUrl ? "Change Logo" : "Select Image"}
                                </Button>
                                <p className="text-[10px] text-muted-foreground">
                                    Max 1MB. Auto-resized for thermal printing.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Printer Paper Width</Label>
                        <Select value={printerWidth} onValueChange={(v: '58mm' | '80mm') => setPrinterWidth(v)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="58mm">58mm (2 inch)</SelectItem>
                                <SelectItem value="80mm">80mm (3 inch)</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            Choose the width of your thermal paper roll.
                        </p>
                    </div>
                </div>

                {/* Social Media Links */}
                <div className="space-y-4 pt-4 border-t">
                    <Label className="text-base font-semibold">Social Media Links on Receipt</Label>

                    <div className="flex items-center gap-4">
                        <Switch checked={showFacebook} onCheckedChange={setShowFacebook} />
                        <div className="flex-1 relative">
                            <Facebook className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Facebook Page Name/Link"
                                value={facebook}
                                onChange={e => setFacebook(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Switch checked={showInstagram} onCheckedChange={setShowInstagram} />
                        <div className="flex-1 relative">
                            <Instagram className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="Instagram Handle (e.g. @mycafe)"
                                value={instagram}
                                onChange={e => setInstagram(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <Switch checked={showWhatsapp} onCheckedChange={setShowWhatsapp} />
                        <div className="flex-1 relative">
                            <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                            <Input
                                placeholder="WhatsApp Number"
                                value={whatsapp}
                                onChange={e => setWhatsapp(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                </div>

                <Button onClick={handleSave} disabled={saving} className="w-full md:w-auto">
                    {saving ? "Saving..." : "Save Shop Details"}
                </Button>

            </CardContent>
        </Card>
    );
};
