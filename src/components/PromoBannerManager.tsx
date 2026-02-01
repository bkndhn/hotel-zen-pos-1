import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Plus, Trash2, GripVertical, Image, Loader2, Calendar, X } from 'lucide-react';

interface Banner {
    id: string;
    title: string;
    description?: string;
    image_url: string;
    link_url?: string;
    is_active: boolean;
    display_order: number;
    start_date?: string;
    end_date?: string;
}

export const PromoBannerManager = () => {
    const { profile } = useAuth();
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        image_url: '',
        link_url: '',
        is_active: true,
        start_date: '',
        end_date: ''
    });

    const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

    useEffect(() => {
        fetchBanners();
    }, [adminId]);

    const fetchBanners = async () => {
        if (!adminId) return;

        try {
            const { data, error } = await supabase
                .from('promo_banners')
                .select('*')
                .eq('admin_id', adminId)
                .order('display_order');

            if (error) throw error;
            setBanners(data || []);
        } catch (error) {
            console.error('Error fetching banners:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file size (max 500KB)
        if (file.size > 500 * 1024) {
            toast({
                title: "File too large",
                description: "Banner image must be smaller than 500KB",
                variant: "destructive"
            });
            return;
        }

        if (!file.type.startsWith('image/')) {
            toast({
                title: "Invalid file type",
                description: "Please select an image file",
                variant: "destructive"
            });
            return;
        }

        try {
            setSaving(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${adminId}/banner-${Date.now()}.${fileExt}`;

            const { error } = await supabase.storage
                .from('promo-banners')
                .upload(fileName, file, { cacheControl: '3600', upsert: true });

            if (error) throw error;

            const { data: publicData } = supabase.storage
                .from('promo-banners')
                .getPublicUrl(fileName);

            setFormData(prev => ({ ...prev, image_url: publicData.publicUrl }));
            toast({ title: "Image uploaded" });
        } catch (error) {
            console.error('Upload error:', error);
            toast({
                title: "Upload failed",
                description: "Failed to upload image. Ensure storage bucket exists.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSave = async () => {
        if (!formData.title || !formData.image_url) {
            toast({
                title: "Error",
                description: "Title and image are required",
                variant: "destructive"
            });
            return;
        }

        setSaving(true);
        try {
            if (editingBanner) {
                // Update existing banner
                const { error } = await supabase
                    .from('promo_banners')
                    .update({
                        title: formData.title,
                        description: formData.description || null,
                        image_url: formData.image_url,
                        link_url: formData.link_url || null,
                        is_active: formData.is_active,
                        start_date: formData.start_date || null,
                        end_date: formData.end_date || null
                    })
                    .eq('id', editingBanner.id);

                if (error) throw error;
                toast({ title: "Banner updated" });
            } else {
                // Create new banner
                const { error } = await supabase
                    .from('promo_banners')
                    .insert({
                        admin_id: adminId,
                        title: formData.title,
                        description: formData.description || null,
                        image_url: formData.image_url,
                        link_url: formData.link_url || null,
                        is_active: formData.is_active,
                        display_order: banners.length,
                        start_date: formData.start_date || null,
                        end_date: formData.end_date || null
                    });

                if (error) throw error;
                toast({ title: "Banner created" });
            }

            setShowAddDialog(false);
            setEditingBanner(null);
            resetForm();
            fetchBanners();
        } catch (error) {
            console.error('Save error:', error);
            toast({
                title: "Error",
                description: "Failed to save banner",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (bannerId: string) => {
        if (!confirm('Are you sure you want to delete this banner?')) return;

        try {
            const { error } = await supabase
                .from('promo_banners')
                .delete()
                .eq('id', bannerId);

            if (error) throw error;
            toast({ title: "Banner deleted" });
            fetchBanners();
        } catch (error) {
            console.error('Delete error:', error);
            toast({
                title: "Error",
                description: "Failed to delete banner",
                variant: "destructive"
            });
        }
    };

    const handleToggleActive = async (banner: Banner) => {
        try {
            const { error } = await supabase
                .from('promo_banners')
                .update({ is_active: !banner.is_active })
                .eq('id', banner.id);

            if (error) throw error;
            fetchBanners();
        } catch (error) {
            console.error('Toggle error:', error);
        }
    };

    const openEditDialog = (banner: Banner) => {
        setEditingBanner(banner);
        setFormData({
            title: banner.title,
            description: banner.description || '',
            image_url: banner.image_url,
            link_url: banner.link_url || '',
            is_active: banner.is_active,
            start_date: banner.start_date?.split('T')[0] || '',
            end_date: banner.end_date?.split('T')[0] || ''
        });
        setShowAddDialog(true);
    };

    const resetForm = () => {
        setFormData({
            title: '',
            description: '',
            image_url: '',
            link_url: '',
            is_active: true,
            start_date: '',
            end_date: ''
        });
    };

    const openAddDialog = () => {
        setEditingBanner(null);
        resetForm();
        setShowAddDialog(true);
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Image className="w-5 h-5" />
                                Promotional Banners
                            </CardTitle>
                            <CardDescription>
                                Create auto-swipe banners for special offers on your public menu
                            </CardDescription>
                        </div>
                        <Button size="sm" onClick={openAddDialog}>
                            <Plus className="w-4 h-4 mr-1" />
                            Add Banner
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {banners.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No banners yet. Create your first promotional banner!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {banners.map((banner) => (
                                <div
                                    key={banner.id}
                                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                                >
                                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                                    <img
                                        src={banner.image_url}
                                        alt={banner.title}
                                        className="w-20 h-12 object-cover rounded"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{banner.title}</p>
                                        {banner.description && (
                                            <p className="text-xs text-muted-foreground truncate">{banner.description}</p>
                                        )}
                                        {(banner.start_date || banner.end_date) && (
                                            <p className="text-xs text-orange-600 flex items-center gap-1 mt-0.5">
                                                <Calendar className="w-3 h-3" />
                                                {banner.start_date?.split('T')[0]} - {banner.end_date?.split('T')[0] || 'No end'}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={banner.is_active}
                                            onCheckedChange={() => handleToggleActive(banner)}
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => openEditDialog(banner)}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-red-500 hover:text-red-700"
                                            onClick={() => handleDelete(banner.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add/Edit Banner Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingBanner ? 'Edit Banner' : 'Add New Banner'}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <Label>Title *</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Today's Special: 20% Off!"
                            />
                        </div>

                        <div>
                            <Label>Description (optional)</Label>
                            <Input
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Limited time offer on all biryanis"
                            />
                        </div>

                        <div>
                            <Label>Banner Image/GIF *</Label>
                            <p className="text-xs text-muted-foreground mb-2">
                                Upload an image or animated GIF (max 500KB). GIFs will auto-animate on the menu!
                            </p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*,.gif"
                                onChange={handleImageUpload}
                                className="hidden"
                            />
                            {formData.image_url ? (
                                <div className="relative">
                                    <img
                                        src={formData.image_url}
                                        alt="Banner preview"
                                        className="w-full h-32 object-cover rounded-lg border"
                                    />
                                    <Button
                                        type="button"
                                        variant="destructive"
                                        size="sm"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setFormData({ ...formData, image_url: '' });
                                        }}
                                        className="absolute top-2 right-2 h-6 w-6 p-0"
                                    >
                                        <X className="h-3 w-3" />
                                    </Button>
                                </div>
                            ) : (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => fileInputRef.current?.click()}
                                    disabled={saving}
                                    className="w-full h-24 border-2 border-dashed"
                                >
                                    {saving ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <div className="text-center">
                                            <Image className="w-6 h-6 mx-auto mb-1" />
                                            <span className="text-xs">Upload Image or GIF (max 500KB)</span>
                                        </div>
                                    )}
                                </Button>
                            )}
                        </div>

                        <div>
                            <Label>Link URL (optional)</Label>
                            <Input
                                value={formData.link_url}
                                onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                                placeholder="https://..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Start Date</Label>
                                <Input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>End Date</Label>
                                <Input
                                    type="date"
                                    value={formData.end_date}
                                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <Label>Active</Label>
                            <Switch
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : editingBanner ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
