import { request } from './api';
import { backupLimit, backupSummary, parseBackup } from './backup';
import './popup.css';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const file = element<HTMLInputElement>('backup-file');
const download = element<HTMLButtonElement>('download-backup');
const confirm = element<HTMLButtonElement>('confirm-restore');
const cancel = element<HTMLButtonElement>('cancel-restore');
let text: string | undefined;
let revision = 0;
let busy = false;
function error(value?: unknown): void {
  element('error').hidden = value === undefined;
  element('error').textContent = value instanceof Error ? value.message : String(value ?? '');
}
function reset(): void {
  revision++; text = undefined; file.value = ''; element('restore-review').hidden = true;
}
function setBusy(value: boolean): void {
  busy = value; file.disabled = download.disabled = confirm.disabled = cancel.disabled = value;
}
file.addEventListener('change', () => {
  const selected = file.files?.[0]; const current = ++revision;
  text = undefined; element('restore-review').hidden = true; error(); element('backup-status').textContent = '';
  if (!selected) return;
  void (async () => {
    try {
      if (selected.size > backupLimit) throw new Error('Backup exceeds the 25 MB limit.');
      const contents = await selected.text();
      const backup = parseBackup(contents);
      if (current !== revision) return;
      text = contents;
      element('backup-summary').textContent = backupSummary(backup);
      element('backup-date').textContent = `Backed up ${new Date(backup.exportedAt).toLocaleString()}`;
      element('restore-review').hidden = false;
    } catch (value) { if (current === revision) error(value); }
  })();
});
cancel.addEventListener('click', () => { reset(); file.focus(); });
download.addEventListener('click', () => {
  if (busy) return;
  setBusy(true); error(); element('backup-status').textContent = 'Preparing backup…';
  void request({ type: 'downloadBackup' }).then(() => {
    element('backup-status').textContent = 'Backup download requested. Check your browser’s downloads for completion before switching installations.';
  }).catch(value => { element('backup-status').textContent = ''; error(value); }).finally(() => setBusy(false));
});
confirm.addEventListener('click', () => {
  if (busy || text === undefined) return;
  setBusy(true); error(); element('backup-status').textContent = 'Restoring…';
  void request({ type: 'restoreBackup', text }).then(() => {
    reset(); element('backup-status').textContent = 'Backup restored. Reopen viewer tabs to load your restored preferences.'; file.focus();
  }).catch(value => { element('backup-status').textContent = ''; error(value); }).finally(() => { setBusy(false); file.focus(); });
});
