import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SOURCE_URL, type RunState, type Snapshot } from '../src/types';
import { parsePage } from '../src/parser';
import { loadFixture } from './helpers';

let query: ReturnType<typeof vi.fn>;
let sendMessage: ReturnType<typeof vi.fn>;
let onChanged: ReturnType<typeof vi.fn>;
let snapshot: Snapshot;
let run: RunState | undefined;

beforeEach(() => {
  vi.resetModules();
  loadFixture();
  snapshot = { schemaVersion: 1, collectedAt: '2026-10-10T00:00:00.000Z', sourceUrl: SOURCE_URL, reportedTotal: 3, postings: parsePage(document).postings };
  const html = readFileSync(resolve(process.cwd(), 'popup.html'), 'utf8');
  document.body.innerHTML = new DOMParser().parseFromString(html, 'text/html').body.innerHTML;
  run = undefined;
  query = vi.fn(async () => [{ id: 7, url: SOURCE_URL }]);
  sendMessage = vi.fn(async command => ({ ok: true, value: command.type === 'getState' ? { run, snapshot } : undefined }));
  onChanged = vi.fn();
  vi.stubGlobal('chrome', { permissions: { contains: vi.fn(async () => true), request: vi.fn(async () => true) }, tabs: { query, create: vi.fn(async () => ({})) }, runtime: { sendMessage, getURL: (path: string) => 'chrome-extension://scoped/' + path }, storage: { onChanged: { addListener: onChanged } } });
});
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
async function openPopup(): Promise<void> {
  await import('../src/popup');
  await vi.waitFor(() => expect(button('csv').disabled).toBe(false));
}

describe('toolbar popup', () => {
  it('opens Saved postings in a separate extension tab', async () => {
    await openPopup(); button('view-saved').click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://scoped/viewer.html?view=saved' });
  });
  it('requests only SCOPE access on click and refreshes the source without starting collection', async () => {
    await openPopup();
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    button('allow-access').click();
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['https://scope.sciencecoop.ubc.ca/*'] });
    await vi.waitFor(() => expect(query).toHaveBeenCalledTimes(2));
    expect(sendMessage.mock.calls.every(([command]) => command.type === 'getState')).toBe(true);
  });
  it('opens the local viewer without starting collection', async () => {
    await openPopup(); button('view').click();
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://scoped/viewer.html' });
    expect(sendMessage.mock.calls.every(([command]) => command.type === 'getState')).toBe(true);
  });
  it('discovers the active SCOPE tab without URL parameters and starts collection there', async () => {
    await openPopup();
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
    expect(sendMessage).toHaveBeenCalledWith({ type: 'getState', tabId: 7 });
    expect(button('start').disabled).toBe(false);
    button('start').click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'start', tabId: 7 }));
  });
  it('restores a running collection when reopened and allows cancel without starting another', async () => {
    run = { runId: 'ongoing', tabId: 7, sourceUrl: SOURCE_URL, status: 'running', startedAt: snapshot.collectedAt, message: 'Collecting.', currentPage: 2, collected: 2, total: 3 };
    await openPopup();
    expect(button('start').disabled).toBe(true);
    expect(button('cancel').disabled).toBe(false);
    expect(document.getElementById('counts')!.textContent).toContain('Page 2 · 2 / 3');
    expect(sendMessage.mock.calls.every(([command]) => command.type === 'getState')).toBe(true);
    button('cancel').click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'cancel', tabId: 7 }));
  });
  it('disables collection on another website but delegates saved exports to the background', async () => {
    query.mockResolvedValue([{ id: 8, url: 'https://example.com/' }]);
    await openPopup();
    expect(button('start').disabled).toBe(true);
    expect(button('cancel').disabled).toBe(true);
    expect(document.getElementById('progress')!.hidden).toBe(true);
    expect(document.getElementById('status')!.hidden).toBe(true);
    expect((document.getElementById('access-panel') as HTMLDetailsElement).open).toBe(false);
    button('json').click();
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'download', format: 'json' }));
  });
});
