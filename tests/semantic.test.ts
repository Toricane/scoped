// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { semanticText, validVector, relevance, cosine, dimensions } from '../src/semantic-model';
import { vectorKey, openVectorCache, type VectorCache } from '../src/semantic-cache';
import { searchVectors } from '../src/semantic-engine';
import { defaults, indexPostings, readPreferences, selectPostings } from '../src/viewer-model';
import type { Posting } from '../src/types';
const posting: Posting = { id: '1001', jobTitle: 'Backend Engineer 1001B', organization: 'Example Labs', division: 'Platform', location: 'Vancouver, BC', deadlineText: 'Oct 16, 2026 09:00 AM', applicationStatus: '', applications: 0, term: '', isNew: false, shortlisted: false };
const vector = (x = 1, y = 0) => { const result = new Float32Array(dimensions); result[0] = x; result[1] = y; return result; };
function memoryCache(): VectorCache {
  const values = new Map<string, Float32Array>();
  return { available: true, get: vi.fn(async key => values.get(key)), put: vi.fn(async (key, value) => { values.set(key, value); }) };
}
it('embeds stable cleaned fields, preserves requisition numbers, and separates title scope', async () => {
  const text = semanticText(posting, 'all');
  expect(text).toContain('Position: Backend Engineer'); expect(text).not.toContain('1001');
  expect(text).toContain('Organization: Example Labs'); expect(text).toContain('Location: Vancouver, BC');
  expect(semanticText({ ...posting, deadlineText: 'Nov 1, 2026 09:00 AM', shortlisted: true }, 'all')).toBe(text);
  expect(semanticText({ ...posting, jobTitle: 'Engineer (40982) 1001B' }, 'title')).toBe('Position: Engineer (40982)');
  expect(await vectorKey(text)).not.toBe(await vectorKey(semanticText(posting, 'title')));
});
it('uses cosine plus lexical coverage, rejects unrelated matches, and keeps numeric IDs exact', () => {
  expect(cosine(vector(2, 0), vector(3, 0))).toBe(1);
  expect(relevance('server development', { id: '1001', text: 'Backend Engineer' }, vector(), vector(0.8, 0.6))).toBeCloseTo(0.68);
  expect(relevance('server development', { id: '1002', text: 'Designer' }, vector(), vector(0, 1))).toBeUndefined();
  expect(relevance('Example Labs', { id: '1001', text: 'Organization: Example Labs' }, vector(), vector(0, 1))).toBe(0.15);
  expect(relevance('1001', { id: '1002', text: 'Engineer 1001' }, vector(), vector())).toBeUndefined();
  expect(relevance('1001', { id: '1001', text: 'Engineer' }, vector(), vector())).toBe(1);
  expect(validVector(vector())).toBe(true); expect(validVector(new Float32Array(dimensions))).toBe(false);
  const invalid = vector(); invalid[0] = NaN; expect(validVector(invalid)).toBe(false);
});
it('caches across searches and re-embeds only changed fields', async () => {
  const cache = memoryCache(), encode = vi.fn(async () => vector());
  const request = { revision: 1, query: 'server development', documents: [{ id: posting.id, text: semanticText(posting, 'all') }] };
  await searchVectors(request, encode, cache, () => true, vi.fn());
  await searchVectors(request, encode, cache, () => true, vi.fn()); expect(encode).toHaveBeenCalledTimes(2);
  await searchVectors({ ...request, documents: [{ id: posting.id, text: semanticText({ ...posting, organization: 'New Labs' }, 'all') }] }, encode, cache, () => true, vi.fn());
  expect(encode).toHaveBeenCalledTimes(3);
});
it('abandons stale work and rejects corrupt cached vectors', async () => {
  const cache = memoryCache(); cache.get = vi.fn(async () => new Float32Array(2));
  let current = true; const encode = vi.fn(async () => { current = false; return vector(); });
  expect(await searchVectors({ revision: 1, query: 'server', documents: [{ id: '1001', text: 'Backend' }] }, encode, cache, () => current, vi.fn())).toBeUndefined();
  expect(encode).toHaveBeenCalledTimes(1);
  await expect(searchVectors({ revision: 1, query: 'server', documents: [] }, async () => new Float32Array(2), cache, () => true, vi.fn())).rejects.toThrow('invalid embedding');
});
it('keeps semantic results subject to exact filters, exclusions and expired-last sorting', () => {
  const rows = [posting, { ...posting, id: '1002', jobTitle: 'Research Intern', location: 'Montréal, QC', deadlineText: '' }, { ...posting, id: '1003', jobTitle: 'Expired Engineer', deadlineText: 'Oct 1, 2026 09:00 AM' }];
  const scores = new Map([['1001', 0.7], ['1002', 0.8], ['1003', 0.9]]);
  const prefs = { ...defaults(), searchMode: 'semantic' as const, query: 'server development', sort: 'relevance' as const };
  const select = (extra = {}) => selectPostings(indexPostings(rows), { ...prefs, ...extra }, new Date(2026, 9, 10), scores).map(row => row.id);
  expect(select()).toEqual(['1002', '1001', '1003']);
  expect(select({ locations: ['Vancouver, BC'], to: '2026-10-20', hideExpired: true })).toEqual(['1001']);
  expect(select({ exclude: 'research' })).toEqual(['1001', '1003']);
  expect(select({ expiredLast: false })).toEqual(['1003', '1002', '1001']);
  expect(selectPostings(indexPostings(rows), prefs)).toHaveLength(0); // Explicit keyword fallback.
  expect(readPreferences({ version: 1 }).searchMode).toBe('keyword');
  expect(readPreferences({ version: 1, searchMode: 'semantic', sort: 'relevance' }).sort).toBe('relevance');
});
it('continues with an in-memory cache when IndexedDB is unavailable', async () => {
  const cache = await openVectorCache(); expect(cache.available).toBe(false);
  await cache.put('key', vector()); expect(await cache.get('key')).toEqual(vector());
});
it('looks up exact numeric IDs without initializing inference', async () => {
  const encode = vi.fn();
  expect(await searchVectors({ revision: 1, query: '1001', documents: [{ id: '1001', text: 'Engineer' }, { id: '1002', text: '1001 Engineer' }] }, encode, memoryCache(), () => true, vi.fn())).toEqual([['1001', 1]]);
  expect(encode).not.toHaveBeenCalled();
});
it('reduces weak semantic overlap relative to the strongest hit without dropping literal matches', async () => {
  const request = { revision: 1, query: 'backend engineer', documents: [{ id: '1001', text: 'Server Developer' }, { id: '1002', text: 'Graphic Designer' }, { id: '1003', text: 'Backend Engineer' }] };
  const encode = async (text: string) => text === 'Graphic Designer' ? vector(0.3, Math.sqrt(0.91)) : text === 'Backend Engineer' ? vector(0, 1) : vector();
  const scores = await searchVectors(request, encode, memoryCache(), () => true, vi.fn());
  expect(scores?.map(([id]) => id)).toEqual(['1001', '1003']);
});
