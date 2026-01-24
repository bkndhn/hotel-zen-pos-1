
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invalidateRelatedData, dataCache, CACHE_KEYS } from '@/utils/cacheUtils';
import { toast } from '@/hooks/use-toast';

// Global BroadcastChannel for instant same-browser sync
const localBroadcast = typeof BroadcastChannel !== 'undefined' 
  ? new BroadcastChannel('pos-instant-sync') 
  : null;

export const useRealTimeUpdates = () => {
  const broadcastChannelRef = useRef<any>(null);

  useEffect(() => {
    console.log('Setting up real-time updates with instant broadcast...');

    // ============ INSTANT BROADCAST CHANNEL (Sub-100ms cross-device) ============
    const broadcastChannel = supabase.channel('pos-global-broadcast', {
      config: { broadcast: { self: true } }
    })
      .on('broadcast', { event: 'bills-sync' }, (payload) => {
        console.log('[BROADCAST] Bills instant sync:', payload);
        invalidateRelatedData('bills');
        window.dispatchEvent(new CustomEvent('bills-updated'));
      })
      .on('broadcast', { event: 'items-sync' }, () => {
        console.log('[BROADCAST] Items instant sync');
        invalidateRelatedData('items');
        window.dispatchEvent(new CustomEvent('items-updated'));
      })
      .subscribe();

    broadcastChannelRef.current = broadcastChannel;

    // Local tab sync via BroadcastChannel (0ms for same browser)
    const handleLocalSync = (event: MessageEvent) => {
      const { type } = event.data || {};
      if (type === 'bills') {
        invalidateRelatedData('bills');
        window.dispatchEvent(new CustomEvent('bills-updated'));
      } else if (type === 'items') {
        invalidateRelatedData('items');
        window.dispatchEvent(new CustomEvent('items-updated'));
      }
    };
    localBroadcast?.addEventListener('message', handleLocalSync);

    // ============ POSTGRES CHANGES (Fallback, ~2-5s latency) ============
    // Listen for bills changes
    const billsChannel = supabase
      .channel('bills-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bills'
        },
        (payload) => {
          console.log('Bills change detected via postgres_changes:', payload);
          invalidateRelatedData('bills');
          window.dispatchEvent(new CustomEvent('bills-updated'));
          
          // Broadcast to other devices instantly
          broadcastChannelRef.current?.send({
            type: 'broadcast',
            event: 'bills-sync',
            payload: { source: 'postgres_changes', timestamp: Date.now() }
          });
          localBroadcast?.postMessage({ type: 'bills' });
        }
      )
      .subscribe();

    // Listen for items changes
    const itemsChannel = supabase
      .channel('items-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'items'
        },
        (payload) => {
          console.log('Items change detected:', payload);
          invalidateRelatedData('items');
          window.dispatchEvent(new CustomEvent('items-updated'));

          // Broadcast instantly
          broadcastChannelRef.current?.send({
            type: 'broadcast',
            event: 'items-sync',
            payload: { timestamp: Date.now() }
          });
          localBroadcast?.postMessage({ type: 'items' });

          if (payload.eventType === 'INSERT') {
            toast({
              title: "New Item Added",
              description: "Menu updated automatically",
            });
          } else if (payload.eventType === 'UPDATE') {
            toast({
              title: "Item Updated",
              description: "Menu refreshed automatically",
            });
          }
        }
      )
      .subscribe();

    // Listen for expenses changes
    const expensesChannel = supabase
      .channel('expenses-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expenses'
        },
        (payload) => {
          console.log('Expenses change detected:', payload);
          invalidateRelatedData('expenses');

          if (payload.eventType === 'INSERT') {
            toast({
              title: "New Expense Added",
              description: "Expenses updated automatically",
            });
          }
        }
      )
      .subscribe();

    // Listen for payment method changes
    const paymentsChannel = supabase
      .channel('payments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments'
        },
        (payload) => {
          console.log('Payments change detected:', payload);
          invalidateRelatedData('payments');
          dataCache.invalidate(CACHE_KEYS.PAYMENT_METHODS);
          window.dispatchEvent(new CustomEvent('payment-types-updated'));

          toast({
            title: "Payment Methods Updated",
            description: "Data refreshed automatically",
          });
        }
      )
      .subscribe();

    // Listen for category changes
    const categoriesChannel = supabase
      .channel('categories-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'expense_categories'
        },
        (payload) => {
          console.log('Categories change detected:', payload);
          dataCache.invalidate(CACHE_KEYS.EXPENSE_CATEGORIES);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'item_categories'
        },
        (payload) => {
          console.log('Item categories change detected:', payload);
          dataCache.invalidate(CACHE_KEYS.ITEM_CATEGORIES);
          window.dispatchEvent(new CustomEvent('categories-updated'));
        }
      )
      .subscribe();

    // Listen for additional charges changes
    const additionalChargesChannel = supabase
      .channel('additional-charges-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'additional_charges'
        },
        (payload) => {
          console.log('Additional charges change detected:', payload);
          window.dispatchEvent(new CustomEvent('additional-charges-updated'));
          window.dispatchEvent(new CustomEvent('settings-updated'));
        }
      )
      .subscribe();

    // Listen for shop settings changes
    const shopSettingsChannel = supabase
      .channel('shop-settings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shop_settings'
        },
        (payload) => {
          console.log('Shop settings change detected:', payload);
          window.dispatchEvent(new CustomEvent('shop-settings-updated'));
          window.dispatchEvent(new CustomEvent('settings-updated'));
        }
      )
      .subscribe();

    // Listen for display settings changes
    const displaySettingsChannel = supabase
      .channel('display-settings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'display_settings'
        },
        (payload) => {
          console.log('Display settings change detected:', payload);
          window.dispatchEvent(new CustomEvent('display-settings-updated'));
          window.dispatchEvent(new CustomEvent('settings-updated'));
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      console.log('Cleaning up real-time subscriptions...');
      supabase.removeChannel(billsChannel);
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(expensesChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(categoriesChannel);
      supabase.removeChannel(additionalChargesChannel);
      supabase.removeChannel(shopSettingsChannel);
      supabase.removeChannel(displaySettingsChannel);
      supabase.removeChannel(broadcastChannel);
      localBroadcast?.removeEventListener('message', handleLocalSync);
    };
  }, []);
};

// Helper to trigger instant broadcast from anywhere in the app
export const triggerInstantSync = (type: 'bills' | 'items') => {
  localBroadcast?.postMessage({ type });
};
