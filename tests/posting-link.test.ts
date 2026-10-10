import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { navigatePostingTab, searchPostingById } from '../src/posting-navigation';
import { SOURCE_URL } from '../src/types';

const fixture = readFileSync('tests/fixtures/overview.html', 'utf8');
function overview(): void { document.body.innerHTML = new DOMParser().parseFromString(fixture, 'text/html').body.innerHTML; }
beforeEach(() => { overview(); vi.stubGlobal('location', { href: SOURCE_URL, origin: 'https://scope.sciencecoop.ubc.ca', pathname: '/myAccount/co-op/postings.htm' }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('SCOPE overview posting-ID search', () => {
  it('fills the ID, fires input/change, and clicks only the scoped Search button once', async () => {
    const general = vi.fn(); document.getElementById('general-search')!.addEventListener('click', general);
    const search = vi.fn(event => event.preventDefault()); document.getElementById('id-search')!.addEventListener('click', search);
    const input = document.getElementById('synthetic-posting-id') as HTMLInputElement;
    const inputEvent = vi.fn(), change = vi.fn(); input.addEventListener('input', inputEvent); input.addEventListener('change', change);
    await expect(searchPostingById('1001', 200)).resolves.toBe(true);
    expect(input.value).toBe('1001'); expect(inputEvent).toHaveBeenCalledOnce(); expect(change).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce()); expect(general).not.toHaveBeenCalled();
  });
  it('waits for an AJAX-inserted panel and ignores unrelated keyword searches', async () => {
    document.body.innerHTML = '<section><label>Keywords<input type="text"></label><button>Search</button></section>';
    const searching = searchPostingById('1002', 300);
    setTimeout(() => { overview(); document.getElementById('id-search')!.addEventListener('click', event => event.preventDefault()); }, 20);
    await expect(searching).resolves.toBe(true);
    expect((document.getElementById('synthetic-posting-id') as HTMLInputElement).value).toBe('1002');
    await new Promise(resolve => setTimeout(resolve, 60));
  });
  it('rejects ambiguous panels instead of clicking an arbitrary Search button', async () => {
    document.body.append(document.getElementById('posting-search')!.cloneNode(true));
    await expect(searchPostingById('1001', 100)).rejects.toThrow('multiple');
  });
  it('reports session expiry, missing controls, and invalid destinations', async () => {
    document.body.innerHTML = '<input type="password">';
    await expect(searchPostingById('1001', 50)).rejects.toThrow('expired');
    document.body.innerHTML = '<p>No search here</p>';
    await expect(searchPostingById('1001', 30)).rejects.toThrow('Could not find');
    expect(() => searchPostingById('invalid')).toThrow('Sign in');
    vi.stubGlobal('location', { origin: 'https://example.com', pathname: '/' });
    expect(() => searchPostingById('1001')).toThrow('Sign in');
  });
  it('loads the new SCOPE tab before injecting the ID search and cleans up tab listeners', async () => {
    const updated = { addListener: vi.fn(), removeListener: vi.fn() }, removed = { addListener: vi.fn(), removeListener: vi.fn() };
    const update = vi.fn(async () => { queueMicrotask(() => updated.addListener.mock.calls[0][0](20, { status: 'complete' }, { url: SOURCE_URL })); });
    const executeScript = vi.fn(async () => [{ result: true }]);
    const api = { runtime: { getURL: (path: string) => 'moz-extension://scoped/' + path }, tabs: { get: vi.fn(async () => ({ url: SOURCE_URL, status: 'complete' })), update, onUpdated: updated, onRemoved: removed }, scripting: { executeScript } } as unknown as typeof chrome;
    await navigatePostingTab(api, 20, '1001');
    expect(update).toHaveBeenCalledWith(20, { url: SOURCE_URL });
    expect(executeScript).toHaveBeenCalledWith({ target: { tabId: 20 }, world: 'MAIN', func: searchPostingById, args: ['1001'] });
    expect(updated.removeListener).toHaveBeenCalledOnce(); expect(removed.removeListener).toHaveBeenCalledOnce();
  });
  it('ignores the opener completing before the SCOPE navigation has been acknowledged', async () => {
    const updated = { addListener: vi.fn(), removeListener: vi.fn() }, removed = { addListener: vi.fn(), removeListener: vi.fn() };
    let acknowledge!: () => void;
    let current: { url?: string; pendingUrl?: string; status: string } = { url: 'moz-extension://scoped/posting.html?id=1001', status: 'complete' };
    const get = vi.fn(async () => current);
    const update = vi.fn(() => new Promise<void>(resolve => { acknowledge = resolve; }));
    const executeScript = vi.fn(async () => [{ result: true }]);
    const api = { runtime: { getURL: (path: string) => 'moz-extension://scoped/' + path }, tabs: { get, update, onUpdated: updated, onRemoved: removed }, scripting: { executeScript } } as unknown as typeof chrome;
    const navigating = navigatePostingTab(api, 20, '1001');
    const event = updated.addListener.mock.calls[0][0];
    event(20, { status: 'complete' }, current);
    expect(get).not.toHaveBeenCalled();
    acknowledge(); await vi.waitFor(() => expect(get).toHaveBeenCalledOnce());
    expect(executeScript).not.toHaveBeenCalled();
    current = { pendingUrl: SOURCE_URL, status: 'complete' }; event(20, { status: 'complete' }, { url: 'moz-extension://scoped/posting.html' });
    await vi.waitFor(() => expect(get).toHaveBeenCalledTimes(2)); expect(executeScript).not.toHaveBeenCalled();
    current = { url: SOURCE_URL, status: 'complete' }; event(20, { status: 'complete' }, {});
    await expect(navigating).resolves.toBeUndefined();
    expect(executeScript).toHaveBeenCalledOnce();
  });
  it('probes the document when Firefox omits URL metadata instead of declaring login expired', async () => {
    const updated = { addListener: vi.fn(), removeListener: vi.fn() }, removed = { addListener: vi.fn(), removeListener: vi.fn() };
    const executeScript = vi.fn().mockResolvedValueOnce([{ result: { url: SOURCE_URL, ready: 'complete' } }]).mockResolvedValueOnce([{ result: true }]);
    const api = { runtime: { getURL: (path: string) => 'moz-extension://scoped/' + path }, tabs: { get: vi.fn(async () => ({ status: 'complete' })), update: vi.fn(async () => ({})), onUpdated: updated, onRemoved: removed }, scripting: { executeScript } } as unknown as typeof chrome;
    await expect(navigatePostingTab(api, 20, '1001')).resolves.toBeUndefined();
    expect(executeScript).toHaveBeenCalledTimes(2);
    expect(executeScript.mock.calls[1][0]).toMatchObject({ world: 'MAIN', args: ['1001'] });
  });
  it('reports an actual external login redirect and cleans up listeners', async () => {
    const updated = { addListener: vi.fn(), removeListener: vi.fn() }, removed = { addListener: vi.fn(), removeListener: vi.fn() };
    const executeScript = vi.fn();
    const api = { runtime: { getURL: (path: string) => 'moz-extension://scoped/' + path }, tabs: { get: vi.fn(async () => ({ status: 'complete', url: 'https://login.example.edu/' })), update: vi.fn(async () => ({})), onUpdated: updated, onRemoved: removed }, scripting: { executeScript } } as unknown as typeof chrome;
    await expect(navigatePostingTab(api, 20, '1001')).rejects.toThrow('redirected');
    expect(executeScript).not.toHaveBeenCalled(); expect(updated.removeListener).toHaveBeenCalledOnce();
  });
  it('reports denied document access as a permission error rather than an expired session', async () => {
    const updated = { addListener: vi.fn(), removeListener: vi.fn() }, removed = { addListener: vi.fn(), removeListener: vi.fn() };
    const executeScript = vi.fn(async () => { throw new Error('Missing host permission'); });
    const api = { runtime: { getURL: (path: string) => 'moz-extension://scoped/' + path }, tabs: { get: vi.fn(async () => ({ status: 'complete' })), update: vi.fn(async () => ({})), onUpdated: updated, onRemoved: removed }, scripting: { executeScript } } as unknown as typeof chrome;
    await expect(navigatePostingTab(api, 20, '1001')).rejects.toThrow('extension permissions');
    expect(updated.removeListener).toHaveBeenCalledOnce();
  });
});
