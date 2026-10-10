import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { geoOrthographic, geoPath } from 'd3-geo';
import type { Posting } from '../src/types';
afterEach(() => vi.unstubAllGlobals());
it('shows city/count as inline SVG text on hover and focus and supports much deeper zoom', async () => {
  vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => path } });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => /countries(?:-50m|-10m)?\.json$/.test(url)
    ? { type: 'Topology', objects: { countries: { type: 'GeometryCollection', geometries: [] } }, arcs: [] }
    : url.endsWith('cities.json') ? { version: 1, files: ['cities-0.json'], countryNames: { CA: 'Canada' } }
    : [['Vancouver', 'Vancouver', 'CA', '02', 'British Columbia', -123.1, 49.3]] })));
  const container = document.createElement('div'); document.body.replaceChildren(container);
  const { LocationExplorer } = await import('../src/globe');
  const explorer = new LocationExplorer(container, vi.fn());
  explorer.update([{ id: '1', location: 'Vancouver, BC' }] as Posting[]);
  await vi.waitFor(() => expect(container.querySelector('.city-bubble')).not.toBeNull());
  const circle = container.querySelector('.city-bubble')!;
  expect(circle.querySelector('title')).toBeNull();
  circle.dispatchEvent(new Event('pointerenter'));
  expect(container.querySelector('.city-hover-label')!.textContent).toContain('Vancouver');
  expect(container.querySelector('.city-hover-label')!.textContent).toContain('1 posting');
  circle.dispatchEvent(new Event('pointerleave')); expect(container.querySelector('.city-hover-label')).toBeNull();
  circle.dispatchEvent(new Event('focus')); expect(container.querySelector('.city-hover-label')).not.toBeNull();
  const zoom = [...container.querySelectorAll('button')].find(button => button.textContent === 'Zoom in +')!;
  for (let i = 0; i < 18; i++) zoom.click();
  expect((explorer as unknown as { zoom: number }).zoom).toBeGreaterThan(50);
  for (let i = 0; i < 10; i++) zoom.click();
  expect((explorer as unknown as { zoom: number }).zoom).toBe(80);
  await vi.waitFor(() => expect(container.querySelector('svg')!.getAttribute('data-detail')).toBe('countries-10m'));
  expect(fetch).toHaveBeenCalledWith('maps/countries-50m.json');
  expect(fetch).toHaveBeenCalledWith('maps/countries-10m.json');
  [...container.querySelectorAll('button')].find(button => button.textContent === 'Reset view')!.click();
  expect(container.querySelector('svg')!.getAttribute('data-detail')).toBe('countries');
  expect(container.textContent).not.toContain('Detailed map unavailable');
});

it('keeps the overview usable when detailed boundary loading fails without repeating requests', async () => {
  vi.resetModules(); vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => path } });
  const topology = { type: 'Topology', objects: { countries: { type: 'GeometryCollection', geometries: [] } }, arcs: [] };
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: !url.includes('countries-'), json: async () => url.endsWith('countries.json') ? topology : url.endsWith('cities.json') ? { version: 1, files: ['cities-0.json'], countryNames: { CA: 'Canada' } } : [['Vancouver', 'Vancouver', 'CA', '02', 'British Columbia', -123.1, 49.3]] })));
  const { LocationExplorer } = await import('../src/globe');
  const container = document.createElement('div'); document.body.replaceChildren(container);
  const explorer = new LocationExplorer(container, vi.fn()); explorer.update([{ id: '1', location: 'Vancouver, BC' }] as Posting[]);
  await vi.waitFor(() => expect(container.querySelector('.city-bubble')).not.toBeNull());
  const zoom = [...container.querySelectorAll('button')].find(button => button.textContent === 'Zoom in +')!;
  for (let i = 0; i < 8; i++) zoom.click();
  await vi.waitFor(() => expect(container.textContent).toContain('Detailed map unavailable'));
  for (let i = 0; i < 4; i++) zoom.click();
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === 'maps/countries-10m.json')).toHaveLength(1);
  expect(container.querySelector('svg')!.getAttribute('data-detail')).toBe('countries');
  [...container.querySelectorAll('button')].find(button => button.textContent === 'Reset view')!.click();
  expect(container.querySelector('.city-bubble')).not.toBeNull();
});

it('culls offscreen detailed geometry without changing the visible coastline', async () => {
  vi.resetModules(); vi.stubGlobal('chrome', { runtime: { getURL: (path: string) => path } });
  const topology = JSON.parse(readFileSync('node_modules/world-atlas/countries-10m.json', 'utf8'));
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => url.includes('countries') ? topology : url.endsWith('cities.json') ? { version: 1, files: ['cities-0.json'], countryNames: { CA: 'Canada' } } : [['Vancouver', 'Vancouver', 'CA', '02', 'British Columbia', -123.1, 49.3]] })));
  const { LocationExplorer } = await import('../src/globe'); const container = document.createElement('div'); document.body.replaceChildren(container);
  const explorer = new LocationExplorer(container, vi.fn());
  const state = explorer as unknown as { loadBoundaries: (level: string) => Promise<void>; zoom: number; rotation: [number, number]; boundaries: Map<string, any>; boundaryParts: Map<string, unknown[]>; visibleBoundaries: (level: string, fallback: any) => any };
  await state.loadBoundaries('countries-10m'); state.zoom = 8;
  const full = state.boundaries.get('countries-10m');
  for (const rotation of [[123, -49], [-179, -20], [100, -80]] as [number, number][]) {
    state.rotation = rotation;
    const visible = state.visibleBoundaries('countries-10m', full);
    const path = geoPath(geoOrthographic().rotate(rotation).scale(255 * state.zoom).translate([450, 280]).clipAngle(90).precision(.2).clipExtent([[0, 0], [900, 560]]));
    expect(path(visible)).toBe(path(full));
    expect(visible.features.length).toBeLessThan(state.boundaryParts.get('countries-10m')!.length);
  }
});
