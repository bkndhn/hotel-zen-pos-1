
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus } from 'lucide-react';
import { ImageUpload } from '@/components/ImageUpload';

interface Item {
  id: string;
  name: string;
  price: number;
  category?: string;
  is_active: boolean;
  description?: string;
  purchase_rate?: number;
  unit?: string;
  base_value?: number;
  stock_quantity?: number;
  minimum_stock_alert?: number;
  quantity_step?: number;
  image_url?: string;
}

interface Category {
  id: string;
  name: string;
}

interface AddItemDialogProps {
  onItemAdded: () => void;
  existingItems: Item[];
}

export const AddItemDialog: React.FC<AddItemDialogProps> = ({ onItemAdded, existingItems }) => {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    purchase_rate: '',
    unit: 'Piece (pc)',
    base_value: '1',
    stock_quantity: '',
    minimum_stock_alert: '',
    quantity_step: '1',
    category: '',
    image_url: '',
    is_active: true,
    unlimited_stock: false
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('item_categories')
        .select('id, name')
        .eq('is_deleted', false)
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.price || !formData.purchase_rate || (!formData.unlimited_stock && !formData.stock_quantity)) {
      toast({
        title: "Error",
        description: formData.unlimited_stock 
          ? "Name, selling price, and purchase rate are required"
          : "Name, selling price, purchase rate, and stock quantity are required",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicate items (case-insensitive)
    const isDuplicate = existingItems.some(item => 
      item.name.toLowerCase().trim() === formData.name.toLowerCase().trim() && item.is_active
    );

    if (isDuplicate) {
      toast({
        title: "Error",
        description: "An item with this name already exists",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Get admin_id from the session for data isolation
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      
      // Fetch user's profile to get admin_id
      let adminId = null;
      if (userId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, role, admin_id')
          .eq('user_id', userId)
          .single();
        
        if (profileData) {
          adminId = profileData.role === 'admin' ? profileData.id : profileData.admin_id;
        }
      }

      const { error } = await supabase.from('items').insert({
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price: parseFloat(formData.price),
        purchase_rate: parseFloat(formData.purchase_rate),
        unit: formData.unit,
        base_value: parseFloat(formData.base_value),
        stock_quantity: formData.unlimited_stock ? null : parseFloat(formData.stock_quantity),
        minimum_stock_alert: formData.unlimited_stock ? null : (parseFloat(formData.minimum_stock_alert) || 0),
        quantity_step: parseFloat(formData.quantity_step),
        category: formData.category === 'none' ? null : formData.category.trim(),
        image_url: formData.image_url.trim() || null,
        is_active: formData.is_active,
        unlimited_stock: formData.unlimited_stock,
        admin_id: adminId
      } as any);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Item added successfully",
      });

      setFormData({ 
        name: '', 
        description: '',
        price: '', 
        purchase_rate: '',
        unit: 'Piece (pc)',
        base_value: '1',
        stock_quantity: '',
        minimum_stock_alert: '',
        quantity_step: '1',
        category: '', 
        image_url: '',
        is_active: true,
        unlimited_stock: false
      });
      setOpen(false);
      onItemAdded();
    } catch (error) {
      console.error('Error adding item:', error);
      toast({
        title: "Error",
        description: "Failed to add item",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Item</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <Label htmlFor="name">Item Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter item name"
              required
            />
          </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter item description"
                rows={3}
              />
            </div>
          
          <div>
            <Label htmlFor="price">Selling Price *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={formData.price}
              onChange={(e) => setFormData({ ...formData, price: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <Label htmlFor="purchase_rate">Purchase Rate *</Label>
            <Input
              id="purchase_rate"
              type="number"
              step="0.01"
              min="0"
              value={formData.purchase_rate}
              onChange={(e) => setFormData({ ...formData, purchase_rate: e.target.value })}
              placeholder="0.00"
              required
            />
          </div>

          <div>
            <Label htmlFor="unit">Unit *</Label>
            <Select 
              value={formData.unit} 
              onValueChange={(value) => setFormData({ ...formData, unit: value })}
            >
              <SelectTrigger className="bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="Piece (pc)">Piece (pc)</SelectItem>
                <SelectItem value="Kilogram (kg)">Kilogram (kg)</SelectItem>
                <SelectItem value="Gram (g)">Gram (g)</SelectItem>
                <SelectItem value="Liter (l)">Liter (l)</SelectItem>
                <SelectItem value="Milliliter (ml)">Milliliter (ml)</SelectItem>
                <SelectItem value="Box">Box</SelectItem>
                <SelectItem value="Pack">Pack</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="base_value">Base Value</Label>
            <Input
              id="base_value"
              type="number"
              step="0.01"
              min="0"
              value={formData.base_value}
              onChange={(e) => setFormData({ ...formData, base_value: e.target.value })}
              placeholder="1"
            />
          </div>

          <div className="flex items-center space-x-2 py-2">
            <Checkbox
              id="unlimited_stock"
              checked={formData.unlimited_stock}
              onCheckedChange={(checked) => setFormData({ ...formData, unlimited_stock: checked as boolean })}
            />
            <Label htmlFor="unlimited_stock" className="font-medium">Unlimited Stock (no tracking)</Label>
          </div>

          {!formData.unlimited_stock && (
            <>
              <div>
                <Label htmlFor="stock_quantity">Stock Quantity *</Label>
                <Input
                  id="stock_quantity"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.stock_quantity}
                  onChange={(e) => setFormData({ ...formData, stock_quantity: e.target.value })}
                  placeholder="Available stock"
                  required={!formData.unlimited_stock}
                />
              </div>

              <div>
                <Label htmlFor="minimum_stock_alert">Minimum Stock Alert</Label>
                <Input
                  id="minimum_stock_alert"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.minimum_stock_alert}
                  onChange={(e) => setFormData({ ...formData, minimum_stock_alert: e.target.value })}
                  placeholder="Alert when stock below"
                />
              </div>
            </>
          )}

          <div>
            <Label htmlFor="quantity_step">Quantity Step</Label>
            <Input
              id="quantity_step"
              type="number"
              step="0.01"
              min="0.01"
              value={formData.quantity_step}
              onChange={(e) => setFormData({ ...formData, quantity_step: e.target.value })}
              placeholder="1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Amount to +/- when clicking buttons in the billing page.
            </p>
          </div>
          
          <div>
            <Label htmlFor="category">Category *</Label>
            <Select 
              value={formData.category} 
              onValueChange={(value) => setFormData({ ...formData, category: value })}
            >
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent className="bg-background border shadow-lg z-50">
                <SelectItem value="none">No Category</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.name}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="image_url">Item Image</Label>
            <ImageUpload
              value={formData.image_url}
              onChange={(url) => setFormData({ ...formData, image_url: url })}
              itemId={`new-item-${Date.now()}`}
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="is_active"
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked as boolean })}
            />
            <Label htmlFor="is_active">Item is available for sale</Label>
          </div>
          
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {loading ? 'Creating...' : 'Create Item'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
