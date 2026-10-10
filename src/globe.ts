import { geoBounds, geoDistance, geoGraticule10, geoOrthographic, geoNaturalEarth1, geoPath, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology, GeometryCollection } from 'topojson-specification';
import { api } from './api';
import type { Posting } from './types';
import { bubbleRadius, groupLocations, makeLocationResolver, type Gazetteer, type CityGroup } from './location-model';

const ns = 'http://www.w3.org/2000/svg';
const svgNode = (name: string, attrs: Record<string, string> = {}) => { const el = document.createElementNS(ns, name); for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value); return el; };
export class LocationExplorer {
  private postings: Posting[] = [];
  private grouped = false;
  private resolver?: ReturnType<typeof makeLocationResolver>;
  private land?: ReturnType<typeof feature>;
  private boundaryParts = new Map<string, { feature: Feature; bounds: [[number, number], [number, number]] }[]>();
  private boundaries = new Map<string, ReturnType<typeof feature>>();
  private pendingBoundaries = new Set<string>();
  private failedBoundaries = new Set<string>();
  private detailStatus = document.createElement('p');
  private svg = svgNode('svg', { viewBox: '0 0 900 560', role: 'group', 'aria-label': 'Posting locations. Drag to rotate or move. Scroll to zoom. City circles open matching results.', tabindex: '0' });
  private canvas = document.createElement('div');
  private info = document.createElement('p');
  private cityList = document.createElement('div');
  private tooltip = document.createElement('p');
  private flat = false;
  private zoom = 1;
  private rotation: [number, number] = [100, -40];
  private offset: [number, number] = [0, 0];
  private drag?: { x: number; y: number; rotation: [number, number]; offset: [number, number] };
  private cities: CityGroup[] = [];
  private hovered?: string;
  private hoverLabel = svgNode('text', { class: 'city-hover-label', 'pointer-events': 'none' });
  constructor(private container: HTMLElement, private select: (locations: string[]) => void) {
    container.className = 'location-explorer';
    const controls = document.createElement('div'); controls.className = 'map-controls';
    const button = (label: string, callback: () => void) => { const b = document.createElement('button'); b.textContent = label; b.className = 'secondary'; b.addEventListener('click', callback); controls.append(b); return b; };
    const switcher = button('Flat map', () => { this.flat = !this.flat; switcher.textContent = this.flat ? 'Globe' : 'Flat map'; this.zoom = 1; this.offset = [0, 0]; this.draw(); });
    button('Zoom in +', () => this.setZoom(this.zoom * 1.3));
    button('Zoom out −', () => this.setZoom(this.zoom / 1.3));
    button('Reset view', () => { this.zoom = 1; this.rotation = [100, -40]; this.offset = [0, 0]; this.draw(); });
    const instructions = document.createElement('p'); instructions.className = 'help'; instructions.textContent = 'Drag to rotate · Scroll or use + / − to zoom · Arrow keys move · Click a city to see its postings. Circle area is proportional to posting count.';
    this.info.className = 'help'; this.info.textContent = 'Loading bundled geography…'; this.info.setAttribute('role', 'status');
    this.canvas.className = 'globe-canvas'; this.canvas.append(this.svg);
    this.tooltip.className = 'map-tooltip'; this.tooltip.textContent = 'Choose a city circle or the city list below.'; this.tooltip.setAttribute('role', 'status');
    this.cityList.className = 'map-city-list';
    const credit = document.createElement('p'); credit.className = 'help'; credit.append('Approximate city centres · ');
    for (const [label, url] of [['GeoNames', 'https://www.geonames.org/'], ['CC BY 4.0', 'https://creativecommons.org/licenses/by/4.0/'], ['Natural Earth', 'https://www.naturalearthdata.com/']]) {
      const link = document.createElement('a'); link.href = url; link.textContent = label; link.target = '_blank'; link.rel = 'noopener'; credit.append(link, ' · ');
    }
    credit.append('Bundled geography; no geocoding requests.');
    this.detailStatus.className = 'help'; this.detailStatus.setAttribute('role', 'status'); this.detailStatus.hidden = true;
    container.append(controls, instructions, this.info, this.detailStatus, this.canvas, this.tooltip, this.cityList, credit);
    this.svg.addEventListener('pointerdown', event => {
      const e = event as PointerEvent; if (e.button !== 0 || (e.target as Element).closest('.city-bubble')) return;
      this.drag = { x: e.clientX, y: e.clientY, rotation: [...this.rotation], offset: [...this.offset] };
      (this.svg as SVGSVGElement).setPointerCapture?.(e.pointerId);
    });
    this.svg.addEventListener('pointermove', event => {
      if (!this.drag) return; const e = event as PointerEvent;
      const bounds = this.svg.getBoundingClientRect(); const dx = (e.clientX - this.drag.x) * 900 / Math.max(1, bounds.width), dy = (e.clientY - this.drag.y) * 560 / Math.max(1, bounds.height);
      if (this.flat) this.offset = [this.drag.offset[0] + dx, this.drag.offset[1] + dy];
      else this.rotation = [this.drag.rotation[0] + dx / (3 * this.zoom), Math.max(-85, Math.min(85, this.drag.rotation[1] - dy / (3 * this.zoom)))];
      this.draw();
    });
    this.svg.addEventListener('pointerup', () => { this.drag = undefined; }); this.svg.addEventListener('pointercancel', () => { this.drag = undefined; });
    this.svg.addEventListener('wheel', event => {
      const e = event as WheelEvent; e.preventDefault();
      const matrix = (this.svg as SVGSVGElement).getScreenCTM?.();
      const point = matrix && typeof DOMPoint !== 'undefined' ? new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse()) : undefined;
      this.setZoom(this.zoom * Math.exp(-e.deltaY * .001), point ? [point.x, point.y] : undefined);
    }, { passive: false });
    this.svg.addEventListener('keydown', event => {
      const e = event as KeyboardEvent; if ((e.target as Element).closest('.city-bubble')) return;
      if (e.key === '+' || e.key === '=') this.zoom = Math.min(80, this.zoom * 1.3);
      else if (e.key === '-') this.zoom = Math.max(.7, this.zoom / 1.3);
      else if (e.key.startsWith('Arrow')) {
        const dx = e.key === 'ArrowLeft' ? -10 : e.key === 'ArrowRight' ? 10 : 0, dy = e.key === 'ArrowUp' ? 10 : e.key === 'ArrowDown' ? -10 : 0;
        if (this.flat) this.offset = [this.offset[0] + dx * 4, this.offset[1] + dy * 4]; else this.rotation = [this.rotation[0] + dx / this.zoom, Math.max(-85, Math.min(85, this.rotation[1] + dy / this.zoom))];
      } else return;
      e.preventDefault(); this.draw();
    });
    void this.load();
  }
  private async load(): Promise<void> {
    try {
      const read = async (name: string) => { const response = await fetch(api.runtime.getURL(`maps/${name}.json`)); if (!response.ok) throw new Error('Bundled geography could not load. Reload the extension.'); return response.json(); };
      const [cities, topology] = await Promise.all([read('cities'), read('countries')]);
      if (!Array.isArray(cities.files) || !cities.files.every((file: unknown) => typeof file === 'string' && /^cities-\d+\.json$/.test(file))) throw new Error('Bundled city index is invalid. Reload the extension.');
      const chunks = await Promise.all(cities.files.map((file: string) => read(file.replace(/\.json$/, ''))));
      this.resolver = makeLocationResolver({ ...cities, cities: chunks.flat() } as Gazetteer);
      const world = topology as Topology<{ countries: GeometryCollection }>;
      this.land = feature(world, world.objects.countries);
      this.boundaries.set('countries', this.land);
      this.update(this.postings, this.grouped);
    } catch (error) { this.info.textContent = error instanceof Error ? error.message : String(error); }
  }
  update(postings: Posting[], grouped = false): void {
    this.postings = postings; this.grouped = grouped; if (!this.resolver) return;
    const { cities, unmapped } = groupLocations(postings, this.resolver, grouped); this.cities = cities;
    this.info.textContent = `${postings.length - unmapped.length} mapped postings · ${cities.length} cities · ${unmapped.length} unmapped (ambiguous, broad, or absent from the gazetteer)`;
    this.cityList.replaceChildren();
    const group = (name: string, locations: string[], count: number, city?: CityGroup) => {
      const button = document.createElement('button'); button.className = 'secondary'; button.textContent = `${name} · ${count}`;
      button.addEventListener('click', () => this.select(locations)); this.cityList.append(button);
      if (city) button.title = 'Show postings in this city';
    };
    for (const city of cities) group(city.name, city.locations, city.postings.length, city);
    if (unmapped.length) {
      const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = `Unmapped locations (${unmapped.length} postings)`; details.append(summary);
      const counts = new Map<string, number>(); unmapped.forEach(row => counts.set(row.location, (counts.get(row.location) ?? 0) + 1));
      for (const [location, count] of [...counts].sort((a, b) => b[1] - a[1])) {
        const button = document.createElement('button'); button.className = 'secondary'; button.textContent = `${location || 'Blank location'} · ${count}`; button.addEventListener('click', () => this.select([location])); details.append(button);
      }
      this.cityList.append(details);
    }
    this.draw();
  }
  private boundaryLevel(): string { return this.zoom >= 6 ? 'countries-10m' : this.zoom >= 2 ? 'countries-50m' : 'countries'; }
  private async loadBoundaries(level: string): Promise<void> {
    this.pendingBoundaries.add(level);
    try {
      const response = await fetch(api.runtime.getURL(`maps/${level}.json`));
      if (!response.ok) throw new Error('Map detail unavailable');
      const world = await response.json() as Topology<{ countries: GeometryCollection }>;
      const geometry = feature(world, world.objects.countries);
      this.boundaries.set(level, geometry);
      const parts = geometry.features.flatMap(item => item.geometry.type === 'MultiPolygon'
        ? item.geometry.coordinates.map(coordinates => ({ type: 'Feature' as const, properties: item.properties, geometry: { type: 'Polygon' as const, coordinates } })) : [item]);
      this.boundaryParts.set(level, parts.map(item => ({ feature: item, bounds: geoBounds(item) })));
    } catch { this.failedBoundaries.add(level); }
    finally { this.pendingBoundaries.delete(level); this.draw(); }
  }
  /** Cull offscreen islands/countries before streaming high-detail coordinates. */
  private visibleBoundaries(level: string, fallback: ReturnType<typeof feature>): ReturnType<typeof feature> | FeatureCollection<Geometry> {
    const parts = this.boundaryParts.get(level);
    if (this.flat || this.zoom < 2 || !parts) return fallback;
    const radians = Math.PI / 180, longitude = ((-this.rotation[0] + 540) % 360) - 180, latitude = -this.rotation[1];
    const radius = Math.asin(Math.min(1, Math.hypot(450, 280) / (255 * this.zoom))) / radians + .5;
    const crossesPole = Math.abs(latitude) + radius >= 90;
    const halfWidth = crossesPole ? 180 : Math.asin(Math.min(1, Math.sin(radius * radians) / Math.cos(latitude * radians))) / radians;
    const intervals = (min: number, max: number): [number, number][] => min > max ? [[min, 180], [-180, max]] : [[min, max]];
    const low = longitude - halfWidth, high = longitude + halfWidth;
    const visible = low < -180 ? [[low + 360, 180], [-180, high]] : high > 180 ? [[low, 180], [-180, high - 360]] : [[low, high]];
    const features = parts.filter(({ bounds: [[west, south], [east, north]] }) => north >= latitude - radius && south <= latitude + radius
      && (crossesPole || intervals(west, east).some(([a, b]) => visible.some(([c, d]) => a <= d && b >= c)))).map(item => item.feature);
    return { type: 'FeatureCollection', features };
  }
  private projection(): GeoProjection {
    return this.flat ? geoNaturalEarth1().scale(155 * this.zoom).translate([450 + this.offset[0], 280 + this.offset[1]]) : geoOrthographic().rotate(this.rotation).scale(255 * this.zoom).translate([450, 280]).clipAngle(90);
  }
  private setZoom(next: number, anchor?: [number, number]): void {
    const previous = this.zoom, location = anchor ? this.projection().invert?.(anchor) : undefined;
    this.zoom = Math.max(.7, Math.min(80, next));
    if (anchor && this.flat) {
      const ratio = this.zoom / previous;
      this.offset = [anchor[0] - 450 - (anchor[0] - 450 - this.offset[0]) * ratio, anchor[1] - 280 - (anchor[1] - 280 - this.offset[1]) * ratio];
    } else if (anchor && location?.every(Number.isFinite)) {
      // Preserve the geographic point under the wheel cursor as the sphere expands.
      for (let iteration = 0; iteration < 4; iteration++) {
        const current = this.projection().invert?.(anchor); if (!current?.every(Number.isFinite)) break;
        const longitude = ((current[0] - location[0] + 540) % 360) - 180;
        this.rotation = [this.rotation[0] + longitude, Math.max(-85, Math.min(85, this.rotation[1] + current[1] - location[1]))];
      }
    }
    this.draw();
  }
  private showCity(city: CityGroup, point: [number, number], radius: number): void {
    this.hovered = city.key;
    this.tooltip.textContent = `${city.name} · ${city.postings.length} postings`;
    const bounds = this.svg.getBoundingClientRect();
    const scale = Math.min(bounds.width / 900, bounds.height / 560) || 1;
    const font = 13 / scale, width = Math.min(870, city.name.length * font * .62);
    let x = point[0] + radius + 10 / scale, anchor = 'start';
    if (x + width > 885) { x = point[0] - radius - 10 / scale; anchor = 'end'; }
    if (x - width < 15 && anchor === 'end') { x = 450; anchor = 'middle'; }
    const y = Math.max(font + 8, Math.min(540 - font, point[1] - font * .3));
    this.hoverLabel.replaceChildren(); this.hoverLabel.setAttribute('x', String(x)); this.hoverLabel.setAttribute('y', String(y)); this.hoverLabel.setAttribute('text-anchor', anchor);
    this.hoverLabel.setAttribute('font-size', String(font)); this.hoverLabel.setAttribute('stroke-width', String(3 / scale));
    const name = svgNode('tspan', { x: String(x) }); name.textContent = city.name;
    const count = svgNode('tspan', { x: String(x), dy: String(font * 1.45) }); count.textContent = `${city.postings.length} ${city.postings.length === 1 ? 'posting' : 'postings'}`;
    this.hoverLabel.append(name, count); this.svg.append(this.hoverLabel);
  }
  private draw(): void {
    if (!this.land) return;
    const level = this.boundaryLevel();
    if (!this.boundaries.has(level) && !this.pendingBoundaries.has(level) && !this.failedBoundaries.has(level)) void this.loadBoundaries(level);
    const boundaries = this.boundaries.get(level) ?? (this.zoom >= 2 ? this.boundaries.get('countries-50m') : undefined) ?? this.land;
    this.detailStatus.hidden = this.boundaries.has(level);
    this.detailStatus.textContent = this.failedBoundaries.has(level) ? 'Detailed map unavailable. Showing the overview; reload Scoped to retry.' : 'Loading finer map detail…';
    this.svg.setAttribute('data-detail', this.boundaries.has(level) ? level : this.boundaries.has('countries-50m') && this.zoom >= 2 ? 'countries-50m' : 'countries');
    const projection = this.projection();
    projection.precision(.2);
    projection.clipExtent([[0, 0], [900, 560]]);
    const path = geoPath(projection); this.svg.replaceChildren();
    this.svg.append(svgNode('path', { d: path({ type: 'Sphere' }) ?? '', class: 'map-ocean' }));
    this.svg.append(svgNode('path', { d: path(this.visibleBoundaries(this.svg.getAttribute('data-detail')!, boundaries)) ?? '', class: 'map-land' }));
    this.svg.append(svgNode('path', { d: path(geoGraticule10()) ?? '', class: 'map-grid' }));
    const centre: [number, number] = [-this.rotation[0], -this.rotation[1]], largest = Math.max(1, ...this.cities.map(city => city.postings.length));
    // Large bubbles first so small neighbouring cities remain clickable on top.
    for (const city of this.cities) {
      if (!this.flat && geoDistance(city.coordinates, centre) > Math.PI / 2) continue;
      const point = projection(city.coordinates); if (!point) continue;
      const count = city.postings.length;
      const radius = bubbleRadius(count, largest);
      if (point[0] + radius < 0 || point[0] - radius > 900 || point[1] + radius < 0 || point[1] - radius > 560) continue;
      const circle = svgNode('circle', { cx: String(point[0]), cy: String(point[1]), r: String(radius), class: 'city-bubble', 'data-city-key': city.key, tabindex: '0', role: 'button', 'aria-label': `${city.name}: ${count} postings. Show in list.` });
      circle.addEventListener('pointerenter', () => this.showCity(city, point, radius));
      circle.addEventListener('focus', () => this.showCity(city, point, radius));
      const clear = () => { if (this.hovered === city.key) { this.hovered = undefined; this.hoverLabel.remove(); } };
      circle.addEventListener('pointerleave', clear); circle.addEventListener('blur', clear);
      circle.addEventListener('click', () => this.select(city.locations));
      circle.addEventListener('keydown', event => { const e = event as KeyboardEvent; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.select(city.locations); } });
      this.svg.append(circle);
    }
    const hovered = this.cities.find(city => city.key === this.hovered);
    if (hovered) { const point = projection(hovered.coordinates); if (point && this.svg.querySelector(`[data-city-key="${hovered.key}"]`)) this.showCity(hovered, point, bubbleRadius(hovered.postings.length, largest)); }
  }
}
