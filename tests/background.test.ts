import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_URL, type Command, type Reply, type Snapshot } from '../src/types';
import { runKey } from '../src/store';
import { parsePage } from '../src/parser';
import { loadFixture } from './helpers';

function event() { return { addListener: vi.fn(), removeListener: vi.fn() }; }
let data: Record<string, unknown>;
let mock: {
  runtime: { id: string; onMessage: ReturnType<typeof event>; onStartup: ReturnType<typeof event>; onInstalled: ReturnType<typeof event>; getURL: (path: string) => string };
  storage: { local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> } };
  tabs: { get: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; onRemoved: ReturnType<typeof event>; onUpdated: ReturnType<typeof event> };
  scripting: { executeScript: ReturnType<typeof vi.fn> };
  action: { onClicked: ReturnType<typeof event> };
  downloads: { download: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn>; onChanged: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> } };
};
const popupSender = { url: 'chrome-extension://scoped/popup.html' };
const sourceSender = { tab: { id: 7, url: SOURCE_URL } };

describe('backup message guards', () => {
  it('downloads durable data without blocking storage replies while the save dialog is open', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: undefined });
    try {
    const rows = parsePage(document).postings;
    data.snapshot = { schemaVersion: 1, collectedAt: '2026-10-10T00:00:00Z', sourceUrl: SOURCE_URL, reportedTotal: rows.length, postings: rows };
    data['saved:1001'] = { version: 1, savedAt: '2026-10-10T00:00:00Z', posting: rows[0] };
    data['run:7'] = { status: 'complete' };
    let release!: (id: number) => void;
    mock.downloads.download.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = send({ type: 'downloadBackup' }, { id: 'scoped', url: 'chrome-extension://scoped/backup.html' });
    await vi.waitFor(() => expect(mock.downloads.download).toHaveBeenCalled());
    const options = mock.downloads.download.mock.calls[0][0];
    const backup = JSON.parse(decodeURIComponent(options.url.split(',')[1]));
    expect(backup.format).toBe('scoped-backup'); expect(backup.data['saved:1001']).toBeDefined();
    expect(backup.data['run:7']).toBeUndefined(); expect(options.filename).toMatch(/^scoped-backup-.*\.json$/);
    expect(await send({ type: 'getState', tabId: 7 })).toMatchObject({ ok: true });
    release(42); expect(await pending).toMatchObject({ ok: true, value: 42 });
    } finally {
      if (descriptor) Object.defineProperty(URL, 'createObjectURL', descriptor);
      else Reflect.deleteProperty(URL, 'createObjectURL');
    }
  });
  it('rejects backup downloads/restores from SCOPE, other extension pages, and foreign extension identities', async () => {
    for (const sender of [sourceSender, popupSender, { url: 'chrome-extension://scoped/backup.html', id: 'foreign' }]) {
      expect(await send({ type: 'downloadBackup' }, sender)).toMatchObject({ ok: false });
      expect(await send({ type: 'restoreBackup', text: '{}' }, sender)).toMatchObject({ ok: false });
    }
    expect(mock.storage.local.set).not.toHaveBeenCalled();
  });
  it('restores valid data from the same extension backup page and never clears on invalid input', async () => {
    const { createBackup } = await import('../src/backup');
    const sender = { id: 'scoped', url: 'chrome-extension://scoped/backup.html' };
    const backup = createBackup({});
    expect(await send({ type: 'restoreBackup', text: JSON.stringify(backup) }, sender)).toMatchObject({ ok: true });
    const before = { ...data };
    expect(await send({ type: 'restoreBackup', text: '{}' }, sender)).toMatchObject({ ok: false });
    expect(data).toEqual(before);
  });
});

async function send(command: Command, sender: { id?: string; url?: string; tab?: { id: number; url: string } } = popupSender): Promise<Reply<any>> {
  return new Promise(resolve => {
    mock.runtime.onMessage.addListener.mock.calls[0][0](command, sender, resolve);
  });
}

