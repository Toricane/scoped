import { readApplied, readRemovedSaved, readSaved } from './saved';
import { isActive } from './store';
import type { Posting, RunState, Snapshot } from './types';
import { readPreferences, validateSnapshot } from './viewer-model';

export const backupLimit = 25 * 1024 * 1024;
export const preferenceKeys = ['viewerPreferences:v1', 'viewerPreferences:saved:v1', 'viewerPreferences:applied:v1'] as const;
export interface Backup {
  format: 'scoped-backup'; version: 1; exportedAt: string;
  data: Record<string, unknown>;
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
function posting(row: Posting): Posting {
  const { id, applicationStatus, term, jobTitle, organization, division, location, applications, deadlineText, isNew, shortlisted, postingLink } = row;
  return { id, applicationStatus, term, jobTitle, organization, division, location, applications, deadlineText, isNew, shortlisted,
    ...(postingLink ? { postingLink: postingLink.kind === 'scope' ? { kind: 'scope', page: postingLink.page } : { kind: 'url', url: postingLink.url } } : {}) };
}
function snapshot(value: unknown): Snapshot {
  const valid = validateSnapshot(value);
  return { schemaVersion: 1, collectedAt: valid.collectedAt, sourceUrl: valid.sourceUrl, reportedTotal: valid.reportedTotal, postings: valid.postings.map(posting) };
}
/** Allowlist durable state. Never copy runs, undo tokens, caches, or unknown fields. */
function durableData(stored: Record<string, unknown>): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (value === undefined || value === null) continue;
    if (key === 'snapshot') data[key] = snapshot(value);
    else if ((preferenceKeys as readonly string[]).includes(key)) {
      if (!object(value) || value.version !== 1) throw new Error('Unsupported viewer preferences in backup.');
      data[key] = readPreferences(value);
    } else if (key.startsWith('saved:')) {
      const record = readSaved({ [key]: value }).values().next().value;
      if (!record) throw new Error(`Invalid Saved record: ${key}`);
      data[key] = { version: 1, savedAt: record.savedAt, posting: posting(record.posting) };
    } else if (key.startsWith('applied:')) {
      const record = readApplied({ [key]: value }).values().next().value;
      if (!record) throw new Error(`Invalid Applied record: ${key}`);
      data[key] = { version: 1, appliedAt: record.appliedAt, posting: posting(record.posting) };
    } else if (key.startsWith('savedRemoved:')) {
      if (!readRemovedSaved({ [key]: value }).size) throw new Error(`Invalid Saved removal: ${key}`);
      const record = value as { id: string; removedAt: string };
      data[key] = { version: 1, id: record.id, removedAt: record.removedAt };
    } else throw new Error(`Unsupported backup entry: ${key}`);
  }
  return data;
}
export function createBackup(stored: Record<string, unknown>, now = new Date()): Backup {
  const selected = Object.fromEntries(Object.entries(stored).filter(([key]) => key === 'snapshot' || (preferenceKeys as readonly string[]).includes(key) || /^(saved|applied|savedRemoved):/.test(key)));
  // Include defaults for views never opened so migration restores all three views.
  for (const key of preferenceKeys) selected[key] ??= readPreferences(undefined);
  return { format: 'scoped-backup', version: 1, exportedAt: now.toISOString(), data: durableData(selected) };
}
export function validateBackup(value: unknown): Backup {
  if (!object(value) || value.format !== 'scoped-backup' || value.version !== 1 || typeof value.exportedAt !== 'string' || !Number.isFinite(Date.parse(value.exportedAt)) || !object(value.data)) throw new Error('Choose a supported Scoped full backup (version 1), not a collection export.');
  return { format: 'scoped-backup', version: 1, exportedAt: value.exportedAt, data: durableData(value.data) };
}
export function parseBackup(text: string): Backup {
  if (new TextEncoder().encode(text).byteLength > backupLimit) throw new Error('Backup exceeds the 25 MB limit.');
  try { return validateBackup(JSON.parse(text)); }
  catch (error) { if (error instanceof SyntaxError) throw new Error('This file is not valid JSON.'); throw error; }
}
export function backupSummary(backup: Backup): string {
  const data = backup.data;
  return `${(data.snapshot as Snapshot | undefined)?.postings.length ?? 0} collection postings · ${readSaved(data).size} local Saved · ${readApplied(data).size} Applied · ${readRemovedSaved(data).size} Saved removals · ${preferenceKeys.filter(key => key in data).length} view preferences`;
}
export async function restoreBackup(store: { get(keys: null): Promise<Record<string, unknown>>; set(data: Record<string, unknown>): Promise<void> }, value: unknown): Promise<void> {
  const backup = validateBackup(value);
  const stored = await store.get(null);
  if (Object.entries(stored).some(([key, run]) => key.startsWith('run:') && isActive(run as RunState))) throw new Error('Finish or cancel collection before restoring a backup.');
  const updates = { ...backup.data };
  // Replace the entire local state of each included ID, preserving IDs not backed up.
  // Null counterparts let one storage.set commit everything without clear/remove gaps.
  const ids = new Set([...readSaved(updates).keys(), ...readApplied(updates).keys(), ...readRemovedSaved(updates)]);
  for (const id of ids) for (const prefix of ['saved:', 'applied:', 'savedRemoved:']) updates[prefix + id] ??= null;
  await store.set(updates);
}
