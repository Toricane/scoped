import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
import { createBackup } from '../src/backup';

let send: ReturnType<typeof vi.fn>;
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
beforeEach(async () => {
  vi.resetModules();
  document.body.innerHTML = new DOMParser().parseFromString(readFileSync('backup.html', 'utf8'), 'text/html').body.innerHTML;
  send = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal('chrome', { runtime: { sendMessage: send } });
  await import('../src/backup-page');
});
function choose(text: string, size = text.length): void {
  Object.defineProperty(element('backup-file'), 'files', { configurable: true, value: [{ size, text: async () => text }] });
  element('backup-file').dispatchEvent(new Event('change'));
}
it('reviews before restoring and Cancel makes no storage request', async () => {
  choose(JSON.stringify(createBackup({})));
  await vi.waitFor(() => expect(element('restore-review').hidden).toBe(false));
  expect(send).not.toHaveBeenCalled();
  element('cancel-restore').click();
  expect(element('restore-review').hidden).toBe(true); expect(send).not.toHaveBeenCalled();
});
it('requires confirmation, prevents duplicate restores, and reports success', async () => {
  const text = JSON.stringify(createBackup({})); choose(text);
  await vi.waitFor(() => expect(element('restore-review').hidden).toBe(false));
  element('confirm-restore').click(); element('confirm-restore').click();
  await vi.waitFor(() => expect(element('backup-status').textContent).toContain('Backup restored'));
  expect(send).toHaveBeenCalledExactlyOnceWith({ type: 'restoreBackup', text });
  expect(element('restore-review').hidden).toBe(true);
});
it('rejects invalid/oversized files before sending and preserves review after storage failure', async () => {
  choose('{}'); await vi.waitFor(() => expect(element('error').hidden).toBe(false));
  expect(send).not.toHaveBeenCalled();
  choose('{}', 26 * 1024 * 1024); await vi.waitFor(() => expect(element('error').textContent).toContain('25 MB'));
  choose(JSON.stringify(createBackup({}))); await vi.waitFor(() => expect(element('restore-review').hidden).toBe(false));
  send.mockResolvedValue({ ok: false, error: 'quota' }); element('confirm-restore').click();
  await vi.waitFor(() => expect(element('error').textContent).toBe('quota'));
  expect(element('restore-review').hidden).toBe(false);
  expect(element<HTMLButtonElement>('confirm-restore').disabled).toBe(false);
});