beforeEach(async () => {
  loadFixture();
  vi.resetModules();
  data = {};
  mock = {
    runtime: { id: 'scoped', onMessage: event(), onStartup: event(), onInstalled: event(), getURL: path => 'chrome-extension://scoped/' + path },
    storage: { local: { get: vi.fn(async keys => keys === null ? { ...data } : Object.fromEntries(keys.map((key: string) => [key, data[key]]))), set: vi.fn(async items => { Object.assign(data, items); }), remove: vi.fn(async key => { delete data[key]; }) } },
    tabs: {
      get: vi.fn(async () => ({ id: 7, url: SOURCE_URL })), sendMessage: vi.fn(async (_tab, command) => ({ ok: true, value: command.type === 'collectorStatus' })),
      create: vi.fn(async () => ({})), update: vi.fn(async () => ({})), onRemoved: event(), onUpdated: event(),
    },
    scripting: { executeScript: vi.fn(async () => []) }, action: { onClicked: event() },
    downloads: { download: vi.fn(async () => 42), search: vi.fn(async () => [{ id: 42, state: 'complete' }]), onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  };
  vi.stubGlobal('chrome', mock);
  await import('../src/background');
});

describe('background lifecycle and persisted transitions', () => {
  it('validates relevance batches completely, preserves notes, and commits once for all IDs', async () => {
    const rows = parsePage(document).postings;
    data.snapshot = { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: '2026-10-10T00:00:00Z', reportedTotal: rows.length, postings: rows };
    data['annotation:1001'] = { version: 1, id: '1001', notes: 'Keep this note', notRelevant: false };
    const sender = { id: 'scoped', url: 'chrome-extension://scoped/viewer.html' };
    expect(await send({ type: 'setRelevance', changes: [{ id: '1001', notRelevant: true }, { id: '1002', notRelevant: true }] }, sender)).toMatchObject({ ok: true });
    expect(mock.storage.local.set).toHaveBeenCalledTimes(1); expect(mock.storage.local.get).toHaveBeenCalledTimes(1);
    expect(data['annotation:1001']).toMatchObject({ notes: 'Keep this note', notRelevant: true });
    const before = { ...data }; mock.storage.local.set.mockClear();
    for (const changes of [[], [{ id: '1001', notRelevant: false }, { id: '9999', notRelevant: true }], [{ id: '1001', notRelevant: true }, { id: '1001', notRelevant: false }], [{ id: 'bad', notRelevant: true }]]) {
      expect(await send({ type: 'setRelevance', changes }, sender)).toMatchObject({ ok: false });
    }
    expect(await send({ type: 'setRelevance', changes: [{ id: '1001', notRelevant: false }] }, { ...sender, id: 'foreign' })).toMatchObject({ ok: false });
    expect(mock.storage.local.set).not.toHaveBeenCalled(); expect(data).toEqual(before);
  });
  it('serializes notes and relevance independently and saves notes with a retained copy', async () => {
    const rows = parsePage(document).postings;
    data.snapshot = { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: '2026-10-10T00:00:00Z', reportedTotal: rows.length, postings: rows };
    const sender = { id: 'scoped', url: 'chrome-extension://scoped/viewer.html' };
    const replies = await Promise.all([
      send({ type: 'setAnnotation', id: '1001', notes: '<script>private</script>\nnext line' }, sender),
      send({ type: 'setAnnotation', id: '1001', notRelevant: true }, sender),
    ]);
    expect(replies.every(reply => reply.ok)).toBe(true);
    expect(data['annotation:1001']).toMatchObject({ notes: '<script>private</script>\nnext line', notRelevant: true });
    expect(await send({ type: 'setSaved', id: '1001', saved: true, notes: 'updated' }, sender)).toMatchObject({ ok: true });
    expect(data['saved:1001']).toBeDefined(); expect(data['annotation:1001']).toMatchObject({ notes: 'updated', notRelevant: true });
    expect(await send({ type: 'setAnnotation', id: '9999', notes: 'unknown' }, sender)).toMatchObject({ ok: false });
    expect(await send({ type: 'setAnnotation', id: '1001', notes: 'bad' }, sourceSender)).toMatchObject({ ok: false });
    expect(await send({ type: 'setAnnotation', id: '1001', notes: 'bad' }, { ...sender, id: 'foreign' })).toMatchObject({ ok: false });
    expect(await send({ type: 'setAnnotation', id: '1001', notes: 'x'.repeat(20001) }, sender)).toMatchObject({ ok: false });
    expect(mock.tabs.update).not.toHaveBeenCalled();
  });
  it('validates custom Applied entries without adding them to SCOPE libraries or opening SCOPE', async () => {
    const sender = { id: 'scoped', url: 'chrome-extension://scoped/viewer.html?view=applied' };
    const id = 'custom:12345678-1234-1234-1234-123456789abc';
    const record = { version: 1 as const, id, jobTitle: 'External engineer', organization: 'Example', location: '', appliedOn: '2026-10-10', notes: 'Follow up' };
    expect(await send({ type: 'setCustomApplied', record }, sender)).toMatchObject({ ok: true });
    expect(await send({ type: 'setCustomApplied', record: { ...record, appliedOn: '2026-02-30' } }, sender)).toMatchObject({ ok: false });
    expect(await send({ type: 'getLibrary' })).toMatchObject({ value: { ['customApplied:' + id]: record } });
    expect(await send({ type: 'setSaved', id, saved: true }, sender)).toMatchObject({ ok: false });
    expect(await send({ type: 'setAnnotation', id, notRelevant: true }, sender)).toMatchObject({ ok: true });
    mock.storage.local.remove.mockImplementation(async keys => { for (const key of Array.isArray(keys) ? keys : [keys]) delete data[key]; });
    expect(await send({ type: 'deleteCustomApplied', id }, sender)).toMatchObject({ ok: true });
    expect(data['customApplied:' + id]).toBeUndefined(); expect(data['annotation:' + id]).toBeUndefined();
    expect(mock.tabs.update).not.toHaveBeenCalled();
  });
  it('undoes retained Saved removal through a validated, single-use token without SCOPE navigation', async () => {
    const posting = parsePage(document).postings[0];
    data['saved:1001'] = { version: 1, savedAt: '2026-10-10T00:00:00Z', posting };
    const removed = await send({ type: 'setSaved', id: '1001', saved: false });
    const token = removed.ok && removed.value.undoToken;
    expect(typeof token).toBe('string'); expect(data['saved:1001']).toBeUndefined();
    expect(await send({ type: 'undoSavedRemoval', id: '1001', token }, sourceSender)).toMatchObject({ ok: false });
    expect(await send({ type: 'undoSavedRemoval', id: '1001', token: 'wrong' })).toMatchObject({ ok: false });
    expect(await send({ type: 'undoSavedRemoval', id: '1001', token })).toMatchObject({ ok: true, value: { posting: { id: '1001' } } });
    expect(data['saved:1001']).toMatchObject({ savedAt: '2026-10-10T00:00:00Z' }); expect(data['savedRemoved:1001']).toBeUndefined();
    expect(await send({ type: 'undoSavedRemoval', id: '1001', token })).toMatchObject({ ok: false });
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
  });
  it('rejects stale, expired and malformed undo copies, keeping persistent removals', async () => {
    data.snapshot = { postings: parsePage(document).postings };
    const first = await send({ type: 'setSaved', id: '1001', saved: false });
    const second = await send({ type: 'setSaved', id: '1001', saved: false });
    expect(await send({ type: 'undoSavedRemoval', id: '1001', token: first.ok && first.value.undoToken })).toMatchObject({ ok: false });
    const removal = data['savedRemoved:1001'] as any;
    removal.undo.record.posting.id = '1002';
    expect(await send({ type: 'undoSavedRemoval', id: '1001', token: second.ok && second.value.undoToken })).toMatchObject({ ok: false });
    removal.undo.expiresAt = 0;
    expect(await send({ type: 'undoSavedRemoval', id: '1001', token: second.ok && second.value.undoToken })).toMatchObject({ ok: false });
    await send({ type: 'getLibrary' });
    expect(data['savedRemoved:1001']).toMatchObject({ id: '1001' }); expect((data['savedRemoved:1001'] as any).undo).toBeUndefined();
  });
  it('uses latest captured fields when undoing a shortlist removal', async () => {
    const postings = parsePage(document).postings; data.snapshot = { postings };
    const reply = await send({ type: 'setSaved', id: '1001', saved: false });
    postings[0] = { ...postings[0], organization: 'Updated organization' };
    expect(await send({ type: 'undoSavedRemoval', id: '1001', token: reply.ok && reply.value.undoToken })).toMatchObject({ ok: true, value: { posting: { organization: 'Updated organization' } } });
    expect(postings[0].shortlisted).toBe(true);
  });
  it('saves locally, keeps records when the snapshot changes, and removes only the requested save', async () => {
    const postings = parsePage(document).postings;
    data.snapshot = { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: new Date().toISOString(), reportedTotal: 3, postings };
    expect(await send({ type: 'setSaved', id: '1001', saved: true })).toMatchObject({ ok: true });
    expect(data['saved:1001']).toMatchObject({ version: 1, posting: { id: '1001' } });
    data.snapshot = undefined;
    expect(await send({ type: 'getSaved' })).toMatchObject({ ok: true, value: { 'saved:1001': { posting: { id: '1001' } } } });
    expect(await send({ type: 'setSaved', id: '1002', saved: true })).toMatchObject({ ok: false });
    expect(await send({ type: 'setSaved', id: '1001', saved: false })).toMatchObject({ ok: true });
    expect(data['saved:1001']).toBeUndefined();
    expect(mock.tabs.sendMessage).not.toHaveBeenCalled(); expect(mock.scripting.executeScript).not.toHaveBeenCalled();
  });
  it('rejects saved mutations from a site tab and handles independent saves serially', async () => {
    data.snapshot = { postings: parsePage(document).postings };
    expect(await send({ type: 'setSaved', id: '1001', saved: true }, sourceSender)).toMatchObject({ ok: false });
    await Promise.all([send({ type: 'setSaved', id: '1001', saved: true }), send({ type: 'setSaved', id: '1002', saved: true })]);
    expect(data['saved:1001']).toBeDefined(); expect(data['saved:1002']).toBeDefined();
  });
  it('marks Applied locally, validates senders and IDs, and supports retained copies and undo', async () => {
    data.snapshot = { postings: parsePage(document).postings };
    expect(await send({ type: 'setApplied', id: '1001', applied: true }, sourceSender)).toMatchObject({ ok: false });
    expect(await send({ type: 'setApplied', id: 'bad', applied: true })).toMatchObject({ ok: false });
    expect(await send({ type: 'setApplied', id: '1001', applied: true })).toMatchObject({ ok: true });
    data.snapshot = undefined;
    expect(await send({ type: 'getLibrary' })).toMatchObject({ ok: true, value: { 'applied:1001': { posting: { id: '1001' } } } });
    expect(await send({ type: 'setSaved', id: '1001', saved: true })).toMatchObject({ ok: true });
    expect(await send({ type: 'setApplied', id: '1001', applied: false })).toMatchObject({ ok: true });
    expect(data['saved:1001']).toBeDefined(); expect(data['applied:1001']).toBeUndefined();
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
  });
  it('persists local removal of a SCOPE-shortlisted entry and clears it on Save', async () => {
    const postings = parsePage(document).postings; data.snapshot = { postings };
    expect(await send({ type: 'setSaved', id: '1001', saved: false })).toMatchObject({ ok: true });
    expect(data['savedRemoved:1001']).toMatchObject({ version: 1, id: '1001' });
    expect(postings[0].shortlisted).toBe(true);
    expect(await send({ type: 'getLibrary' })).toMatchObject({ ok: true, value: { 'savedRemoved:1001': { id: '1001' } } });
    expect(await send({ type: 'setSaved', id: '1001', saved: true })).toMatchObject({ ok: true });
    expect(data['savedRemoved:1001']).toBeUndefined(); expect(data['saved:1001']).toBeDefined();
  });
  it('searches IDs in the requesting new tab without requiring a source connection or link metadata', async () => {
    const postings = parsePage(document).postings; postings.forEach(posting => { delete posting.postingLink; });
    data.snapshot = { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: '2026-10-10T00:00:00Z', reportedTotal: 3, postings };
    mock.tabs.get.mockResolvedValueOnce({ id: 20, url: 'chrome-extension://scoped/posting.html?id=1001' });
    mock.tabs.update.mockImplementation(async () => { queueMicrotask(() => mock.tabs.onUpdated.addListener.mock.calls.forEach(([listener]) => listener(20, { status: 'complete' }, { url: SOURCE_URL }))); return {}; });
    mock.scripting.executeScript.mockResolvedValue([{ result: true }]);
    expect(await send({ type: 'openPosting', id: '1001', tabId: 20 }, { url: 'chrome-extension://scoped/posting.html?id=1001' })).toMatchObject({ ok: true });
    expect(mock.tabs.update).toHaveBeenCalledWith(20, { url: SOURCE_URL });
    expect(mock.scripting.executeScript).toHaveBeenCalledWith(expect.objectContaining({ target: { tabId: 20 }, args: ['1001'] }));
    expect(mock.tabs.sendMessage).not.toHaveBeenCalled();
  });
  it('can search an explicitly retained save absent from the latest snapshot', async () => {
    const posting = parsePage(document).postings[0];
    data['saved:1001'] = { version: 1, savedAt: new Date().toISOString(), posting };
    mock.tabs.get.mockResolvedValueOnce({ id: 20, url: 'chrome-extension://scoped/posting.html?id=1001' });
    mock.tabs.update.mockImplementation(async () => { queueMicrotask(() => mock.tabs.onUpdated.addListener.mock.calls.forEach(([listener]) => listener(20, { status: 'complete' }, { url: SOURCE_URL }))); return {}; });
    mock.scripting.executeScript.mockResolvedValue([{ result: true }]);
    expect(await send({ type: 'openPosting', id: '1001', tabId: 20 }, { url: 'chrome-extension://scoped/posting.html?id=1001' })).toMatchObject({ ok: true });
  });
  it('rejects source-page commands and IDs outside the saved snapshot', async () => {
    expect(await send({ type: 'openPosting', id: '1001', tabId: 7 }, sourceSender)).toMatchObject({ ok: false });
    mock.tabs.get.mockResolvedValueOnce({ id: 20, url: 'chrome-extension://scoped/posting.html?id=9999' });
    expect(await send({ type: 'openPosting', id: '9999', tabId: 20 }, { url: 'chrome-extension://scoped/posting.html?id=9999' })).toMatchObject({ ok: false, error: expect.stringContaining('no longer') });
    expect(mock.tabs.update).not.toHaveBeenCalled();
  });
  it('does not create tabs or register a toolbar click handler; the manifest opens the popup', () => {
    expect(mock.action.onClicked.addListener).not.toHaveBeenCalled();
    expect(mock.tabs.create).not.toHaveBeenCalled();
  });
  it('handles downloads from a popup sender with no tab and leaves the run queue free', async () => {
    data.snapshot = { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: new Date().toISOString(), reportedTotal: 3, postings: parsePage(document).postings };
    let finish!: (id: number) => void;
    mock.downloads.download.mockImplementation(() => new Promise<number>(resolve => { finish = resolve; }));
    const downloading = send({ type: 'download', format: 'json' });
    await vi.waitFor(() => expect(mock.downloads.download).toHaveBeenCalledOnce());
    expect((await send({ type: 'start', tabId: 7 })).ok).toBe(true);
    finish(42);
    expect(await downloading).toEqual({ ok: true, value: 42 });
  });
  it('rejects downloads without a snapshot or from the source page', async () => {
    expect(await send({ type: 'download', format: 'csv' })).toMatchObject({ ok: false, error: expect.stringContaining('before downloading') });
    expect(await send({ type: 'download', format: 'csv' }, sourceSender)).toMatchObject({ ok: false, error: expect.stringContaining('extension popup') });
    expect(mock.downloads.download).not.toHaveBeenCalled();
  });
  it('starts in a SCOPE tab and prevents a second live run', async () => {
    expect((await send({ type: 'start', tabId: 7 })).ok).toBe(true);
    expect(data[runKey(7)]).toMatchObject({ status: 'running' });
    expect(mock.scripting.executeScript).toHaveBeenCalledOnce();
    expect(await send({ type: 'start', tabId: 7 })).toMatchObject({ ok: false, error: expect.stringContaining('already running') });
    expect(mock.scripting.executeScript).toHaveBeenCalledOnce();
  });
  it('restarts a stale stored run when its content collector is gone', async () => {
    await send({ type: 'start', tabId: 7 });
    const old = (data[runKey(7)] as { runId: string }).runId;
    mock.tabs.sendMessage.mockImplementation(async (_tab, command) => ({ ok: true, value: command.type !== 'collectorStatus' }));
    expect((await send({ type: 'start', tabId: 7 })).ok).toBe(true);
    expect((data[runKey(7)] as { runId: string }).runId).not.toBe(old);
  });
  it('rejects non-SCOPE source tabs without injecting code', async () => {
    mock.tabs.get.mockResolvedValue({ id: 7, url: 'https://example.com/' });
    expect((await send({ type: 'start', tabId: 7 })).ok).toBe(false);
    expect(mock.scripting.executeScript).not.toHaveBeenCalled();
  });
  it('keeps the previous snapshot on cancellation even if completion races with it', async () => {
    const old = { collectedAt: 'old' };
    data.snapshot = old;
    const reply = await send({ type: 'start', tabId: 7 });
    if (!reply.ok) throw new Error(reply.error);
    const runId = reply.value.runId;
    await send({ type: 'progress', runId, progress: { currentPage: 1, collected: 3, total: 3 } }, sourceSender);
    await send({ type: 'cancel', tabId: 7 });
    const snapshot: Snapshot = { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: new Date().toISOString(), reportedTotal: 3, postings: parsePage(document).postings };
    await send({ type: 'complete', runId, snapshot }, sourceSender);
    expect(data.snapshot).toBe(old);
    expect(data[runKey(7)]).toMatchObject({ status: 'canceled' });
  });
  it('saves a complete snapshot but rejects updates from other tabs or old runs', async () => {
    const reply = await send({ type: 'start', tabId: 7 });
    if (!reply.ok) throw new Error(reply.error);
    const runId = reply.value.runId;
    expect((await send({ type: 'progress', runId: 'wrong', progress: { currentPage: 1, collected: 3, total: 3 } }, sourceSender)).ok).toBe(false);
    expect((await send({ type: 'progress', runId, progress: { currentPage: 1, collected: 3, total: 3 } }, { tab: { id: 8, url: SOURCE_URL } })).ok).toBe(false);
    await send({ type: 'progress', runId, progress: { currentPage: 1, collected: 3, total: 3 } }, sourceSender);
    const snapshot: Snapshot = { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: new Date().toISOString(), reportedTotal: 3, postings: parsePage(document).postings };
    expect((await send({ type: 'complete', runId, snapshot }, sourceSender)).ok).toBe(true);
    expect(data.snapshot).toEqual(snapshot);
    expect(data[runKey(7)]).toMatchObject({ status: 'complete' });
  });
  it.each(['closed', 'reloaded', 'restarted'])('marks a %s source run failed and keeps its snapshot', async kind => {
    data.snapshot = { collectedAt: 'old' };
    await send({ type: 'start', tabId: 7 });
    if (kind === 'closed') mock.tabs.onRemoved.addListener.mock.calls[0][0](7);
    else if (kind === 'reloaded') mock.tabs.onUpdated.addListener.mock.calls[0][0](7, { status: 'loading' });
    else mock.runtime.onStartup.addListener.mock.calls[0][0]();
    // A getState command joins the same serialized queue after the tab event.
    await send({ type: 'getState', tabId: 7 });
    expect(data[runKey(7)]).toMatchObject({ status: 'error' });
    expect(data.snapshot).toEqual({ collectedAt: 'old' });
  });
});
