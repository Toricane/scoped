import { expect, it } from 'vitest';
import { greaterVancouverCities, greaterVancouverKey, isGreaterVancouver, regroupSelections } from '../src/location-groups';
import { defaults, indexPostings, readPreferences, selectPostings } from '../src/viewer-model';
import { groupLocations, makeLocationResolver, type Gazetteer } from '../src/location-model';
import type { Posting } from '../src/types';
const row = (id: string, location: string) => ({ id, location, jobTitle: 'Engineer', organization: '', division: '', term: '', applicationStatus: '', applications: 0, isNew: false, shortlisted: false, deadlineText: '' }) as Posting;
it('groups exactly the six requested BC cities, excluding ambiguous or other-province locations', () => {
  for (const city of greaterVancouverCities) expect(isGreaterVancouver(`${city}, BC`)).toBe(true);
  expect(isGreaterVancouver(' north vancouver , British Columbia, Canada')).toBe(true);
  expect(isGreaterVancouver('North Vancouver')).toBe(true);
  expect(isGreaterVancouver('Vancouver, BC, .')).toBe(true);
  expect(isGreaterVancouver('Vancouver BC')).toBe(true);
  expect(isGreaterVancouver('North Vancouver, WA')).toBe(false);
  for (const text of ['Vancouver, WA', 'Richmond, VA', 'Surrey, UK', 'Vancouver', 'Various Locations, BC', 'West Vancouver, BC', 'Vancouver / Burnaby, BC', 'Delta, BC, USA']) expect(isGreaterVancouver(text)).toBe(false);
});
it('widens member selections when enabled and restores explicit source choices when disabled', () => {
  const available = ['Vancouver, BC', 'Burnaby, BC', 'Richmond, VA'];
  const selected = regroupSelections(['Vancouver, BC', 'Burnaby, BC', 'Richmond, VA'], true, available);
  expect(selected).toEqual([greaterVancouverKey, 'Richmond, VA']);
  expect(regroupSelections(selected, false, available)).toEqual(available);
});
it('applies the group together with other filters and leaves raw locations intact', () => {
  const rows = [row('1', 'Vancouver, BC'), row('2', 'Surrey, BC'), row('3', 'Vancouver, WA')];
  const prefs = { ...defaults(), groupGreaterVancouver: true, locations: [greaterVancouverKey] };
  expect(selectPostings(indexPostings(rows), prefs).map(row => row.id).sort()).toEqual(['1', '2']);
  expect(selectPostings(indexPostings(rows), { ...prefs, query: 'Surrey' }).map(row => row.id)).toEqual(['2']);
  expect(rows[1].location).toBe('Surrey, BC');
  expect(readPreferences({ version: 1 }).groupGreaterVancouver).toBe(false);
  expect(readPreferences(prefs).groupGreaterVancouver).toBe(true);
});
it('combines globe counts and source selections without losing or double-counting postings', () => {
  const data: Gazetteer = { version: 1, generatedAt: '', countryNames: { CA: 'Canada' }, cities: [
    ['Vancouver', 'Vancouver', 'CA', '02', 'British Columbia', -123.1, 49.3],
    ['Burnaby', 'Burnaby', 'CA', '02', 'British Columbia', -122.9, 49.2],
  ] };
  const resolve = makeLocationResolver(data), rows = [row('1', 'Vancouver, BC'), row('2', 'Burnaby, BC'), row('3', 'Remote')];
  const result = groupLocations(rows, resolve, true);
  expect(result.cities).toHaveLength(1); expect(result.cities[0].name).toBe('Greater Vancouver');
  expect(result.cities[0].postings).toHaveLength(2); expect(result.cities[0].locations).toEqual(['Vancouver, BC', 'Burnaby, BC']);
  expect(result.cities[0].coordinates).toEqual([-123.1, 49.3]); expect(result.unmapped).toHaveLength(1);
  expect(groupLocations(rows, resolve).cities).toHaveLength(2);
});

it('includes both province-free North Vancouver rows in grouped filtering and globe counts', () => {
  const rows = [row('1', 'Vancouver, BC'), row('2', 'North Vancouver'), row('3', 'North Vancouver')];
  const prefs = { ...defaults(), groupGreaterVancouver: true, locations: [greaterVancouverKey] };
  expect(selectPostings(indexPostings(rows), prefs)).toHaveLength(3);
  const data: Gazetteer = { version: 1, generatedAt: '', countryNames: { CA: 'Canada' }, cities: [
    ['Vancouver', 'Vancouver', 'CA', '02', 'British Columbia', -123.1, 49.3],
  ] };
  const grouped = groupLocations(rows, makeLocationResolver(data), true);
  expect(grouped.cities).toHaveLength(1); expect(grouped.cities[0].postings).toHaveLength(3);
  expect(grouped.cities[0].locations).toEqual(['Vancouver, BC', 'North Vancouver']); expect(grouped.unmapped).toHaveLength(0);
  expect(regroupSelections([greaterVancouverKey], false, rows.map(row => row.location))).toEqual(['Vancouver, BC', 'North Vancouver']);
  expect(rows[1].location).toBe('North Vancouver');
});
