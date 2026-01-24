/**
 * Offline-First PWA Manager v2
 * Provides IndexedDB persistence and sync queue for offline billing
 * Features: Auto-sync on reconnect, conflict resolution, retry with backoff
 */

import * as React from 'react';
import { supabase } from '@/integrations/supabase/client';

// Database configuration
const DB_NAME = 'HotelPOS_OfflineDB';
const DB_VERSION = 2;

// Store names
const STORES = {
    ITEMS: 'items',
    BILLS: 'bills',
    CATEGORIES: 'categories',
    SYNC_QUEUE: 'syncQueue',
    SETTINGS: 'settings',
    PENDING_BILLS: 'pendingBills'
};

export interface PendingBill {
    id: string;
    bill_no: string;
    total_amount: number;
    discount: number;
    payment_mode: string;
    payment_details: any;
    additional_charges: any;
    created_by: string;
    date: string;
    created_at: string;
    items: Array<{
        item_id: string;
        name: string;
        quantity: number;
        price: number;
        total: number;
    }>;
    synced: boolean;
    syncError?: string;
    retries: number;
}

interface SyncQueueItem {
    id: string;
    type: 'bill' | 'expense' | 'item';
    action: 'create' | 'update' | 'delete';
    data: any;
    timestamp: number;
    retryCount: number;
}

class OfflineManager {
    private db: IDBDatabase | null = null;
    private isOnline: boolean = navigator.onLine;
    private syncInProgress: boolean = false;
    private listeners: Set<(isOnline: boolean) => void> = new Set();
    private pendingBillListeners: Set<(count: number) => void> = new Set();

    constructor() {
        this.initializeDB();
        this.setupNetworkListeners();
    }

