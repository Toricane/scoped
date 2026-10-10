import { describe, expect, it, vi } from 'vitest';
import { customPosting, readAnnotations, readCustom } from '../src/local-library';
import { createBackup, restoreBackup, validateBackup } from '../src/backup';
import { defaults, indexPostings, readPreferences, selectPostings } from '../src/viewer-model';

const id = 'custom:12345678-1234-1234-1234-123456789abc';
const custom = { version: 1 as const, id, jobTitle: 'Engineer', organization: 'Example', location: '', appliedOn: '2026-10-10', notes: '私の notes\n<script>text</script>' };
describe('local application metadata', () => {
  it('validates and canonicalizes records while retaining blank fields and note text', () => {
    expect(readCustom({ ['customApplied:' + id]: { ...custom, extra: 'discard' } }).get(id)).toEqual(custom);
    expect(readCustom({ ['customApplied:' + id]: { ...custom, appliedOn: '2026-02-30' } }).size).toBe(0);
    expect(readCustom({ ['customApplied:' + id]: { ...custom, jobTitle: ' ' } }).size).toBe(0);
    expect(readAnnotations({ 'annotation:001': { version: 1, id: '001', notes: '', notRelevant: true } }).size).toBe(1);
    expect(readAnnotations({ 'annotation:001': { version: 1, id: '001', notes: '', notRelevant: 'true' } }).size).toBe(0);
  });
  it('deprioritizes before expiry and relevance sorting, hides before pagination, and accepts custom IDs', () => {
    const rows = [customPosting(custom), { ...customPosting(custom), id: '001', deadlineText: 'Jan 1, 2020 01:00 AM' }, { ...customPosting(custom), id: '002' }];
    const index = indexPostings(rows), marked = new Set(['002']);
    expect(readPreferences({ version: 1 }).notRelevantLast).toBe(true);
    const selected = selectPostings(index, defaults(), new Date(), undefined, marked);
    expect(selected.map(row => row.id)).toEqual([id, '001', '002']);
    expect(selectPostings(index, { ...defaults(), hideNotRelevant: true }, new Date(), undefined, marked).map(row => row.id)).not.toContain('002');
    expect(selectPostings(index, { ...defaults(), sort: 'relevance' }, new Date(), new Map([[id, .2], ['001', .5], ['002', .9]]), marked).at(-1)?.id).toBe('002');
  });
  it('backs up notes, marks and custom entries, rejects malformed data and restores complete ID state', async () => {
    const data = { ['customApplied:' + id]: custom, ['annotation:' + id]: { version: 1, id, notes: '', notRelevant: true }, 'annotation:001': { version: 1, id: '001', notes: 'Only note', notRelevant: false } };
    const backup = createBackup(data); expect(validateBackup(backup).data).toMatchObject(data);
    expect(() => createBackup({ 'annotation:001': { version: 9 } })).toThrow('Invalid local');
    const set = vi.fn(async (_data: Record<string, unknown>) => {});
    await restoreBackup({ get: async () => ({}), set }, backup);
    expect(set.mock.calls[0][0]['saved:001']).toBeNull();
    expect(set.mock.calls[0][0]['customApplied:' + id]).toEqual(custom);
  });
});
