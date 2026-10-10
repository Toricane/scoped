import type { Posting } from './types';

export const annotationPrefix = 'annotation:';
export const customPrefix = 'customApplied:';
export const isCustomId = (id: string) => /^custom:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export const isLocalId = (id: string) => /^\d+$/.test(id) || isCustomId(id);
export interface Annotation { version: 1; id: string; notes: string; notRelevant: boolean; }
export interface CustomApplied { version: 1; id: string; jobTitle: string; organization: string; location: string; appliedOn: string; notes: string; }
export function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function readAnnotations(data: Record<string, unknown>): Map<string, Annotation> {
  const result = new Map<string, Annotation>();
  for (const [key, value] of Object.entries(data)) {
    const row = value as Annotation | undefined;
    if (row?.version === 1 && typeof row.id === 'string' && isLocalId(row.id) && key === annotationPrefix + row.id && typeof row.notes === 'string' && row.notes.length <= 20000 && typeof row.notRelevant === 'boolean') {
      result.set(row.id, { version: 1, id: row.id, notes: row.notes, notRelevant: row.notRelevant });
    }
  }
  return result;
}
export function readCustom(data: Record<string, unknown>): Map<string, CustomApplied> {
  const result = new Map<string, CustomApplied>();
  for (const [key, value] of Object.entries(data)) {
    const row = value as CustomApplied | undefined;
    if (row?.version !== 1 || typeof row.id !== 'string' || !isCustomId(row.id) || key !== customPrefix + row.id) continue;
    if (['jobTitle', 'organization', 'location', 'appliedOn', 'notes'].some(field => typeof row[field as keyof CustomApplied] !== 'string')) continue;
    if (!row.jobTitle.trim() || row.jobTitle.length > 2000 || row.organization.length > 2000 || row.location.length > 2000 || row.notes.length > 20000 || !validDate(row.appliedOn)) continue;
    result.set(row.id, { version: 1, id: row.id, jobTitle: row.jobTitle, organization: row.organization, location: row.location, appliedOn: row.appliedOn, notes: row.notes });
  }
  return result;
}
export function customPosting(row: CustomApplied): Posting {
  return { id: row.id, jobTitle: row.jobTitle, organization: row.organization, location: row.location, applicationStatus: 'Applied', term: '', division: '', deadlineText: '', applications: '', isNew: false, shortlisted: false };
}