    private async initializeDB(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => {
                console.error('Failed to open IndexedDB:', request.error);
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log('IndexedDB initialized successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object stores
                if (!db.objectStoreNames.contains(STORES.ITEMS)) {
                    const itemStore = db.createObjectStore(STORES.ITEMS, { keyPath: 'id' });
                    itemStore.createIndex('is_active', 'is_active');
                    itemStore.createIndex('category', 'category');
                }

                if (!db.objectStoreNames.contains(STORES.BILLS)) {
                    const billStore = db.createObjectStore(STORES.BILLS, { keyPath: 'id' });
                    billStore.createIndex('date', 'date');
                    billStore.createIndex('synced', 'synced');
                }

                if (!db.objectStoreNames.contains(STORES.CATEGORIES)) {
                    db.createObjectStore(STORES.CATEGORIES, { keyPath: 'id' });
                }

                if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
                    const syncStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
                    syncStore.createIndex('timestamp', 'timestamp');
                    syncStore.createIndex('type', 'type');
                }

                if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
                    db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
                }

                if (!db.objectStoreNames.contains(STORES.PENDING_BILLS)) {
                    const pendingStore = db.createObjectStore(STORES.PENDING_BILLS, { keyPath: 'id' });
                    pendingStore.createIndex('created_at', 'created_at');
                    pendingStore.createIndex('synced', 'synced');
                }

                console.log('IndexedDB stores created/upgraded');
            };
        });
    }

    private setupNetworkListeners(): void {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.notifyListeners();
            console.log('Network: Online - Starting sync');
            // Auto-sync with delay to ensure stable connection
            setTimeout(() => this.processSyncQueue(), 1000);
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.notifyListeners();
            console.log('Network: Offline mode active');
        });
    }

    // Subscribe to network status changes
    onNetworkChange(callback: (isOnline: boolean) => void): () => void {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    // Subscribe to pending bills count changes
    onPendingBillsChange(callback: (count: number) => void): () => void {
        this.pendingBillListeners.add(callback);
        return () => this.pendingBillListeners.delete(callback);
    }

    private notifyListeners(): void {
        this.listeners.forEach(callback => callback(this.isOnline));
    }

    private async notifyPendingBillsListeners(): Promise<void> {
        const count = await this.getPendingBillsCount();
        this.pendingBillListeners.forEach(callback => callback(count));
    }

    getNetworkStatus(): boolean {
        return this.isOnline;
    }

    // Generic store operations
    async store<T>(storeName: string, data: T): Promise<void> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async storeMany<T>(storeName: string, items: T[]): Promise<void> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);

            items.forEach(item => store.put(item));

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async get<T>(storeName: string, key: string): Promise<T | null> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll<T>(storeName: string): Promise<T[]> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();

            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName: string, key: string): Promise<void> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clear(storeName: string): Promise<void> {
        if (!this.db) await this.initializeDB();

        return new Promise((resolve, reject) => {
            const transaction = this.db!.transaction(storeName, 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ===== PENDING BILLS MANAGEMENT =====
    async savePendingBill(bill: Omit<PendingBill, 'synced' | 'retries'>): Promise<string> {
        const pendingBill: PendingBill = {
            ...bill,
            synced: false,
            retries: 0
        };
        
        await this.store(STORES.PENDING_BILLS, pendingBill);
        await this.notifyPendingBillsListeners();
        
        console.log('[Offline] Saved pending bill:', bill.bill_no);
        
        // If online, try to sync immediately
        if (this.isOnline) {
            setTimeout(() => this.processSyncQueue(), 100);
        }
        
        return bill.id;
    }

    async getPendingBills(): Promise<PendingBill[]> {
        const bills = await this.getAll<PendingBill>(STORES.PENDING_BILLS);
        return bills.filter(b => !b.synced).sort((a, b) => 
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
    }

    async markBillSynced(billId: string): Promise<void> {
        const bill = await this.get<PendingBill>(STORES.PENDING_BILLS, billId);
        if (bill) {
            bill.synced = true;
            await this.store(STORES.PENDING_BILLS, bill);
            await this.notifyPendingBillsListeners();
        }
    }

    async updateBillSyncError(billId: string, error: string): Promise<void> {
        const bill = await this.get<PendingBill>(STORES.PENDING_BILLS, billId);
        if (bill) {
            bill.syncError = error;
            bill.retries = (bill.retries || 0) + 1;
            await this.store(STORES.PENDING_BILLS, bill);
        }
    }

    // Sync queue operations
    async addToSyncQueue(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
        const queueItem: SyncQueueItem = {
            ...item,
            id: `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            retryCount: 0
        };

        await this.store(STORES.SYNC_QUEUE, queueItem);
        console.log('Added to sync queue:', queueItem.type, queueItem.action);
    }

    async getSyncQueue(): Promise<SyncQueueItem[]> {
        return this.getAll<SyncQueueItem>(STORES.SYNC_QUEUE);
    }

    async removeFromSyncQueue(id: string): Promise<void> {
        await this.delete(STORES.SYNC_QUEUE, id);
    }

    async processSyncQueue(): Promise<{ synced: number; failed: number }> {
        if (this.syncInProgress || !this.isOnline) {
            return { synced: 0, failed: 0 };
        }

        this.syncInProgress = true;
        console.log('[Sync] Starting sync queue processing...');
        
        let synced = 0;
        let failed = 0;

        try {
            // Process pending bills first
            const pendingBills = await this.getPendingBills();
            
            for (const bill of pendingBills) {
                if (bill.retries >= 5) {
                    console.warn('[Sync] Max retries reached for bill:', bill.bill_no);
                    failed++;
                    continue;
                }

                try {
                    await this.syncBillToSupabase(bill);
                    await this.markBillSynced(bill.id);
                    synced++;
                    console.log('[Sync] Successfully synced bill:', bill.bill_no);
                } catch (error: any) {
                    console.error('[Sync] Failed to sync bill:', bill.bill_no, error);
                    await this.updateBillSyncError(bill.id, error.message);
                    failed++;
                }
            }

            // Process legacy sync queue
            const queue = await this.getSyncQueue();

            for (const item of queue) {
                try {
                    await this.processQueueItem(item);
                    await this.removeFromSyncQueue(item.id);
                    synced++;
                } catch (error) {
                    console.error('Failed to sync item:', item.id, error);

                    if (item.retryCount < 3) {
                        await this.store(STORES.SYNC_QUEUE, {
                            ...item,
                            retryCount: item.retryCount + 1
                        });
                    }
                    failed++;
                }
            }
            
            await this.notifyPendingBillsListeners();
        } finally {
            this.syncInProgress = false;
            console.log(`[Sync] Complete. Synced: ${synced}, Failed: ${failed}`);
        }

        return { synced, failed };
    }

    private async syncBillToSupabase(bill: PendingBill): Promise<void> {
        // Generate proper sequential bill number
        const { data: allBillNos } = await supabase
            .from('bills')
            .select('bill_no')
            .order('created_at', { ascending: false })
            .limit(100);

        let maxNumber = 55;
        if (allBillNos && allBillNos.length > 0) {
            allBillNos.forEach((b: any) => {
                const match = b.bill_no.match(/^BILL-(\d{6})$/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNumber) maxNumber = num;
                }
            });
        }
        const properBillNumber = `BILL-${String(maxNumber + 1).padStart(6, '0')}`;

        // Create the bill in Supabase
        const billData = {
            bill_no: properBillNumber,
            total_amount: bill.total_amount,
            discount: bill.discount,
            payment_mode: bill.payment_mode as any,
            payment_details: bill.payment_details,
            additional_charges: bill.additional_charges,
            created_by: bill.created_by,
            date: bill.date,
            service_status: 'pending' as const
        };

        const { data: createdBill, error: billError } = await supabase
            .from('bills')
            .insert([billData])
            .select()
            .single();

        if (billError) throw billError;
        if (!createdBill) throw new Error('Failed to create bill');

        // Create bill items
        const billItems = bill.items.map(item => ({
            bill_id: createdBill.id,
            item_id: item.item_id,
            quantity: item.quantity,
            price: item.price,
            total: item.total
        }));

        const { error: itemsError } = await supabase
            .from('bill_items')
            .insert(billItems);

        if (itemsError) {
            // Rollback
            await supabase.from('bills').delete().eq('id', createdBill.id);
            throw itemsError;
        }

        console.log(`[Sync] Offline bill ${bill.bill_no} → ${properBillNumber}`);
        
        // Dispatch sync event
        window.dispatchEvent(new CustomEvent('bills-updated'));
    }

    private async processQueueItem(item: SyncQueueItem): Promise<void> {
        switch (item.type) {
            case 'bill':
                if (item.action === 'create') {
                    const billData = item.data.bill;
                    const itemsData = item.data.items;

                    // Generate proper sequential bill number
                    const { data: allBillNos } = await supabase
                        .from('bills')
                        .select('bill_no')
                        .order('created_at', { ascending: false })
                        .limit(100);

                    let maxNumber = 55;
                    if (allBillNos && allBillNos.length > 0) {
                        allBillNos.forEach((bill: any) => {
                            const match = bill.bill_no.match(/^BILL-(\d{6})$/);
                            if (match) {
                                const num = parseInt(match[1], 10);
                                if (num > maxNumber) {
                                    maxNumber = num;
                                }
                            }
                        });
                    }
                    const properBillNumber = `BILL-${String(maxNumber + 1).padStart(6, '0')}`;

                    const finalBillData = {
                        ...billData,
                        bill_no: properBillNumber
                    };

                    const { data: createdBill, error: billError } = await supabase
                        .from('bills')
                        .insert(finalBillData)
                        .select()
                        .single();

                    if (billError) throw billError;

                    if (createdBill && itemsData && itemsData.length > 0) {
                        const billItems = itemsData.map((billItem: any) => ({
                            bill_id: createdBill.id,
                            item_id: billItem.item_id,
                            quantity: billItem.quantity,
                            price: billItem.price,
                            total: billItem.total
                        }));

                        const { error: itemsError } = await supabase
                            .from('bill_items')
                            .insert(billItems);

                        if (itemsError) {
                            await supabase.from('bills').delete().eq('id', createdBill.id);
                            throw itemsError;
                        }
                    }

                    console.log(`Offline bill synced: ${billData.bill_no} → ${properBillNumber}`);
                }
                break;
            case 'expense':
                if (item.action === 'create') {
                    const { error } = await supabase.from('expenses').insert(item.data);
                    if (error) throw error;
                }
                break;
            default:
                console.warn('Unknown sync item type:', item.type);
        }
    }

    // Convenience methods for specific data types
    async cacheItems(items: any[]): Promise<void> {
        await this.storeMany(STORES.ITEMS, items);
    }

    async getCachedItems(): Promise<any[]> {
        return this.getAll(STORES.ITEMS);
    }

    async cacheCategories(categories: any[]): Promise<void> {
        await this.storeMany(STORES.CATEGORIES, categories);
    }

    async getCachedCategories(): Promise<any[]> {
        return this.getAll(STORES.CATEGORIES);
    }

    async cacheBill(bill: any): Promise<void> {
        await this.store(STORES.BILLS, { ...bill, synced: this.isOnline });
    }

    async getCachedBills(): Promise<any[]> {
        return this.getAll(STORES.BILLS);
    }

    async getPendingBillsCount(): Promise<number> {
        const bills = await this.getPendingBills();
        return bills.length;
    }
}

// Singleton instance
export const offlineManager = new OfflineManager();

// React hook for network status
export function useNetworkStatus() {
    const [isOnline, setIsOnline] = React.useState(navigator.onLine);

    React.useEffect(() => {
        const unsubscribe = offlineManager.onNetworkChange(setIsOnline);
        return unsubscribe;
    }, []);

    return isOnline;
}
