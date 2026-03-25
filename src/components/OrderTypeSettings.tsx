import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { UtensilsCrossed } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

export const OrderTypeSettings: React.FC = () => {
  const [showOrderType, setShowOrderType] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSetting = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await (supabase as any)
          .from('shop_settings')
          .select('show_order_type')
          .eq('user_id', user.id)
          .single();

        if (data) {
          setShowOrderType(data.show_order_type || false);
        }
      } catch (e) {
        console.warn('Failed to fetch order type setting:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchSetting();
  }, []);

  const handleToggle = async (enabled: boolean) => {
    setShowOrderType(enabled);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await (supabase as any)
        .from('shop_settings')
        .update({ show_order_type: enabled })
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: enabled ? "Order Type Enabled" : "Order Type Disabled",
        description: enabled
          ? "Dine In / Parcel option will show in Complete Payment dialog."
          : "Order type selection is now hidden.",
      });
    } catch (e) {
      console.error('Failed to update order type setting:', e);
      setShowOrderType(!enabled); // revert
      toast({
        title: "Error",
        description: "Failed to update setting",
        variant: "destructive",
      });
    }
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader className="p-4 sm:p-6">
        <CardTitle className="flex items-center space-x-2">
          <UtensilsCrossed className="w-4 h-4 sm:w-5 sm:h-5" />
          <span className="text-base sm:text-lg">Order Type</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="order-type-toggle" className="text-sm font-medium">
              Show Dine In / Parcel Option
            </Label>
            <p className="text-xs text-muted-foreground">
              {showOrderType
                ? "Dine In / Parcel radio buttons will appear in Complete Payment. Order type is shown on bills, kitchen, and service area."
                : "Order type selection is hidden. All bills default to Dine In."}
            </p>
          </div>
          <Switch
            id="order-type-toggle"
            checked={showOrderType}
            onCheckedChange={handleToggle}
          />
        </div>
      </CardContent>
    </Card>
  );
};
