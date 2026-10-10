import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePage } from '../src/parser';
import { defaults, preferencesKey } from '../src/viewer-model';
import { SOURCE_URL, type Snapshot } from '../src/types';
import { loadFixture } from './helpers';

let stored: Record<string, unknown>, get: ReturnType<typeof vi.fn>, set: ReturnType<typeof vi.fn>, onChanged: ReturnType<typeof vi.fn>, sendMessage: ReturnType<typeof vi.fn>;
let snapshot: Snapshot;
beforeEach(() => {
  vi.resetModules(); loadFixture();
  snapshot = { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: '2026-10-10T00:00:00Z', reportedTotal: 3, postings: parsePage(document).postings };
  stored = { snapshot };
  document.body.innerHTML = new DOMParser().parseFromString(readFileSync('viewer.html', 'utf8'), 'text/html').body.innerHTML;
  get = vi.fn(async keys => Object.fromEntries(keys.map((key: string) => [key, stored[key]])));
  set = vi.fn(async items => { Object.assign(stored, items); }); onChanged = vi.fn(); sendMessage = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal('chrome', { storage: { local: { get, set }, onChanged: { addListener: onChanged } }, runtime: { getURL: (path: string) => 'chrome-extension://scoped/' + path, sendMessage } });
});
const control = (id: string) => document.getElementById(id) as HTMLInputElement;
const rows = () => document.querySelectorAll('#rows tr:not(.expanded)');
async function open(): Promise<void> { await import('../src/viewer'); await vi.waitFor(() => expect(document.getElementById('snapshot-info')!.textContent).not.toContain('Loading')); }
function change(id: string, value: string): void { control(id).value = value; control(id).dispatchEvent(new Event(id === 'query' ? 'input' : 'change')); }
describe('local viewer', () => {
  it('renders safe full text, posting actions, captured details, and downloads', async () => {
    snapshot.postings[0].jobTitle = '<img src=x onerror=alert(1)> Full title';
    await open(); expect(rows()).toHaveLength(3); expect(document.querySelector('#rows img')).toBeNull();
    expect(document.querySelector<HTMLAnchorElement>('#rows a')!.href).toBe('chrome-extension://scoped/posting.html?id=1001');
    expect(document.querySelector('#rows .actions-cell a')).toBeNull();
    document.querySelector<HTMLButtonElement>('button[data-details="1001"]')!.click();
    expect(document.getElementById('details-1001')!.textContent).toContain('<img src=x onerror=alert(1)> Full title');
    control('csv').click(); await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'download', format: 'csv' }));
  });
  it('hyperlinks cleaned position text even in older snapshots without link metadata', async () => {
    snapshot.postings.forEach(row => { delete row.postingLink; });
    await open();
    const title = document.querySelector<HTMLAnchorElement>('#rows [data-column="jobTitle"] a')!;
    expect(title.textContent).toBe('W27 Backend Engineer — Python + FastAPI');
    expect(title.target).toBe('_blank');
    expect(title.href).toBe('chrome-extension://scoped/posting.html?id=1001');
    expect(document.querySelector('#rows .actions-cell')!.textContent).toBe('Details');
  });
  it('restores preferences, filters instantly, persists changes, and resets filters', async () => {
    stored[preferencesKey] = { ...defaults(), query: 'research', columns: ['jobTitle', 'id'] };
    await open(); expect(rows()).toHaveLength(1); expect(control('query').value).toBe('research');
    change('query', 'python'); await vi.waitFor(() => expect(rows()[0].textContent).toContain('Backend'));
    await vi.waitFor(() => expect(set).toHaveBeenCalled());
    control('reset').click(); expect(rows()).toHaveLength(3); expect(control('query').value).toBe('');
  });
  it('paginates the complete locally filtered set', async () => {
    snapshot.postings = Array.from({ length: 65 }, (_, index) => ({ ...snapshot.postings[0], id: String(5000 + index), jobTitle: `Job ${index}` })); snapshot.reportedTotal = 65;
    await open(); expect(rows()).toHaveLength(50); control('next').click(); expect(rows()).toHaveLength(15);
    change('query', 'Job 64'); await vi.waitFor(() => expect(rows()).toHaveLength(1)); expect(document.getElementById('page-label')!.textContent).toBe('Page 1 of 1');
  });
  it('updates only on a successful snapshot change, preserving the current query', async () => {
    await open(); change('query', 'python'); await vi.waitFor(() => expect(rows()).toHaveLength(1));
    const changed = onChanged.mock.calls[0][0]; changed({ 'run:7': { newValue: { status: 'error' } } }, 'local'); expect(rows()).toHaveLength(1);
    stored.snapshot = { ...snapshot, postings: [snapshot.postings[0]], reportedTotal: 1, collectedAt: '2026-10-11T00:00:00Z' };
    changed({ snapshot: { newValue: stored.snapshot } }, 'local');
    await vi.waitFor(() => expect(document.getElementById('count')!.textContent).toContain('1 matching / 1 postings')); expect(control('query').value).toBe('python');
  });
  it('shows no-data/no-matches and rejects invalid snapshots without deleting them', async () => {
    delete stored.snapshot; await open(); expect(document.getElementById('empty')!.textContent).toContain('No snapshot');
    stored.snapshot = snapshot; onChanged.mock.calls[0][0]({ snapshot: {} }, 'local'); await vi.waitFor(() => expect(rows()).toHaveLength(3));
    change('query', 'no such job'); await vi.waitFor(() => { expect(document.getElementById('empty')!.hidden).toBe(false); expect(document.getElementById('empty')!.textContent).toContain('No postings match'); });
    stored.snapshot = { ...snapshot, schemaVersion: 99 }; onChanged.mock.calls[0][0]({ snapshot: {} }, 'local'); await vi.waitFor(() => expect(document.getElementById('error')!.textContent).toContain('unsupported')); expect(stored.snapshot).toMatchObject({ schemaVersion: 99 });
  });
  it('discards an older initial read when a newer snapshot event wins, while restoring preferences', async () => {
    let finish!: (value: unknown) => void; get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    stored[preferencesKey] = { ...defaults(), query: 'python' };
    await import('../src/viewer');
    stored.snapshot = { ...snapshot, postings: [snapshot.postings[0]], reportedTotal: 1 };
    onChanged.mock.calls[0][0]({ snapshot: {} }, 'local');
    expect(get).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(document.getElementById('count')!.textContent).toContain('1 matching / 1'));
    finish({ snapshot, [preferencesKey]: defaults() }); await Promise.resolve();
    expect(document.getElementById('count')!.textContent).toContain('1 matching / 1'); expect(control('query').value).toBe('python');
  });
});
