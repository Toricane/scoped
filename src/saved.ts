import { SOURCE_URL, type Posting, type Snapshot } from './types';
import { validateSnapshot } from './viewer-model';

export const savedPrefix = 'saved:';
export const savedKey = (id: string) => savedPrefix + id;
export interface SavedPosting { version: 1; savedAt: string; posting: Posting; }
export function readSaved(data: Record<string, unknown> = {}): Map<string, SavedPosting> {
  const result = new Map<string, SavedPosting>();
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(savedPrefix) || !value || typeof value !== 'object') continue;
    const record = value as SavedPosting;
    try {
      if (record.version !== 1 || key !== savedKey(record.posting?.id) || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))) continue;
      validateSnapshot({ schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: record.savedAt, reportedTotal: 1, postings: [record.posting] });
      result.set(record.posting.id, record);
    } catch { /* Preserve invalid stored records, but never render their contents. */ }
  }
  return result;
}
export function savedPostings(saved: Map<string, SavedPosting>, snapshot?: Snapshot, applied = new Map<string, AppliedPosting>(), removed = new Set<string>()): Posting[] {
  const current = new Map(snapshot?.postings.map(posting => [posting.id, posting]));
  const rows = new Map([...saved.values()].map(record => [record.posting.id, current.get(record.posting.id) ?? record.posting]));
  snapshot?.postings.filter(row => row.shortlisted).forEach(row => rows.set(row.id, row));
  return [...rows.values()].filter(row => !applied.has(row.id) && !removed.has(row.id));
}

export const appliedPrefix = 'applied:';
export const appliedKey = (id: string) => appliedPrefix + id;
export interface AppliedPosting { version: 1; appliedAt: string; posting: Posting; }
export function readApplied(data: Record<string, unknown> = {}): Map<string, AppliedPosting> {
  const result = new Map<string, AppliedPosting>();
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(appliedPrefix) || !value || typeof value !== 'object') continue;
    const record = value as AppliedPosting;
    if (key !== appliedKey(record.posting?.id)) continue;
    const validated = readSaved({ [savedKey(record.posting?.id)]: { version: record.version, savedAt: record.appliedAt, posting: record.posting } });
    if (record.posting && validated.has(record.posting.id)) result.set(record.posting.id, record);
  }
  return result;
}
export function appliedPostings(applied: Map<string, AppliedPosting>, snapshot?: Snapshot): Posting[] {
  const current = new Map(snapshot?.postings.map(row => [row.id, row]));
  return [...applied.values()].map(record => current.get(record.posting.id) ?? record.posting);
}

export const removedSavedPrefix = 'savedRemoved:';
export const removedSavedKey = (id: string) => removedSavedPrefix + id;
export function readRemovedSaved(data: Record<string, unknown> = {}): Set<string> {
  const result = new Set<string>();
  for (const [key, value] of Object.entries(data)) {
    if (!key.startsWith(removedSavedPrefix) || !value || typeof value !== 'object') continue;
    const record = value as { version?: number; id?: string; removedAt?: string };
    if (record.version === 1 && typeof record.id === 'string' && /^\d+$/.test(record.id) && key === removedSavedKey(record.id)
      && typeof record.removedAt === 'string' && Number.isFinite(Date.parse(record.removedAt))) result.add(record.id);
  }
  return result;
}
