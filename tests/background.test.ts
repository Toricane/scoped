import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_URL, type Command, type Reply, type Snapshot } from '../src/types';
import { runKey } from '../src/store';
import { parsePage } from '../src/parser';
import { loadFixture } from './helpers';

function event() { return { addListener: vi.fn(), removeListener: vi.fn() }; }
let data: Record<string, unknown>;
let mock: {
  runtime: { onMessage: ReturnType<typeof event>; onStartup: ReturnType<typeof event>; onInstalled: ReturnType<typeof event>; getURL: (path: string) => string };
  storage: { local: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> } };
  tabs: { get: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>; onRemoved: ReturnType<typeof event>; onUpdated: ReturnType<typeof event> };
  scripting: { executeScript: ReturnType<typeof vi.fn> };
  action: { onClicked: ReturnType<typeof event> };
  downloads: { download: ReturnType<typeof vi.fn>; search: ReturnType<typeof vi.fn>; onChanged: { addListener: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> } };
};
const popupSender = { url: 'chrome-extension://scoped/popup.html' };
const sourceSender = { tab: { id: 7, url: SOURCE_URL } };

async function send(command: Command, sender: { url?: string; tab?: { id: number; url: string } } = popupSender): Promise<Reply<any>> {
  return new Promise(resolve => {
    mock.runtime.onMessage.addListener.mock.calls[0][0](command, sender, resolve);
  });
}

beforeEach(async () => {
  loadFixture();
  vi.resetModules();
  data = {};
  mock = {
    runtime: { onMessage: event(), onStartup: event(), onInstalled: event(), getURL: path => 'chrome-extension://scoped/' + path },
    storage: { local: { get: vi.fn(async keys => keys === null ? { ...data } : Object.fromEntries(keys.map((key: string) => [key, data[key]]))), set: vi.fn(async items => { Object.assign(data, items); }) } },
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
