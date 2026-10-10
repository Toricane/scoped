import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadOptions, saveSnapshot } from '../src/download';
import { toCsv, toJson } from '../src/export';
import { parsePage } from '../src/parser';
import { SOURCE_URL, type Snapshot } from '../src/types';
import { loadFixture } from './helpers';

const snapshot = (): Snapshot => {
  loadFixture();
  return { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: '2026-10-10T00:00:00.000Z', reportedTotal: 3, postings: parsePage(document).postings };
};
afterEach(() => vi.restoreAllMocks());

describe('background-owned exports', () => {
  it.each(['csv', 'json'] as const)('creates a Unicode-safe Chrome %s data URL with no popup lifetime', format => {
    const data = snapshot();
    const options = downloadOptions(data, format);
    expect(decodeURIComponent(options.url.slice(options.url.indexOf(',') + 1))).toBe(format === 'csv' ? toCsv(data) : toJson(data));
    expect(options.filename).toBe(`scope-postings-2026-10-10T00-00-00-000Z.${format}`);
    expect(options.saveAs).toBe(true);
  });
  it('keeps a Firefox background blob alive until the download completes', async () => {
    const create = vi.fn(() => 'blob:background-owned');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const downloads = { download: vi.fn(async () => 42), search: vi.fn(async () => [{ state: 'in_progress' }]), onChanged: { addListener: vi.fn(), removeListener: vi.fn() } };
    try {
      expect(await saveSnapshot(downloads as unknown as typeof chrome.downloads, snapshot(), 'csv')).toBe(42);
      expect(downloads.download).toHaveBeenCalledWith(expect.objectContaining({ url: 'blob:background-owned' }));
      expect(revoke).not.toHaveBeenCalled();
      const listener = downloads.onChanged.addListener.mock.calls[0][0];
      listener({ id: 43, state: { current: 'complete' } });
      expect(revoke).not.toHaveBeenCalled();
      listener({ id: 42, state: { current: 'complete' } });
      expect(revoke).toHaveBeenCalledWith('blob:background-owned');
    } finally { Reflect.deleteProperty(URL, 'createObjectURL'); Reflect.deleteProperty(URL, 'revokeObjectURL'); }
  });
});
