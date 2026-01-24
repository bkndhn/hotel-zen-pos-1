
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Edit, Plus } from 'lucide-react';
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
  unlimited_stock?: boolean;
}

interface EditItemDialogProps {
  item: Item;
  onItemUpdated: () => void;
}

export const EditItemDialog: React.FC<EditItemDialogProps> = ({ item, onItemUpdated }) => {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: item.name,
    description: item.description || '',
    price: item.price.toString(),
    purchase_rate: item.purchase_rate?.toString() || '',
    unit: item.unit || 'Piece (pc)',
    base_value: item.base_value?.toString() || '1',
    stock_quantity: item.stock_quantity?.toString() || '',
    minimum_stock_alert: item.minimum_stock_alert?.toString() || '',
    quantity_step: item.quantity_step?.toString() || '1',
    category: item.category || '',
    image_url: item.image_url || '',
    is_active: item.is_active,
    unlimited_stock: item.unlimited_stock || false
  });
  const [loading, setLoading] = useState(false);

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

    setLoading(true);
    try {
      const { error } = await supabase
        .from('items')
        .update({
          name: formData.name,
          description: formData.description || null,
          price: parseFloat(formData.price),
          purchase_rate: parseFloat(formData.purchase_rate),
          unit: formData.unit,
          base_value: parseFloat(formData.base_value),
          stock_quantity: formData.unlimited_stock ? null : parseFloat(formData.stock_quantity),
          minimum_stock_alert: formData.unlimited_stock ? null : (parseFloat(formData.minimum_stock_alert) || 0),
          quantity_step: parseFloat(formData.quantity_step),
          category: formData.category || null,
          image_url: formData.image_url || null,
          is_active: formData.is_active,
          unlimited_stock: formData.unlimited_stock
        } as any)
        .eq('id', item.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Item updated successfully",
      });

      setOpen(false);
      onItemUpdated();
    } catch (error) {
      console.error('Error updating item:', error);
      toast({
        title: "Error",
        description: "Failed to update item",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Edit className="w-4 h-4" />
      </Button>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Item</DialogTitle>
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
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Enter category (optional)"
              />
            </div>

            <div>
              <Label htmlFor="image_url">Item Image</Label>
              <ImageUpload
                value={formData.image_url}
                onChange={(url) => setFormData({ ...formData, image_url: url })}
                itemId={item.id}
              />
            </div>
            
            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
              <Label htmlFor="is_active">Item is available for sale</Label>
            </div>
            
            <div className="flex justify-end space-x-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Updating...' : 'Update Item'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};
