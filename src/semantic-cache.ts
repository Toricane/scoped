import { dimensions, embeddingVersion, validVector } from './semantic-model';

export interface VectorCache { get(key: string): Promise<Float32Array | undefined>; put(key: string, vector: Float32Array): Promise<void>; available: boolean }
export async function vectorKey(text: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return `${embeddingVersion}:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
/** Disposable derived cache, separate from authoritative snapshots and library records. */
export async function openVectorCache(maxEntries = 12000): Promise<VectorCache> {
  let db: IDBDatabase | undefined;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('scoped-semantic-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('vectors');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Embedding cache blocked'));
    });
    db.onversionchange = () => db?.close();
  } catch { /* Private browsing / unavailable storage: use bounded worker memory. */ }
  const memory = new Map<string, Float32Array>();
  let writes = 0;
  const remember = (key: string, vector: Float32Array) => {
    memory.set(key, vector); if (memory.size > 6000) memory.delete(memory.keys().next().value!);
  };
  const cache: VectorCache = {
    available: Boolean(db),
    async get(key) {
      const local = memory.get(key); if (local) return local;
      if (!cache.available || !db) return;
      try {
        const result = await new Promise<unknown>((resolve, reject) => {
          const request = db!.transaction('vectors', 'readonly').objectStore('vectors').get(key);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        if (validVector(result)) { remember(key, result); return result; }
      } catch { cache.available = false; }
    },
    async put(key, vector) {
      if (!validVector(vector) || vector.length !== dimensions) return;
      remember(key, vector);
      if (!cache.available || !db) return;
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = db!.transaction('vectors', 'readwrite');
          const store = transaction.objectStore('vectors'); store.put(vector, key);
          // Bound disposable persistent data, including obsolete model versions/queries.
          // Batched pruning permits at most 99 records above the limit.
          if (writes++ % 100 === 0) {
            const count = store.count();
            count.onsuccess = () => {
              let excess = count.result - maxEntries;
              if (excess <= 0) return;
              const cursor = store.openCursor();
              cursor.onsuccess = () => { if (cursor.result && excess-- > 0) { cursor.result.delete(); cursor.result.continue(); } };
            };
          }
          transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error);
        });
      } catch { cache.available = false; }
    },
  };
  return cache;
}
