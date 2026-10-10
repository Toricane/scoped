import { beforeEach, describe, expect, it } from 'vitest';
import { relativeDeadlineTime, relativeDeadline, isExpired, deadline, defaults, indexPostings, positionTitle, readPreferences, selectPostings, validateSnapshot } from '../src/viewer-model';
import { parsePage } from '../src/parser';
import { SOURCE_URL, type Posting, type Snapshot } from '../src/types';
import { loadFixture } from './helpers';

let rows: Posting[];
beforeEach(() => { loadFixture(); rows = parsePage(document).postings; });
const select = (preferences = defaults()) => selectPostings(indexPostings(rows), preferences).map(row => row.id);
describe('local viewer queries', () => {
  it('removes only the posting-ID suffix for display and leaves source titles intact', () => {
    expect(positionTitle(rows[0])).toBe('W27 Backend Engineer — Python + FastAPI');
    expect(positionTitle(rows[1])).toBe('W27 Research Intern, “Tools” E1');
    expect(positionTitle({ ...rows[0], jobTitle: 'Engineer (40982) 1001B' })).toBe('Engineer (40982)');
    expect(positionTitle({ ...rows[0], jobTitle: 'Engineer 9999' })).toBe('Engineer 9999');
    expect(rows[0].jobTitle).toContain('1001');
    expect(select({ ...defaults(), query: '1001', scope: 'title' })).toEqual([]);
    expect(select({ ...defaults(), query: '1001' })).toEqual(['1001']);
  });
  it('combines terms, phrases, accents, exclusions, and title-only scope', () => {
    expect(select({ ...defaults(), query: 'research montreal' })).toEqual(['1002']);
    expect(select({ ...defaults(), query: '"Python + FastAPI"' })).toEqual(['1001']);
    expect(select({ ...defaults(), query: 'Vancouver', scope: 'title' })).toEqual([]);
    expect(select({ ...defaults(), exclude: 'research "product designer"' })).toEqual(['1001']);
  });
  it('uses OR within a facet and AND across facets and flags, including blank status', () => {
    expect(select({ ...defaults(), locations: ['Vancouver, BC', 'Montréal, QC'], isNew: 'yes', shortlisted: 'no' })).toEqual(['1002']);
    expect(select({ ...defaults(), statuses: [''], isNew: 'no' })).toEqual(['1003']);
    expect(select({ ...defaults(), organizations: ['Missing organization'] })).toEqual([]);
  });
  it('filters counts numerically and distinguishes unknown from zero', () => {
    expect(select({ ...defaults(), max: '0' })).toEqual(['1001']);
    expect(select({ ...defaults(), min: '1' })).toEqual(['1002']);
  });
  it('sorts numeric values and IDs with deterministic ties and blanks last both ways', () => {
    rows[0].applications = 2; rows[1].applications = 10;
    expect(select({ ...defaults(), sort: 'applications' })).toEqual(['1001', '1002', '1003']);
    expect(select({ ...defaults(), sort: 'applications', direction: 'desc' })).toEqual(['1002', '1001', '1003']);
    rows[0].id = '9'; rows[1].id = '100'; rows[2].id = '9007199254740993';
    expect(select({ ...defaults(), sort: 'id' })).toEqual(['9', '100', '9007199254740993']);
    rows.forEach(row => { row.organization = 'Same'; });
    expect(select({ ...defaults(), sort: 'organization' })).toEqual(['9007199254740993', '100', '9']);
  });
  it('filters calendar dates inclusively and places unknown deadlines last', () => {
    expect(select({ ...defaults(), from: '2026-10-16', to: '2026-10-16' })).toEqual(['1001']);
    expect(select({ ...defaults(), sort: 'deadlineText', direction: 'desc' })).toEqual(['1002', '1001', '1003']);
    expect(select({ ...defaults(), unknownDeadline: true })).toEqual(['1003']);
  });
  it('handles leap days and AM/PM without guessing a timezone', () => {
    expect(deadline('Feb 29, 2028 12:00 AM')).toEqual({ key: 202802290000, date: '2028-02-29' });
    expect(deadline('Feb 29, 2028 12:00 PM')?.key).toBe(202802291200);
    for (const text of ['', 'Feb 29, 2027 09:00 AM', 'Oct 32, 2026 09:00 AM', 'Oct 12, 2026 13:00 AM', 'Oct 12, 2026 09:60 AM', 'unknown']) expect(deadline(text)).toBeUndefined();
  });
  it('does not change source values or array order while filtering and sorting', () => {
    const original = structuredClone(rows); select({ ...defaults(), query: 'python', direction: 'desc' }); expect(rows).toEqual(original);
  });
});
describe('snapshot and preferences compatibility', () => {
  it('restores validated filter-option orders and defaults older preferences safely', () => {
    expect(readPreferences({ version: 1 }).facetOrder).toEqual(defaults().facetOrder);
    expect(readPreferences({ version: 1, facetOrder: { organizations: 'count', locations: 'selected', statuses: 'bad', terms: 'za' } }).facetOrder).toEqual({ organizations: 'count', locations: 'selected', statuses: 'az', terms: 'za' });
  });
  const snapshot = (): Snapshot => ({ schemaVersion: 1, collectedAt: '2026-10-10T00:00:00Z', sourceUrl: SOURCE_URL, reportedTotal: rows.length, postings: rows });
  it('accepts earlier snapshots with no links and rejects inconsistent or unsafe data', () => {
    rows.forEach(row => { delete row.postingLink; });
    expect(validateSnapshot(snapshot())).toEqual(snapshot());
    expect(() => validateSnapshot({ ...snapshot(), reportedTotal: 2 })).toThrow('invalid');
    rows[0].postingLink = { kind: 'url', url: 'javascript:alert(1)' };
    expect(() => validateSnapshot(snapshot())).toThrow('invalid');
    delete rows[0].postingLink; rows[1].id = rows[0].id;
    expect(() => validateSnapshot(snapshot())).toThrow('invalid');
  });
  it('sanitizes preferences and keeps title visible, including unavailable facet selections', () => {
    expect(readPreferences({ version: 1, columns: ['unknown', 'location'], pageSize: 999, sort: '__proto__', organizations: ['Old organization', 5], isNew: 'bad' })).toMatchObject({ columns: ['jobTitle', 'location'], pageSize: 1000, sort: 'deadlineText', organizations: ['Old organization'], isNew: 'all' });
    expect(readPreferences({ version: 2 })).toEqual(defaults());
  });
});

