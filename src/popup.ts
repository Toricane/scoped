import { api, request } from './api';
import { isActive } from './store';
import { isSourceUrl, type RunState, type Snapshot } from './types';
import './popup.css';
import { mountSiteAccess } from './site-access';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const start = element<HTMLButtonElement>('start');
const cancel = element<HTMLButtonElement>('cancel');
const csv = element<HTMLButtonElement>('csv');
const json = element<HTMLButtonElement>('json');
const error = element<HTMLParagraphElement>('error');
let tabId: number | undefined;
let snapshot: Snapshot | undefined;
let pending = false;
let run: RunState | undefined;

function showError(value?: unknown): void {
  error.hidden = value === undefined;
  error.textContent = value instanceof Error ? value.message : String(value ?? '');
}

function render(): void {
  const active = isActive(run);
  start.disabled = tabId === undefined || active || pending;
  start.textContent = snapshot ? 'Refresh collection' : 'Start collection';
  cancel.disabled = !active || pending || run?.status === 'canceling';
  csv.disabled = json.disabled = !snapshot;
  element('source-hint').textContent = tabId === undefined ? 'Open SCOPE search results to collect or refresh. Your saved postings are ready to view above.' : 'Collect every page of this search. Your SCOPE filters stay in place.';
  element('status').textContent = run?.message ?? (tabId === undefined ? 'Collection needs an open SCOPE results tab.' : 'Ready to collect your current search.');
  element('status').hidden = (!run && tabId === undefined) || run?.status === 'complete';
  element('progress').hidden = !active;
  element('counts').hidden = !run;
  element('counts').textContent = run ? `Page ${run.currentPage || '—'} · ${run.collected.toLocaleString()} / ${run.total.toLocaleString()} postings` : 'No collection running.';
  const progress = element<HTMLProgressElement>('progress');
  progress.max = Math.max(1, run?.total ?? 1);
  progress.value = run?.status === 'complete' && run.total === 0 ? 1 : run?.collected ?? 0;
  element('snapshot').textContent = snapshot ? `${snapshot.postings.length.toLocaleString()} postings · Collected ${new Date(snapshot.collectedAt).toLocaleString()}` : 'No snapshot saved yet.';
}

async function refresh(): Promise<void> {
  try {
    const state = await request<{ run?: RunState; snapshot?: Snapshot }>({ type: 'getState', tabId: tabId ?? -1 });
    run = state.run;
    snapshot = state.snapshot;
    render();
  } catch (value) { showError(value); }
}

async function action(type: 'start' | 'cancel'): Promise<void> {
  if (tabId === undefined) return;
  pending = true;
  showError();
  render();
  try { await request({ type, tabId }); } catch (value) { showError(value); }
  finally { pending = false; await refresh(); }
}

async function download(format: 'csv' | 'json'): Promise<void> {
  if (!snapshot) return;
  showError();
  try {
    await request({ type: 'download', format });
  } catch (value) { showError(value); }
}

start.addEventListener('click', () => void action('start'));
cancel.addEventListener('click', () => void action('cancel'));
csv.addEventListener('click', () => void download('csv'));
json.addEventListener('click', () => void download('json'));
element('view').addEventListener('click', () => { void api.tabs.create({ url: api.runtime.getURL('viewer.html') }).catch(showError); });
element('view-saved').addEventListener('click', () => { void api.tabs.create({ url: api.runtime.getURL('viewer.html?view=saved') }).catch(showError); });
api.storage.onChanged.addListener((_changes, area) => { if (area === 'local') void refresh(); });
async function initialize(): Promise<void> {
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (tab?.id !== undefined && isSourceUrl(tab.url)) tabId = tab.id;
    await refresh();
  } catch (value) { showError(value); render(); }
}
void initialize();
mountSiteAccess(element('site-access'), initialize);

element('view-applied').addEventListener('click', () => { void api.tabs.create({ url: api.runtime.getURL('viewer.html?view=applied') }).catch(showError); });
