import type { Order, Message, Offer } from "@shared/schema";

const DB_NAME = 'restaurant_buzzer_db';
const DB_VERSION = 2;
const ORDERS_STORE = 'orders';
const MESSAGES_STORE = 'messages';
const METADATA_STORE = 'metadata';
const OUTBOX_STORE = 'outbox';

let dbInstance: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

async function openDatabase(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  if (dbInitPromise) {
    return dbInitPromise;
  }

  dbInitPromise = new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('[IndexedDB] Failed to open database:', request.error);
        dbInitPromise = null;
        reject(request.error);
      };

      request.onsuccess = () => {
        dbInstance = request.result;
        console.log('[IndexedDB] Database opened successfully');
        resolve(dbInstance);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        if (!db.objectStoreNames.contains(ORDERS_STORE)) {
          db.createObjectStore(ORDERS_STORE, { keyPath: 'id' });
        }
        
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const messagesStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
          messagesStore.createIndex('orderId', 'orderId', { unique: false });
        }
        
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
          db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
        }
        
        console.log('[IndexedDB] Database schema created');
      };
    } catch (error) {
      console.error('[IndexedDB] Failed to open database:', error);
      dbInitPromise = null;
      reject(error);
    }
  });

  return dbInitPromise;
}

export async function isIndexedDBAvailable(): Promise<boolean> {
  try {
    if (!('indexedDB' in window)) {
      return false;
    }
    
    const db = await openDatabase();
    return !!db;
  } catch {
    return false;
  }
}

export async function checkDataEviction(): Promise<boolean> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    
    return new Promise((resolve) => {
      const request = store.get('lastWrite');
      
      request.onsuccess = () => {
        const data = request.result;
        if (!data) {
          resolve(true);
          return;
        }
        
        const lastWrite = new Date(data.timestamp);
        const now = new Date();
        const daysSinceLastWrite = (now.getTime() - lastWrite.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceLastWrite > 7) {
          console.log('[IndexedDB] Data may have been evicted (>7 days since last write)');
          resolve(true);
        }
        
        resolve(false);
      };
      
      request.onerror = () => {
        resolve(true);
      };
    });
  } catch {
    return true;
  }
}

async function updateLastWrite(): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([METADATA_STORE], 'readwrite');
    const store = transaction.objectStore(METADATA_STORE);
    
    store.put({ key: 'lastWrite', timestamp: new Date().toISOString() });
  } catch (error) {
    console.warn('[IndexedDB] Failed to update lastWrite:', error);
  }
}

export async function saveOrder(order: Order): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([ORDERS_STORE], 'readwrite');
    const store = transaction.objectStore(ORDERS_STORE);
    
    store.put(order);
    await updateLastWrite();
    
    console.log('[IndexedDB] Order saved:', order.id);
  } catch (error) {
    console.warn('[IndexedDB] Failed to save order:', error);
  }
}

export async function getOrder(orderId: string): Promise<Order | null> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([ORDERS_STORE], 'readonly');
    const store = transaction.objectStore(ORDERS_STORE);
    
    return new Promise((resolve) => {
      const request = store.get(orderId);
      
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      
      request.onerror = () => {
        console.warn('[IndexedDB] Failed to get order:', request.error);
        resolve(null);
      };
    });
  } catch {
    return null;
  }
}

export async function deleteOrder(orderId: string): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([ORDERS_STORE, MESSAGES_STORE], 'readwrite');
    const ordersStore = transaction.objectStore(ORDERS_STORE);
    const messagesStore = transaction.objectStore(MESSAGES_STORE);
    
    ordersStore.delete(orderId);
    
    const index = messagesStore.index('orderId');
    const cursor = index.openCursor(IDBKeyRange.only(orderId));
    
    cursor.onsuccess = (event) => {
      const result = (event.target as IDBRequest<IDBCursorWithValue>).result;
      if (result) {
        messagesStore.delete(result.primaryKey);
        result.continue();
      }
    };
    
    console.log('[IndexedDB] Order deleted:', orderId);
  } catch (error) {
    console.warn('[IndexedDB] Failed to delete order:', error);
  }
}

