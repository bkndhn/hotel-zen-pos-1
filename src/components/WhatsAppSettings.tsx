import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { MessageCircle, Settings2, Zap, Info } from 'lucide-react';

export const WhatsAppSettings: React.FC = () => {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Settings state
  const [whatsappBillShareEnabled, setWhatsappBillShareEnabled] = useState(false);
  const [whatsappBusinessApiEnabled, setWhatsappBusinessApiEnabled] = useState(false);
  const [whatsappBusinessApiToken, setWhatsappBusinessApiToken] = useState('');
  const [whatsappBusinessPhoneId, setWhatsappBusinessPhoneId] = useState('');

  useEffect(() => {
    if (profile?.user_id) {
      fetchSettings();
    }
  }, [profile?.user_id]);

  const fetchSettings = async () => {
    try {
      const { data, error } = await (supabase as any)
        .from('shop_settings')
        .select('whatsapp_bill_share_enabled, whatsapp_business_api_enabled, whatsapp_business_api_token, whatsapp_business_phone_id')
        .eq('user_id', profile?.user_id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setWhatsappBillShareEnabled(data.whatsapp_bill_share_enabled || false);
        setWhatsappBusinessApiEnabled(data.whatsapp_business_api_enabled || false);
        setWhatsappBusinessApiToken(data.whatsapp_business_api_token || '');
        setWhatsappBusinessPhoneId(data.whatsapp_business_phone_id || '');
      }
    } catch (error) {
      console.error('Error fetching WhatsApp settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.user_id) return;
    setSaving(true);

    try {
      const { error } = await (supabase as any)
        .from('shop_settings')
        .upsert({
          user_id: profile.user_id,
          whatsapp_bill_share_enabled: whatsappBillShareEnabled,
          whatsapp_business_api_enabled: whatsappBusinessApiEnabled,
          whatsapp_business_api_token: whatsappBusinessApiToken || null,
          whatsapp_business_phone_id: whatsappBusinessPhoneId || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      // Update local cache
      const existingCache = localStorage.getItem('hotel_pos_bill_header');
      if (existingCache) {
        const parsed = JSON.parse(existingCache);
        parsed.whatsappBillShareEnabled = whatsappBillShareEnabled;
        localStorage.setItem('hotel_pos_bill_header', JSON.stringify(parsed));
      }

      toast({
        title: "Settings Saved",
        description: "WhatsApp bill sharing settings updated successfully."
      });
    } catch (error) {
      console.error('Error saving WhatsApp settings:', error);
      toast({
        title: "Error",
        description: "Failed to save settings.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse h-32 bg-muted rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-green-600" />
          WhatsApp Bill Share
        </CardTitle>
        <CardDescription>
          Send digital receipts directly to customers via WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Master Toggle */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
          <div className="space-y-0.5">
            <Label htmlFor="whatsapp-enabled" className="text-sm font-medium">
              Enable WhatsApp Bill Sharing
            </Label>
            <p className="text-xs text-muted-foreground">
              Show option to send bill via WhatsApp during billing
            </p>
          </div>
          <Switch
            id="whatsapp-enabled"
            checked={whatsappBillShareEnabled}
            onCheckedChange={setWhatsappBillShareEnabled}
          />
        </div>

        {whatsappBillShareEnabled && (
          <>
            {/* Integration Mode */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                <Label className="text-sm font-medium">Integration Mode</Label>
              </div>

              {/* Direct WhatsApp (Free) */}
              <div className={`p-4 rounded-lg border-2 transition-colors ${!whatsappBusinessApiEnabled ? 'border-primary bg-primary/5' : 'border-muted'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">Direct WhatsApp</span>
                        <Badge variant="secondary" className="text-[10px]">Free</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Opens WhatsApp with pre-filled message (manual send)</p>
                    </div>
                  </div>
                  <Switch
                    checked={!whatsappBusinessApiEnabled}
                    onCheckedChange={() => setWhatsappBusinessApiEnabled(false)}
                  />
                </div>
              </div>

              {/* WhatsApp Business API (Premium) */}
              <div className={`p-4 rounded-lg border-2 transition-colors ${whatsappBusinessApiEnabled ? 'border-primary bg-primary/5' : 'border-muted'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">WhatsApp Business API</span>
                        <Badge className="text-[10px] bg-blue-600">Premium</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">Automatic bill sending (requires Business API setup)</p>
                    </div>
                  </div>
                  <Switch
                    checked={whatsappBusinessApiEnabled}
                    onCheckedChange={setWhatsappBusinessApiEnabled}
                  />
                </div>

                {whatsappBusinessApiEnabled && (
                  <div className="space-y-3 pt-3 border-t">
                    <div className="flex items-start gap-2 p-2 bg-yellow-50 rounded-md border border-yellow-200">
                      <Info className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-yellow-800">
                        WhatsApp Business API requires a Meta Business account and approved WhatsApp Business number. 
                        <a href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started" target="_blank" rel="noopener noreferrer" className="underline ml-1">Learn more</a>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="api-token" className="text-xs">Access Token</Label>
                      <Input
                        id="api-token"
                        type="password"
                        placeholder="Your WhatsApp Business API Token"
                        value={whatsappBusinessApiToken}
                        onChange={(e) => setWhatsappBusinessApiToken(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone-id" className="text-xs">Phone Number ID</Label>
                      <Input
                        id="phone-id"
                        placeholder="Your WhatsApp Business Phone Number ID"
                        value={whatsappBusinessPhoneId}
                        onChange={(e) => setWhatsappBusinessPhoneId(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">
          {saving ? "Saving..." : "Save WhatsApp Settings"}
        </Button>
      </CardContent>
    </Card>
  );
};
