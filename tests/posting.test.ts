import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

let sendMessage: ReturnType<typeof vi.fn>;
let contains: ReturnType<typeof vi.fn>;
let requestAccess: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetModules();
  document.body.innerHTML = new DOMParser().parseFromString(readFileSync('posting.html', 'utf8'), 'text/html').body.innerHTML;
  vi.stubGlobal('location', { href: 'chrome-extension://scoped/posting.html?id=1001' });
  sendMessage = vi.fn(async () => ({ ok: true, value: undefined }));
  contains = vi.fn(async () => true);
  requestAccess = vi.fn(async () => true);
  vi.stubGlobal('chrome', { permissions: { contains, request: requestAccess }, tabs: { getCurrent: vi.fn(async () => ({ id: 20 })) }, runtime: { sendMessage } });
});
afterEach(() => vi.unstubAllGlobals());
it('identifies its own extension tab and requests opening only that posting', async () => {
  await import('../src/posting');
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'openPosting', id: '1001', tabId: 20 }));
});
it('shows errors and allows retry without silently starting another collection', async () => {
  sendMessage.mockResolvedValueOnce({ ok: false, error: 'Sign in to SCOPE and retry.' });
  await import('../src/posting');
  await vi.waitFor(() => expect(document.getElementById('retry')!.hidden).toBe(false));
  expect(document.getElementById('message')!.textContent).toContain('Sign in');
  document.getElementById('retry')!.click();
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledTimes(2));
  expect(sendMessage.mock.calls.every(([command]) => command.type === 'openPosting')).toBe(true);
});
it('displays a redirected navigation error until the user explicitly retries', async () => {
  vi.stubGlobal('location', { href: 'chrome-extension://scoped/posting.html?id=1001&error=Session%20expired' });
  await import('../src/posting'); expect(sendMessage).not.toHaveBeenCalled();
  expect(document.getElementById('message')!.textContent).toBe('Session expired');
  document.getElementById('retry')!.click();
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
});
it('stays in setup without navigating or prompting until access is explicitly granted', async () => {
  contains.mockResolvedValue(false);
  requestAccess.mockImplementation(async () => { contains.mockResolvedValue(true); return true; });
  await import('../src/posting');
  await vi.waitFor(() => expect(document.getElementById('retry')!.hidden).toBe(false));
  expect(sendMessage).not.toHaveBeenCalled();
  expect(requestAccess).not.toHaveBeenCalled();
  document.getElementById('allow-access')!.click();
  // The request happens synchronously during the click, before any awaited operation.
  expect(requestAccess).toHaveBeenCalledWith({ origins: ['https://scope.sciencecoop.ubc.ca/*'] });
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'openPosting', id: '1001', tabId: 20 }));
});
it('shows browser instructions after denial and does not open the posting', async () => {
  contains.mockResolvedValue(false); requestAccess.mockResolvedValue(false);
  await import('../src/posting');
  await vi.waitFor(() => expect(document.getElementById('retry')!.hidden).toBe(false));
  document.getElementById('allow-access')!.click();
  await vi.waitFor(() => expect(document.getElementById('access-status')!.textContent).toContain('not granted'));
  expect((document.getElementById('access-help') as HTMLDetailsElement).open).toBe(true);
  expect(sendMessage).not.toHaveBeenCalled();
});
it('offers Firefox and Chrome manual setup when the permission request fails', async () => {
  contains.mockResolvedValue(false); requestAccess.mockRejectedValue(new Error('Browser refused'));
  await import('../src/posting');
  document.getElementById('allow-access')!.click();
  await vi.waitFor(() => expect(document.getElementById('access-status')!.textContent).toContain('could not enable'));
  expect(document.getElementById('access-help')!.textContent).toContain('Always Allow on scope.sciencecoop.ubc.ca');
  expect(document.getElementById('access-help')!.textContent).toContain('On specific sites');
  expect(sendMessage).not.toHaveBeenCalled();
  contains.mockResolvedValue(true);
  document.getElementById('retry')!.click();
  await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledOnce());
});
