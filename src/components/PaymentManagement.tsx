
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CreditCard, Plus } from 'lucide-react';

interface Payment {
  id: string;
  payment_type: string;
  is_disabled: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export const PaymentManagement: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [newPaymentType, setNewPaymentType] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchPayments();
    }
  }, [open]);

  const fetchPayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .order('payment_type');

      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast({
        title: "Error",
        description: "Failed to fetch payment types",
        variant: "destructive",
      });
    }
  };

  const handleAddPayment = async () => {
    if (!newPaymentType.trim()) {
      toast({
        title: "Error",
        description: "Payment type is required",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('payments')
        .insert({ payment_type: newPaymentType.trim().toLowerCase() });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Payment type added successfully",
      });

      setNewPaymentType('');
      fetchPayments();
    } catch (error) {
      console.error('Error adding payment:', error);
      toast({
        title: "Error",
        description: "Failed to add payment type",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleDisabled = async (paymentId: string, currentDisabled: boolean) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('payments')
        .update({ is_disabled: !currentDisabled })
        .eq('id', paymentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Payment type ${!currentDisabled ? 'disabled' : 'enabled'} successfully`,
      });

      fetchPayments();
    } catch (error) {
      console.error('Error updating payment:', error);
      toast({
        title: "Error",
        description: "Failed to update payment type",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (paymentId: string) => {
    setLoading(true);
    try {
      // First, remove default from all payments
      await supabase
        .from('payments')
        .update({ is_default: false })
        .neq('id', '00000000-0000-0000-0000-000000000000');

      // Then set the selected payment as default
      const { error } = await supabase
        .from('payments')
        .update({ is_default: true })
        .eq('id', paymentId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Default payment type updated successfully",
      });

      fetchPayments();
    } catch (error) {
      console.error('Error setting default payment:', error);
      toast({
        title: "Error",
        description: "Failed to set default payment type",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CreditCard className="w-4 h-4 mr-2" />
          Payment Types
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Manage Payment Types</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Add Payment Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Add New Payment Type</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="payment-type">Payment Type Name</Label>
                <Input
                  id="payment-type"
                  value={newPaymentType}
                  onChange={(e) => setNewPaymentType(e.target.value)}
                  placeholder="e.g., wallet, cheque"
                />
              </div>
              <Button onClick={handleAddPayment} disabled={loading}>
                <Plus className="w-4 h-4 mr-2" />
                Add Payment Type
              </Button>
            </CardContent>
          </Card>

          {/* Payment Types List */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Existing Payment Types</CardTitle>
            </CardHeader>
            <CardContent>
              {payments.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">
                  No payment types found
                </p>
              ) : (
                <div className="space-y-3">
                  {payments.map((payment) => (
                    <div key={payment.id} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                      <div>
                        <span className="font-medium capitalize">{payment.payment_type}</span>
                        {payment.is_default && (
                          <span className="ml-2 text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center space-x-2">
                          <Label htmlFor={`enabled-${payment.id}`} className="text-sm">
                            Enabled
                          </Label>
                          <Switch
                            id={`enabled-${payment.id}`}
                            checked={!payment.is_disabled}
                            onCheckedChange={() => handleToggleDisabled(payment.id, payment.is_disabled)}
                          />
                        </div>
                        <Button
                          size="sm"
                          variant={payment.is_default ? "default" : "outline"}
                          onClick={() => handleSetDefault(payment.id)}
                          disabled={payment.is_default}
                        >
                          {payment.is_default ? "Default" : "Set Default"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
