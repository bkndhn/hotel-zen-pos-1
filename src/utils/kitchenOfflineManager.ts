/**
 * Kitchen Display Offline Manager
 * Handles offline-first functionality with IndexedDB caching
 */

interface KitchenBillItem {
  id: string;
  quantity: number;
  items: {
    id: string;
    name: string;
    unit?: string;
    base_value?: number;
  } | null;
}

interface KitchenBill {
  id: string;
  bill_no: string;
  created_at: string;
  kitchen_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
  service_status: 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'rejected';
  bill_items: KitchenBillItem[];
}

interface OfflineStatusUpdate {
  id: string;
  billId: string;
  status: 'preparing' | 'ready';
  timestamp: number;
  synced: number; // 0 = not synced, 1 = synced (IndexedDB doesn't support boolean keys)
}

const DB_NAME = 'kitchen_display_db';
const DB_VERSION = 1;
const BILLS_STORE = 'bills';
const UPDATES_STORE = 'status_updates';

class KitchenOfflineManager {
  private db: IDBDatabase | null = null;
  private isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;
  private listeners: Set<(isOnline: boolean) => void> = new Set();
  private billsListeners: Set<(bills: KitchenBill[]) => void> = new Set();

  constructor() {
    this.init();
    this.setupOnlineListener();
  }

