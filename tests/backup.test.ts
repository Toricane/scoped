import { describe, expect, it, vi } from 'vitest';
import { backupSummary, createBackup, parseBackup, restoreBackup, validateBackup } from '../src/backup';
import { defaults } from '../src/viewer-model';
import { SOURCE_URL } from '../src/types';

const posting = { id: '001', applicationStatus: '', term: '', jobTitle: 'Engineer 001B', organization: 'Example', division: '', location: '', applications: '' as const, deadlineText: '', isNew: false, shortlisted: true };
const saved = { version: 1, savedAt: '2026-10-10T00:00:00Z', posting };
const snapshot = { schemaVersion: 1, collectedAt: saved.savedAt, sourceUrl: SOURCE_URL, reportedTotal: 1, postings: [posting] };

describe('portable full backups', () => {
  it('round-trips durable data, blank values, leading zeros and all preferences without copying transient/unknown fields', () => {
    const backup = createBackup({ snapshot, 'saved:001': { ...saved, unknown: 'secret' }, 'applied:002': { version: 1, appliedAt: saved.savedAt, posting: { ...posting, id: '002' } }, 'savedRemoved:003': { version: 1, id: '003', removedAt: saved.savedAt, undo: { token: 'private' } }, 'viewerPreferences:saved:v1': { ...defaults(), query: 'engineer', searchMode: 'semantic' }, 'run:7': { status: 'running' }, unrelated: 'private' });
    expect(parseBackup(JSON.stringify(backup))).toEqual(backup);
    expect(JSON.stringify(backup)).not.toMatch(/private|secret|run:7|unrelated/);
    expect(backup.data['saved:001']).toEqual(saved);
    expect(backupSummary(backup)).toContain('1 collection postings · 1 local Saved · 1 Applied · 1 Saved removals · 3 view preferences');
  });
  it('rejects collection exports, unsupported versions, malformed JSON, unsafe keys, duplicate IDs and invalid retained records', () => {
    expect(() => validateBackup(snapshot)).toThrow('full backup');
    expect(() => parseBackup('{')).toThrow('valid JSON');
    for (const data of [{ 'run:7': {} }, { '__proto__': null, 'saved:nope': saved }, { 'saved:002': saved }, { snapshot: { ...snapshot, reportedTotal: 2, postings: [posting, posting] } }, { 'savedRemoved:001': { version: 1, id: '001', removedAt: 'bad' } }, { 'viewerPreferences:v1': { version: 2 } }]) {
      expect(() => validateBackup({ format: 'scoped-backup', version: 1, exportedAt: saved.savedAt, data })).toThrow();
    }
    expect(() => validateBackup({ ...createBackup({}), version: 2 })).toThrow();
    expect(() => createBackup({ 'saved:001': { ...saved, posting: { ...posting, postingLink: { kind: 'url', url: 'https://evil.example' } } } })).toThrow();
  });
  it('restores included IDs coherently in one write, preserves unrelated IDs, and replaces snapshot/preferences', async () => {
    const old = { 'savedRemoved:001': { version: 1, id: '001', removedAt: saved.savedAt }, 'saved:002': { ...saved, posting: { ...posting, id: '002' } }, 'applied:001': { version: 1, appliedAt: saved.savedAt, posting }, 'run:7': { status: 'complete' }, snapshot: {} };
    const store = { get: vi.fn(async () => old), set: vi.fn(async updates => { Object.assign(old, updates); }) };
    await restoreBackup(store, createBackup({ snapshot, 'saved:001': saved }));
    expect(store.set).toHaveBeenCalledTimes(1);
    expect(old['savedRemoved:001']).toBeNull(); expect(old['applied:001']).toBeNull();
    expect(old['saved:002'].posting.id).toBe('002'); expect(old.snapshot).toEqual(snapshot);
    expect(createBackup(old).data['savedRemoved:001']).toBeUndefined();
  });
  it('keeps a current collection when the backup has no collection and supports retained-only migration', async () => {
    const store = { get: vi.fn(async () => ({ snapshot })), set: vi.fn(async (_updates: Record<string, unknown>) => {}) };
    await restoreBackup(store, createBackup({ 'saved:001': saved }));
    expect(store.set.mock.calls[0][0]).not.toHaveProperty('snapshot');
  });
  it('never writes on validation errors or during collection, and propagates storage failures without clearing state', async () => {
    const store = { get: vi.fn(async () => ({ 'run:7': { status: 'running' } })), set: vi.fn(async () => { throw new Error('quota'); }) };
    await expect(restoreBackup(store, createBackup({ snapshot }))).rejects.toThrow('Finish or cancel');
    expect(store.set).not.toHaveBeenCalled();
    await expect(restoreBackup(store, snapshot)).rejects.toThrow('full backup');
    expect(store.set).not.toHaveBeenCalled();
    store.get.mockResolvedValue({ 'run:7': { status: 'complete' } });
    await expect(restoreBackup(store, createBackup({ snapshot }))).rejects.toThrow('quota');
  });
});