it('interprets same-day deadlines in local time, including noon and midnight', () => {
  expect(isExpired('Oct 10, 2026 09:00 AM', new Date(2026, 9, 10, 8, 59))).toBe(false);
  expect(isExpired('Oct 10, 2026 09:00 AM', new Date(2026, 9, 10, 9, 0))).toBe(true);
  expect(isExpired('Oct 10, 2026 12:00 PM', new Date(2026, 9, 10, 11, 59))).toBe(false);
  expect(isExpired('Oct 10, 2026 12:00 AM', new Date(2026, 9, 10, 0, 0))).toBe(true);
  expect(isExpired('unknown', new Date())).toBe(false);
});
it('deprioritizes expired positions independently of sort direction and supports hiding', () => {
  rows[0].deadlineText = 'Oct 10, 2026 09:00 AM'; rows[1].deadlineText = 'Oct 11, 2026 09:00 AM';
  const now = new Date(2026, 9, 10, 10);
  const result = selectPostings(indexPostings(rows), { ...defaults(), sort: 'id', direction: 'desc' }, now);
  expect(result.at(-1)!.id).toBe('1001');
  expect(selectPostings(indexPostings(rows), { ...defaults(), hideExpired: true }, now).some(row => row.id === '1001')).toBe(false);
  expect(readPreferences({ version: 1 }).expiredLast).toBe(true);
});

it('formats only future deadlines within two weeks while preserving absolute fallback', () => {
  const now = new Date(2026, 9, 10, 9);
  expect(relativeDeadline('Oct 13, 2026 09:00 AM', now)).toBe('in 3 days');
  expect(relativeDeadline('Oct 10, 2026 11:00 AM', now)).toBe('in 2 hours');
  expect(relativeDeadline('Oct 10, 2026 09:30 AM', now)).toBe('in 30 minutes');
  expect(relativeDeadline('Oct 10, 2026 09:01 AM', new Date(2026, 9, 10, 9, 0, 30))).toBe('in less than a minute');
  expect(relativeDeadline('Oct 24, 2026 09:00 AM', now)).toBe('in 14 days');
  for (const text of ['Oct 24, 2026 09:01 AM', 'Oct 10, 2026 09:00 AM', 'Oct 9, 2026 09:00 AM', 'unknown']) expect(relativeDeadline(text, now)).toBeUndefined();
  expect(readPreferences({ version: 1 }).relativeDeadlines).toBe(false);
  expect(readPreferences({ version: 1, relativeDeadlines: true }).relativeDeadlines).toBe(true);
});

it('provides relative hover counterparts for past and distant dates without changing display eligibility', () => {
  const now = new Date(2026, 9, 10, 9);
  expect(relativeDeadlineTime('Oct 7, 2026 09:00 AM', now)).toBe('3 days ago');
  expect(relativeDeadlineTime('Oct 30, 2026 09:00 AM', now)).toBe('in 20 days');
  expect(relativeDeadlineTime('Oct 10, 2026 09:00 AM', now)).toBe('due now');
  expect(relativeDeadlineTime('unknown', now)).toBeUndefined();
  expect(relativeDeadline('Oct 30, 2026 09:00 AM', now)).toBeUndefined();
});

 it.each(['organization', 'division', 'location', 'id'] as const)('searches and excludes only %s, with compatible preferences', scope => {
   const posting = { ...rows[0], organization: 'OrgToken', division: 'DivisionToken', location: 'LocationToken', id: '987654' };
   const prefs = readPreferences({ ...defaults(), scope, query: posting[scope] });
   expect(prefs.scope).toBe(scope);
   expect(selectPostings(indexPostings([posting]), prefs)).toEqual([posting]);
   expect(selectPostings(indexPostings([posting]), { ...prefs, exclude: posting[scope] })).toEqual([]);
   expect(selectPostings(indexPostings([posting]), { ...prefs, query: 'Backend' })).toEqual([]);
   expect(selectPostings(indexPostings([posting]), { ...prefs, exclude: 'Backend' })).toEqual([posting]);
 });