  private async init(): Promise<void> {
    try {
      this.db = await this.openDatabase();
      console.log('[KitchenOffline] IndexedDB initialized');
    } catch (error) {
      console.error('[KitchenOffline] Failed to initialize IndexedDB:', error);
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Bills store
        if (!db.objectStoreNames.contains(BILLS_STORE)) {
          const billsStore = db.createObjectStore(BILLS_STORE, { keyPath: 'id' });
          billsStore.createIndex('kitchen_status', 'kitchen_status', { unique: false });
          billsStore.createIndex('created_at', 'created_at', { unique: false });
        }

        // Status updates store (for offline updates)
        if (!db.objectStoreNames.contains(UPDATES_STORE)) {
          const updatesStore = db.createObjectStore(UPDATES_STORE, { keyPath: 'id' });
          updatesStore.createIndex('synced', 'synced', { unique: false });
          updatesStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  private setupOnlineListener(): void {
    window.addEventListener('online', () => {
      console.log('[KitchenOffline] Online');
      this.isOnline = true;
      this.notifyListeners();
      this.syncPendingUpdates();
    });

    window.addEventListener('offline', () => {
      console.log('[KitchenOffline] Offline');
      this.isOnline = false;
      this.notifyListeners();
    });
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.isOnline));
  }

  private notifyBillsListeners(bills: KitchenBill[]): void {
    this.billsListeners.forEach(listener => listener(bills));
  }

  public onOnlineStatusChange(callback: (isOnline: boolean) => void): () => void {
    this.listeners.add(callback);
    // Immediately call with current status
    callback(this.isOnline);
    return () => this.listeners.delete(callback);
  }

  public onBillsChange(callback: (bills: KitchenBill[]) => void): () => void {
    this.billsListeners.add(callback);
    return () => this.billsListeners.delete(callback);
  }

  public getOnlineStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Cache bills from server
   */
  async cacheBills(bills: KitchenBill[]): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(BILLS_STORE, 'readwrite');
      const store = transaction.objectStore(BILLS_STORE);

      // Clear old bills first
      store.clear();

      // Add new bills
      bills.forEach(bill => {
        store.put(bill);
      });

      transaction.oncomplete = () => {
        console.log('[KitchenOffline] Cached', bills.length, 'bills');
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get cached bills
   */
  async getCachedBills(): Promise<KitchenBill[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(BILLS_STORE, 'readonly');
      const store = transaction.objectStore(BILLS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const bills = request.result as KitchenBill[];
        // Apply any pending offline updates
        this.applyPendingUpdates(bills).then(resolve);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Apply pending offline updates to cached bills
   */
  private async applyPendingUpdates(bills: KitchenBill[]): Promise<KitchenBill[]> {
    const pendingUpdates = await this.getPendingUpdates();

    return bills.map(bill => {
      const update = pendingUpdates.find(u => u.billId === bill.id && u.synced === 0);
      if (update) {
        return {
          ...bill,
          kitchen_status: update.status,
          service_status: update.status === 'ready' ? 'ready' : bill.service_status
        };
      }
      return bill;
    });
  }

  /**
   * Save an offline status update
   */
  async saveOfflineUpdate(billId: string, status: 'preparing' | 'ready'): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    const update: OfflineStatusUpdate = {
      id: `${billId}-${Date.now()}`,
      billId,
      status,
      timestamp: Date.now(),
      synced: 0 // 0 = not synced
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([UPDATES_STORE, BILLS_STORE], 'readwrite');
      const updatesStore = transaction.objectStore(UPDATES_STORE);
      const billsStore = transaction.objectStore(BILLS_STORE);

      // Save the update
      updatesStore.put(update);

      // Also update the cached bill for immediate UI feedback
      const getRequest = billsStore.get(billId);
      getRequest.onsuccess = () => {
        const bill = getRequest.result as KitchenBill;
        if (bill) {
          bill.kitchen_status = status;
          if (status === 'ready') bill.service_status = 'ready';
          billsStore.put(bill);
        }
      };

      transaction.oncomplete = () => {
        console.log('[KitchenOffline] Saved offline update:', billId, status);
        // Notify listeners of the change
        this.getCachedBills().then(bills => this.notifyBillsListeners(bills));
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Get pending (unsynced) updates
   */
  async getPendingUpdates(): Promise<OfflineStatusUpdate[]> {
    if (!this.db) await this.init();
    if (!this.db) return [];

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(UPDATES_STORE, 'readonly');
      const store = transaction.objectStore(UPDATES_STORE);
      const index = store.index('synced');
      const request = index.getAll(IDBKeyRange.only(0)); // 0 = not synced

      request.onsuccess = () => resolve(request.result as OfflineStatusUpdate[]);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Mark an update as synced
   */
  async markUpdateSynced(updateId: string): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(UPDATES_STORE, 'readwrite');
      const store = transaction.objectStore(UPDATES_STORE);
      const request = store.get(updateId);

      request.onsuccess = () => {
        const update = request.result as OfflineStatusUpdate;
        if (update) {
          update.synced = 1; // 1 = synced
          store.put(update);
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  /**
   * Sync pending updates to server
   */
  async syncPendingUpdates(): Promise<{ synced: number; failed: number }> {
    if (!this.isOnline || this.syncInProgress) {
      return { synced: 0, failed: 0 };
    }

    this.syncInProgress = true;
    const pending = await this.getPendingUpdates();

    if (pending.length === 0) {
      this.syncInProgress = false;
      return { synced: 0, failed: 0 };
    }

    console.log('[KitchenOffline] Syncing', pending.length, 'pending updates');

    let synced = 0;
    let failed = 0;

    // Import supabase dynamically to avoid circular deps
    const { supabase } = await import('@/integrations/supabase/client');

    for (const update of pending) {
      try {
        const updateData: any = { kitchen_status: update.status };
        if (update.status === 'ready') updateData.service_status = 'ready';

        const { error } = await supabase
          .from('bills')
          .update(updateData)
          .eq('id', update.billId);

        if (error) throw error;

        await this.markUpdateSynced(update.id);
        synced++;
      } catch (error) {
        console.error('[KitchenOffline] Failed to sync update:', update.id, error);
        failed++;
      }
    }

    this.syncInProgress = false;
    console.log('[KitchenOffline] Sync complete:', synced, 'synced,', failed, 'failed');

    return { synced, failed };
  }

  /**
   * Clear old synced updates (cleanup)
   */
  async clearSyncedUpdates(): Promise<void> {
    if (!this.db) await this.init();
    if (!this.db) return;

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(UPDATES_STORE, 'readwrite');
      const store = transaction.objectStore(UPDATES_STORE);
      const index = store.index('synced');
      const request = index.openCursor(IDBKeyRange.only(1)); // 1 = synced

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
}

// Singleton instance
export const kitchenOfflineManager = new KitchenOfflineManager();