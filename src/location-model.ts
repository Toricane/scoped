import { locationParts } from './location-text';
import { greaterVancouverKey, greaterVancouverLabel, isGreaterVancouver } from './location-groups';
import type { Posting } from './types';
import { fold } from './viewer-model';
export type CityTuple = [name: string, ascii: string, country: string, admin: string, region: string, longitude: number, latitude: number];
export interface Gazetteer { version: number; generatedAt: string; countryNames: Record<string, string>; cities: CityTuple[]; }
export interface CityGroup { key: string; name: string; coordinates: [number, number]; postings: Posting[]; locations: string[]; }
const normalize = (value: string) => fold(value).replace(/\bst\.?\b/g, 'saint').replace(/[^a-z0-9]/g, '');
const provinces: Record<string, string> = { bc: 'British Columbia', ab: 'Alberta', sk: 'Saskatchewan', mb: 'Manitoba', on: 'Ontario', qc: 'Quebec', nb: 'New Brunswick', ns: 'Nova Scotia', pe: 'Prince Edward Island', nl: 'Newfoundland and Labrador', yt: 'Yukon', nt: 'Northwest Territories', nu: 'Nunavut' };
export function makeLocationResolver(data: Gazetteer): (text: string) => CityTuple | undefined {
  const names = new Map<string, CityTuple[]>();
  for (const city of data.cities) for (const name of new Set([normalize(city[0]), normalize(city[1])])) {
    if (!name) continue;
    const entries = names.get(name) ?? []; entries.push(city); names.set(name, entries);
  }
  const alias = (name: string, city: CityTuple) => {
    const key = normalize(name), entries = names.get(key) ?? [];
    if (!entries.includes(city)) entries.push(city); names.set(key, entries);
  };
  for (const city of data.cities) {
    if (/\sCity$/i.test(city[0])) alias(city[0].replace(/\sCity$/i, ''), city);
    else alias(city[0] + ' City', city);
    // Canadian canonical names such as Greater Sudbury have a shorter city form.
    if (city[2] === 'CA' && /^Greater\s/i.test(city[0])) alias(city[0].replace(/^Greater\s/i, ''), city);
  }
  const cache = new Map<string, CityTuple | undefined>();
  return text => {
    if (cache.has(text)) return cache.get(text);
    const parts = locationParts(text);
    let candidates = names.get(normalize(parts[0] ?? '')) ?? [];
    // Country/region hints must match exactly. Multiple cities and vague locations are not guessed.
    for (const part of parts.slice(1)) {
      const hint = normalize(part);
      candidates = candidates.filter(city => {
        const hints = [city[2], data.countryNames[city[2]] ?? '', city[3], city[4]];
        if (city[2] === 'CA' && provinces[hint]) hints.push(normalize(provinces[hint]) === normalize(city[4]) ? part : '');
        if (hint === 'uk' && city[2] === 'GB') hints.push('UK');
        if (hint === 'usa' && city[2] === 'US') hints.push('USA');
        return hints.some(value => normalize(value) === hint);
      });
    }
    const result = candidates.length === 1 ? candidates[0] : undefined;
    cache.set(text, result); return result;
  };
}
export function groupLocations(postings: Posting[], resolve: (location: string) => CityTuple | undefined, grouped = false): { cities: CityGroup[]; unmapped: Posting[] } {
  const groups = new Map<string, CityGroup>(), unmapped: Posting[] = [];
  for (const posting of postings) {
    const combined = grouped && isGreaterVancouver(posting.location);
    // Group membership is explicit; an unqualified North Vancouver can still use
    // the group's Vancouver centre when its standalone city name is ambiguous.
    const city = resolve(posting.location) ?? (combined ? resolve('Vancouver, BC') : undefined);
    if (!city) { unmapped.push(posting); continue; }
    const centre = combined ? resolve('Vancouver, BC') ?? city : city;
    const key = combined ? greaterVancouverKey : `${city[2]}:${city[3]}:${city[5]}:${city[6]}`;
    const group = groups.get(key) ?? { key, name: combined ? greaterVancouverLabel : `${city[0]}, ${city[4] || city[2]}`, coordinates: [centre[5], centre[6]], postings: [], locations: [] };
    group.postings.push(posting); if (!group.locations.includes(posting.location)) group.locations.push(posting.location); groups.set(key, group);
  }
  return { cities: [...groups.values()].sort((a, b) => b.postings.length - a.postings.length || a.name.localeCompare(b.name)), unmapped };
}
export const bubbleRadius = (count: number, largest: number, maxRadius = 30): number => maxRadius * Math.sqrt(count / Math.max(1, largest));
