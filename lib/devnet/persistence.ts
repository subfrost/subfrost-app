/**
 * Devnet state persistence via IndexedDB.
 *
 * Stores a binary snapshot of the devnet's indexer state so subsequent
 * boots can skip the expensive initial mining + contract deployment.
 * The snapshot is produced by DevnetServer.exportState() (Rust/WASM)
 * and consumed by DevnetServer.importState().
 */

const DB_NAME = 'subfrost-devnet';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const STATE_KEY = 'devnet-snapshot';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save a devnet state snapshot to IndexedDB.
 */
export async function saveDevnetState(stateBytes: Uint8Array): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(stateBytes, STATE_KEY);
    request.onsuccess = () => {
      db.close();
      resolve();
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

/**
 * Load a previously saved devnet state snapshot from IndexedDB.
 * Returns null if no snapshot exists.
 */
export async function loadDevnetState(): Promise<Uint8Array | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(STATE_KEY);
      request.onsuccess = () => {
        db.close();
        const result = request.result;
        if (result instanceof Uint8Array) {
          resolve(result);
        } else if (result instanceof ArrayBuffer) {
          resolve(new Uint8Array(result));
        } else {
          resolve(null);
        }
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    // IndexedDB may not be available (e.g., private browsing)
    return null;
  }
}

/**
 * Delete the saved devnet state from IndexedDB.
 */
export async function clearDevnetState(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(STATE_KEY);
      request.onsuccess = () => {
        db.close();
        resolve();
      };
      request.onerror = () => {
        db.close();
        reject(request.error);
      };
    });
  } catch {
    // Silently ignore if IndexedDB is not available
  }
}
