import { expect, it } from 'vitest';
import { bubbleRadius, groupLocations, makeLocationResolver, type Gazetteer } from '../src/location-model';
import type { Posting } from '../src/types';
const geography: Gazetteer = { version: 1, generatedAt: '', countryNames: { CA: 'Canada', US: 'United States' }, cities: [ ['Vancouver', 'Vancouver', 'CA', '02', 'British Columbia', -123.1, 49.3], ['Vancouver', 'Vancouver', 'US', 'WA', 'Washington', -122.7, 45.6], ['Montréal', 'Montreal', 'CA', '10', 'Québec', -73.6, 45.5] ] };
const row = (id: string, location: string) => ({ id, location }) as Posting;
it('resolves region-disambiguated names and accents without guessing vague locations', () => {
  const resolve = makeLocationResolver(geography);
  expect(resolve('Vancouver, BC')?.[2]).toBe('CA'); expect(resolve('Vancouver, WA')?.[2]).toBe('US');
  expect(resolve('Montreal, QC')?.[0]).toBe('Montréal');
  for (const location of ['Vancouver', 'Various Locations, BC', 'Remote', 'Vancouver / Montreal', 'Unknown, CA', '']) expect(resolve(location)).toBeUndefined();
});
it('groups city aliases, preserves source locations, and accounts for every posting once', () => {
  const grouped = groupLocations([row('1', 'Montreal, QC'), row('2', 'Montréal, Québec'), row('3', 'Various Locations'), row('4', 'Vancouver, BC')], makeLocationResolver(geography));
  expect(grouped.cities).toHaveLength(2); expect(grouped.cities[0].postings).toHaveLength(2); expect(grouped.cities[0].locations).toHaveLength(2); expect(grouped.unmapped).toHaveLength(1);
  expect(grouped.cities.reduce((count, city) => count + city.postings.length, 0) + grouped.unmapped.length).toBe(4);
});
it('scales bubble area proportionally to posting counts', () => {
  expect(bubbleRadius(4, 16) ** 2 / bubbleRadius(1, 16) ** 2).toBeCloseTo(4); expect(bubbleRadius(16, 16)).toBe(30);
});
it('accepts the explicit City canonical-name suffix without choosing among ambiguous names', () => {
  const data = { ...geography, cities: [...geography.cities, ['New York City', 'New York City', 'US', 'NY', 'New York', -74, 40.7] as Gazetteer['cities'][number]] };
  expect(makeLocationResolver(data)('New York, NY')?.[0]).toBe('New York City');
});

it('resolves missing separators, punctuation-only fields and canonical city variants', () => {
  const data: Gazetteer = { ...geography, cities: [...geography.cities,
    ['Victoria', 'Victoria', 'CA', '02', 'British Columbia', -123.3, 48.4],
    ['Toronto', 'Toronto', 'CA', '08', 'Ontario', -79.4, 43.7],
    ['Greater Sudbury', 'Greater Sudbury', 'CA', '08', 'Ontario', -81, 46.5],
    ['Québec', 'Quebec', 'CA', '10', 'Quebec', -71.2, 46.8],
  ] };
  const resolve = makeLocationResolver(data);
  expect(resolve('Victoria BC')?.[0]).toBe('Victoria');
  expect(resolve('Toronto. ON')?.[0]).toBe('Toronto');
  expect(resolve('Toronto, ON, .')?.[0]).toBe('Toronto');
  expect(resolve('Vancouver, BC, .')?.[2]).toBe('CA');
  expect(resolve('Sudbury, ON')?.[0]).toBe('Greater Sudbury');
  expect(resolve('Quebec City, QC')?.[0]).toBe('Québec');
  for (const text of ['Victoria BC & ON', 'Toronto, ON, Remote', 'Quebec City, BC', 'Various Locations, BC', 'Vancouver']) expect(resolve(text)).toBeUndefined();
});
