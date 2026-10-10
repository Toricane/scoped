// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openVectorCache } from '../src/semantic-cache';
import { dimensions } from '../src/semantic-model';
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()));
afterEach(() => vi.unstubAllGlobals());
it('persists typed vectors across worker caches and ignores corrupted storage', async () => {
  const first = await openVectorCache(); expect(first.available).toBe(true);
  const vector = new Float32Array(dimensions); vector[0] = 1;
  await first.put('record', vector);
  const second = await openVectorCache(); expect(await second.get('record')).toEqual(vector);
  const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('scoped-semantic-v1'); request.onsuccess = () => resolve(request.result); });
  await new Promise<void>(resolve => { const transaction = db.transaction('vectors', 'readwrite'); transaction.objectStore('vectors').put([1, 2], 'corrupt'); transaction.oncomplete = () => resolve(); });
  expect(await second.get('corrupt')).toBeUndefined(); db.close();
});
it('bounds disposable persistent vectors', async () => {
  const cache = await openVectorCache(2), vector = new Float32Array(dimensions); vector[0] = 1;
  for (let i = 0; i < 101; i++) await cache.put(String(i), vector);
  const db = await new Promise<IDBDatabase>(resolve => { const request = indexedDB.open('scoped-semantic-v1'); request.onsuccess = () => resolve(request.result); });
  const count = await new Promise<number>(resolve => { const request = db.transaction('vectors').objectStore('vectors').count(); request.onsuccess = () => resolve(request.result); });
  expect(count).toBe(2); db.close();
});