export async function saveMessage(orderId: string, message: Message): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([MESSAGES_STORE], 'readwrite');
    const store = transaction.objectStore(MESSAGES_STORE);
    
    store.put({ ...message, orderId });
    await updateLastWrite();
    
    console.log('[IndexedDB] Message saved:', message.id);
  } catch (error) {
    console.warn('[IndexedDB] Failed to save message:', error);
  }
}

export async function getMessages(orderId: string): Promise<Message[]> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([MESSAGES_STORE], 'readonly');
    const store = transaction.objectStore(MESSAGES_STORE);
    const index = store.index('orderId');
    
    return new Promise((resolve) => {
      const request = index.getAll(orderId);
      
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      
      request.onerror = () => {
        console.warn('[IndexedDB] Failed to get messages:', request.error);
        resolve([]);
      };
    });
  } catch {
    return [];
  }
}

export async function clearAllData(): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([ORDERS_STORE, MESSAGES_STORE, METADATA_STORE], 'readwrite');
    
    transaction.objectStore(ORDERS_STORE).clear();
    transaction.objectStore(MESSAGES_STORE).clear();
    transaction.objectStore(METADATA_STORE).clear();
    
    console.log('[IndexedDB] All data cleared');
  } catch (error) {
    console.warn('[IndexedDB] Failed to clear data:', error);
  }
}

export async function syncOrderFromServer(orderId: string): Promise<Order | null> {
  try {
    const response = await fetch(`/api/orders/${orderId}`, { credentials: 'include' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const order = await response.json() as Order;
    await saveOrder(order);
    console.log('[OfflineFirst] Synced order from server:', orderId);
    return order;
  } catch (error) {
    console.warn('[OfflineFirst] Network fetch failed, using cached order:', error);
    const cached = await getOrder(orderId);
    return cached;
  }
}

export async function isStale(orderId: string): Promise<boolean> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([METADATA_STORE], 'readonly');
    const store = transaction.objectStore(METADATA_STORE);
    
    return new Promise((resolve) => {
      const request = store.get('lastWrite');
      request.onsuccess = () => {
        const data = request.result;
        if (!data) {
          resolve(true);
          return;
        }
        const lastWrite = new Date(data.timestamp).getTime();
        const now = new Date().getTime();
        resolve(now - lastWrite > 30000); // 30 seconds
      };
      request.onerror = () => resolve(true);
    });
  } catch {
    return true;
  }
}

export async function addToOutbox(url: string, method: string, body?: any): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([OUTBOX_STORE], 'readwrite');
    const store = transaction.objectStore(OUTBOX_STORE);
    
    store.add({
      url,
      method,
      body,
      createdAt: new Date().toISOString()
    });
    console.log('[Outbox] Action queued:', method, url);
  } catch (error) {
    console.warn('[Outbox] Failed to queue action:', error);
  }
}

export async function syncOutbox(): Promise<void> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction([OUTBOX_STORE], 'readonly');
    const store = transaction.objectStore(OUTBOX_STORE);
    
    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = async () => {
        const entries = request.result;
        console.log('[Outbox] Syncing', entries.length, 'queued actions');
        
        for (const entry of entries) {
          try {
            const response = await fetch(entry.url, {
              method: entry.method,
              headers: entry.body ? { 'Content-Type': 'application/json' } : {},
              body: entry.body ? JSON.stringify(entry.body) : undefined,
              credentials: 'include'
            });
            
            if (response.ok) {
              // Delete successful entry
              const deleteTransaction = db.transaction([OUTBOX_STORE], 'readwrite');
              deleteTransaction.objectStore(OUTBOX_STORE).delete(entry.id);
              console.log('[Outbox] Synced:', entry.method, entry.url);
            } else {
              console.warn('[Outbox] Failed to sync:', entry.method, entry.url, response.status);
            }
          } catch (error) {
            console.warn('[Outbox] Error syncing entry:', error);
          }
        }
        resolve();
      };
      request.onerror = () => resolve();
    });
  } catch (error) {
    console.warn('[Outbox] Sync failed:', error);
  }
}

export const offlineStorage = {
  isAvailable: isIndexedDBAvailable,
  checkEviction: checkDataEviction,
  saveOrder,
  getOrder,
  deleteOrder,
  saveMessage,
  getMessages,
  clearAll: clearAllData,
  syncOrderFromServer,
  isStale,
  addToOutbox,
  syncOutbox
};
