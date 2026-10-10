// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
// @ts-expect-error Build scripts are JavaScript, exercised directly without emitting TS declarations.
import { ensureGeography, hasGeography } from '../scripts/geography.mjs';
let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'scoped-geography-'));
  await mkdir(join(root, 'public/maps'), { recursive: true }); await writeFile(join(root, 'public/maps/SOURCES.txt'), 'Public geography notices');
  await mkdir(join(root, 'node_modules/world-atlas'), { recursive: true });
  for (const level of ['110m', '50m', '10m']) await writeFile(join(root, `node_modules/world-atlas/countries-${level}.json`), JSON.stringify({ type: 'Topology', objects: { countries: {} }, arcs: [] }));
});
afterEach(async () => {
  const absolute = resolve(root);
  expect(absolute.startsWith(resolve(tmpdir())) && absolute.split(/[\\/]/).at(-1)!.startsWith('scoped-geography-')).toBe(true);
  await rm(absolute, { recursive: true, force: true });
});
const fetcher = () => vi.fn(async (url: string) => {
  const city = ['1', 'Testville', 'Testville', '', '49', '-123', 'P', 'PPL', 'CA', '', '02'].join('\t');
  const bytes = url.endsWith('.zip') ? zipSync({ 'cities1000.txt': strToU8(city + '\n') }) : strToU8(url.includes('admin1') ? 'CA.02\tBritish Columbia\n' : 'CA\tCAN\t124\tCA\tCanada\n');
  return new Response(bytes);
});
it('creates missing offline assets once and reuses them without network access', async () => {
  const download = fetcher(); expect(await hasGeography(root)).toBe(false);
  await ensureGeography(root, { fetcher: download }); expect(download).toHaveBeenCalledTimes(3);
  expect(await hasGeography(root)).toBe(true);
  const index = JSON.parse(await readFile(join(root, 'public/maps/cities.json'), 'utf8'));
  expect(index.count).toBe(1); expect(index.sources['cities1000.zip'].sha256).toMatch(/^[a-f0-9]{64}$/);
  const offline = vi.fn(() => { throw Error('Offline'); }); await ensureGeography(root, { fetcher: offline }); expect(offline).not.toHaveBeenCalled();
  await unlink(join(root, 'public/maps/cities-0.json')); await ensureGeography(root, { fetcher: offline });
  expect(await hasGeography(root)).toBe(true); expect(offline).not.toHaveBeenCalled();
});
it('rejects corrupted source cache and preserves a previous index on failed refresh', async () => {
  await ensureGeography(root, { fetcher: fetcher() });
  const previous = await readFile(join(root, 'public/maps/cities.json'), 'utf8');
  await expect(ensureGeography(root, { refresh: true, fetcher: async () => { throw Error('offline'); } })).rejects.toThrow('setup:maps');
  expect(await readFile(join(root, 'public/maps/cities.json'), 'utf8')).toBe(previous);
  await writeFile(join(root, '.cache/geography/cities1000.zip'), 'bad'); await unlink(join(root, 'public/maps/cities-0.json'));
  await expect(ensureGeography(root, { fetcher: fetcher() })).rejects.toThrow('verification');
});
