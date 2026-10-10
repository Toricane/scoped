import { greaterVancouverKey, isGreaterVancouver } from './location-groups';
import { isSourceUrl, type Posting, type Snapshot } from './types';

export const columnLabels = { jobTitle: 'Job title', organization: 'Organization', location: 'Location', deadlineText: 'Deadline', applications: 'Applications', isNew: 'New on SCOPE', shortlisted: 'SCOPE shortlist', id: 'ID', term: 'Term', division: 'Division', applicationStatus: 'Application status' };
export type Column = keyof typeof columnLabels;
export const defaultColumns: Column[] = ['jobTitle', 'organization', 'location', 'deadlineText', 'applications'];
export const searchScopes = ['all', 'title', 'organization', 'division', 'location', 'id'] as const;
export type SearchScope = typeof searchScopes[number];
type Flag = 'all' | 'yes' | 'no';
export interface Preferences {
  version: 1; query: string; exclude: string; scope: SearchScope; searchMode: 'keyword' | 'semantic';
  groupGreaterVancouver: boolean; organizations: string[]; locations: string[]; statuses: string[]; terms: string[];
  facetOrder: Record<'organizations' | 'locations' | 'statuses' | 'terms', FacetOrder>;
  isNew: Flag; shortlisted: Flag; from: string; to: string; unknownDeadline: boolean; hideExpired: boolean; expiredLast: boolean; relativeDeadlines: boolean;
  min: string; max: string; sort: Column | 'relevance'; direction: 'asc' | 'desc'; pageSize: 25 | 50 | 100 | 1000; columns: Column[];
}
export const preferencesKey = 'viewerPreferences:v1';
export type FacetOrder = 'az' | 'za' | 'count' | 'selected';
/** Presentation only: retain employer requisition numbers and source export text. */
export function positionTitle(posting: Posting): string {
  return posting.jobTitle.replace(new RegExp(`\\s+${posting.id}[A-Za-z]*(?=\\s+E\\d+\\s*$|\\s*$)`), '').trim() || posting.jobTitle;
}
export function defaults(): Preferences {
  return { version: 1, query: '', exclude: '', scope: 'all', searchMode: 'keyword', groupGreaterVancouver: false, organizations: [], locations: [], statuses: [], terms: [], facetOrder: { organizations: 'az', locations: 'az', statuses: 'az', terms: 'az' }, isNew: 'all', shortlisted: 'all', from: '', to: '', unknownDeadline: false, hideExpired: false, expiredLast: true, relativeDeadlines: false, min: '', max: '', sort: 'deadlineText', direction: 'asc', pageSize: 1000, columns: [...defaultColumns] };
}
export function readPreferences(value: unknown): Preferences {
  const result = defaults();
  if (!value || typeof value !== 'object' || (value as Preferences).version !== 1) return result;
  const stored = value as Record<string, unknown>;
  if (stored.facetOrder && typeof stored.facetOrder === 'object') {
    for (const key of ['organizations', 'locations', 'statuses', 'terms'] as const) {
      const order = (stored.facetOrder as Record<string, unknown>)[key];
      if (['az', 'za', 'count', 'selected'].includes(String(order))) result.facetOrder[key] = order as FacetOrder;
    }
  }
  for (const key of ['query', 'exclude', 'from', 'to', 'min', 'max'] as const) if (typeof stored[key] === 'string') result[key] = (stored[key] as string).slice(0, 2000);
  for (const key of ['organizations', 'locations', 'statuses', 'terms'] as const) if (Array.isArray(stored[key])) result[key] = [...new Set((stored[key] as unknown[]).filter((entry): entry is string => typeof entry === 'string'))];
  for (const key of ['isNew', 'shortlisted'] as const) if (['all', 'yes', 'no'].includes(String(stored[key]))) result[key] = stored[key] as Flag;
  if (searchScopes.includes(stored.scope as SearchScope)) result.scope = stored.scope as SearchScope;
  if (stored.searchMode === 'semantic') result.searchMode = 'semantic';
  if (stored.direction === 'desc') result.direction = 'desc';
  if (typeof stored.sort === 'string' && Object.hasOwn(columnLabels, stored.sort)) result.sort = stored.sort as Column;
  if (stored.sort === 'relevance' && result.searchMode === 'semantic') result.sort = 'relevance';
  if ([25, 50, 100, 1000].includes(Number(stored.pageSize))) result.pageSize = stored.pageSize as Preferences['pageSize'];
  for (const key of ['hideExpired', 'expiredLast', 'groupGreaterVancouver', 'relativeDeadlines'] as const) if (typeof stored[key] === 'boolean') result[key] = stored[key];
  if (stored.unknownDeadline === true) result.unknownDeadline = true;
  if (Array.isArray(stored.columns)) {
    result.columns = [...new Set(stored.columns.filter((entry): entry is Column => typeof entry === 'string' && Object.hasOwn(columnLabels, entry)))];
    if (!result.columns.includes('jobTitle')) result.columns.unshift('jobTitle');
  }
  return result;
}
export function validateSnapshot(value: unknown): Snapshot {
  const error = () => new Error('The saved snapshot is invalid or unsupported. Collect again from SCOPE; the stored data has not been deleted.');
  if (!value || typeof value !== 'object') throw error();
  const snapshot = value as Snapshot;
  if (snapshot.schemaVersion !== 1 || !isSourceUrl(snapshot.sourceUrl) || !Number.isFinite(Date.parse(snapshot.collectedAt)) || !Number.isSafeInteger(snapshot.reportedTotal) || snapshot.reportedTotal < 0 || !Array.isArray(snapshot.postings) || snapshot.postings.length !== snapshot.reportedTotal) throw error();
  const ids = new Set<string>();
  for (const row of snapshot.postings) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || !/^\d+$/.test(row.id) || ids.has(row.id)) throw error();
    ids.add(row.id);
    for (const key of ['applicationStatus', 'term', 'jobTitle', 'organization', 'division', 'location', 'deadlineText'] as const) if (typeof row[key] !== 'string') throw error();
    if (typeof row.isNew !== 'boolean' || typeof row.shortlisted !== 'boolean' || (row.applications !== '' && (!Number.isSafeInteger(row.applications) || row.applications < 0))) throw error();
    if (row.postingLink !== undefined) {
      const link = row.postingLink;
      if (!link || (link.kind !== 'scope' && link.kind !== 'url')) throw error();
      if (link.kind === 'scope' && (!Number.isSafeInteger(link.page) || link.page < 1)) throw error();
      if (link.kind === 'url') {
        try { const url = new URL(link.url); if (url.origin !== 'https://scope.sciencecoop.ubc.ca' || url.protocol !== 'https:' || url.username || url.password) throw error(); } catch { throw error(); }
      }
    }
  }
  return snapshot;
}

export const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
export function tokens(text: string): string[] { return [...fold(text).matchAll(/"([^"]*)"|(\S+)/g)].map(match => match[1] ?? match[2]).filter(Boolean); }
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function deadline(text: string): { key: number; date: string } | undefined {
  const match = text.match(/^([A-Z][a-z]{2}) (\d{1,2}), (\d{4}) (\d{2}):(\d{2}) (AM|PM)$/);
  if (!match) return;
  const month = months.indexOf(match[1]) + 1, day = Number(match[2]), year = Number(match[3]), hour = Number(match[4]), minute = Number(match[5]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!month || day < 1 || day > days[month - 1] || hour < 1 || hour > 12 || minute > 59 || year < 1) return;
  const date = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { date, key: Number(date.replaceAll('-', '') + String(hour % 12 + (match[6] === 'PM' ? 12 : 0)).padStart(2, '0') + match[5]) };
}
/** Interpret SCOPE's timezone-free display in the user's browser-local timezone. */
export function localDeadline(text: string): Date | undefined {
  const parsed = deadline(text);
  if (!parsed) return;
  const [year, month, day] = parsed.date.split('-').map(Number);
  const time = parsed.key % 10000;
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(Math.floor(time / 100), time % 100, 0, 0);
  return date;
}
export function isExpired(text: string, now = new Date()): boolean {
  const date = localDeadline(text);
  return date !== undefined && date.getTime() <= now.getTime();
}
/** Presentation only: future deadlines within fourteen local calendar days. */
export function relativeDeadline(text: string, now = new Date()): string | undefined {
  const date = localDeadline(text);
  if (!date) return;
  const remaining = date.getTime() - now.getTime(), limit = new Date(now);
  limit.setDate(limit.getDate() + 14);
  if (remaining <= 0 || date > limit) return;
  return relativeDeadlineTime(text, now);
}
/** Relative counterpart for any recognized date, including past/distant values. */
export function relativeDeadlineTime(text: string, now = new Date()): string | undefined {
  const date = localDeadline(text); if (!date) return;
  const difference = date.getTime() - now.getTime(), remaining = Math.abs(difference), sign = difference >= 0 ? 1 : -1;
  if (difference === 0) return 'due now';
  if (remaining < 60_000) return sign > 0 ? 'in less than a minute' : 'less than a minute ago';
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'always' });
  if (remaining >= 86_400_000) return formatter.format(sign * Math.round(remaining / 86_400_000), 'day');
  if (remaining >= 3_600_000) return formatter.format(sign * Math.round(remaining / 3_600_000), 'hour');
  return formatter.format(sign * Math.round(remaining / 60_000), 'minute');
}
export interface IndexedPosting { posting: Posting; title: string; all: string; deadline?: ReturnType<typeof deadline> }
export function indexPostings(postings: Posting[]): IndexedPosting[] {
  return postings.map(posting => ({ posting, title: fold(positionTitle(posting)), all: fold([posting.id, positionTitle(posting), posting.organization, posting.division, posting.location].join('\n')), deadline: deadline(posting.deadlineText) }));
}
const numericId = (a: string, b: string) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : a.localeCompare(b);
export function selectPostings(index: IndexedPosting[], preferences: Preferences, now = new Date(), scores?: ReadonlyMap<string, number>): Posting[] {
  const required = tokens(preferences.query), excluded = tokens(preferences.exclude);
  const flag = (choice: Flag, value: boolean) => choice === 'all' || (choice === 'yes') === value;
  const matches = index.filter(item => {
    const row = item.posting, text = preferences.scope === 'all' || preferences.scope === 'title' ? item[preferences.scope] : fold(row[preferences.scope]);
    if (scores ? !scores.has(row.id) : !required.every(term => text.includes(term))) return false;
    if (excluded.some(term => text.includes(term))) return false;
    for (const [filter, key] of [['organizations', 'organization'], ['statuses', 'applicationStatus'], ['terms', 'term']] as const) if (preferences[filter].length && !preferences[filter].includes(row[key])) return false;
    if (preferences.locations.length && !preferences.locations.some(value => value === row.location || (preferences.groupGreaterVancouver && value === greaterVancouverKey && isGreaterVancouver(row.location)))) return false;
    if (!flag(preferences.isNew, row.isNew) || !flag(preferences.shortlisted, row.shortlisted)) return false;
    if (preferences.hideExpired && isExpired(row.deadlineText, now)) return false;
    if (preferences.unknownDeadline && item.deadline) return false;
    if (preferences.from && (!item.deadline || item.deadline.date < preferences.from)) return false;
    if (preferences.to && (!item.deadline || item.deadline.date > preferences.to)) return false;
    if (preferences.min !== '' && (row.applications === '' || row.applications < Number(preferences.min))) return false;
    if (preferences.max !== '' && (row.applications === '' || row.applications > Number(preferences.max))) return false;
    return true;
  });
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
  return matches.sort((a, b) => {
    if (preferences.expiredLast) {
      const order = Number(isExpired(a.posting.deadlineText, now)) - Number(isExpired(b.posting.deadlineText, now));
      if (order) return order;
    }
    if (preferences.sort === 'relevance' && scores) {
      return (scores.get(b.posting.id)! - scores.get(a.posting.id)!) * (preferences.direction === 'asc' ? 1 : -1) || -numericId(a.posting.id, b.posting.id);
    }
    const key = preferences.sort === 'relevance' ? 'deadlineText' : preferences.sort;
    const av = key === 'deadlineText' ? a.deadline?.key : key === 'jobTitle' ? positionTitle(a.posting) : a.posting[key];
    const bv = key === 'deadlineText' ? b.deadline?.key : key === 'jobTitle' ? positionTitle(b.posting) : b.posting[key];
    const emptyA = av === undefined || av === '', emptyB = bv === undefined || bv === '';
    if (emptyA !== emptyB) return emptyA ? 1 : -1;
    let order = 0;
    if (!emptyA && !emptyB) order = key === 'id' ? numericId(String(av), String(bv)) : typeof av === 'number' && typeof bv === 'number' ? av - bv : typeof av === 'boolean' && typeof bv === 'boolean' ? Number(av) - Number(bv) : collator.compare(String(av), String(bv));
    return (preferences.direction === 'asc' ? order : -order) || -numericId(a.posting.id, b.posting.id);
  }).map(item => item.posting);
}
