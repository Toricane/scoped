import { api, request } from './api';
import type { Posting, Snapshot } from './types';
import { columnLabels, defaults, fold, indexPostings, positionTitle, preferencesKey, readPreferences, selectPostings, validateSnapshot, type Column, type IndexedPosting, type Preferences } from './viewer-model';
import './viewer.css';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result; };
let preferences = defaults(), snapshot: Snapshot | undefined, index: IndexedPosting[] = [], page = 1, matches: Posting[] = [];
let loadRevision = 0, timer: ReturnType<typeof setTimeout> | undefined, writeQueue: Promise<unknown> = Promise.resolve();
let preferencesLoaded = false;
const expanded = new Set<string>();
const facetDefs = [ ['organizations', 'organization', 'Organizations', 'facets'], ['locations', 'location', 'Locations', 'facets'], ['statuses', 'applicationStatus', 'Application status', 'extra-facets'], ['terms', 'term', 'Term', 'extra-facets'] ] as const;

function error(value?: unknown): void { const target = element('error'); target.hidden = value === undefined; target.textContent = value instanceof Error ? value.message : String(value ?? ''); }
function save(): void {
  const value = structuredClone(preferences);
  writeQueue = writeQueue.catch(() => {}).then(() => api.storage.local.set({ [preferencesKey]: value })).catch(error);
}
function changed(): void { page = 1; save(); render(); }
function fillControls(): void {
  for (const id of ['query', 'exclude', 'scope', 'isNew', 'shortlisted', 'from', 'to', 'min', 'max', 'sort', 'direction', 'pageSize'] as const) element<HTMLInputElement | HTMLSelectElement>(id).value = String(preferences[id]);
  element<HTMLInputElement>('unknownDeadline').checked = preferences.unknownDeadline;
  document.querySelectorAll<HTMLInputElement>('#column-options input').forEach(input => { input.checked = preferences.columns.includes(input.value as Column); });
}
function makeFacets(): void {
  element('facets').replaceChildren(); element('extra-facets').replaceChildren();
  for (const [key, field, title, parent] of facetDefs) {
    const group = node('fieldset'); group.className = 'facet'; group.append(node('legend', title));
    const search = node('input'); search.type = 'search'; search.placeholder = `Find ${title.toLowerCase()}`; search.setAttribute('aria-label', `Find ${title.toLowerCase()}`); search.className = 'facet-search';
    const options = node('div'); options.className = 'facet-options';
    const values = new Map<string, number>();
    snapshot?.postings.forEach(row => values.set(row[field], (values.get(row[field]) ?? 0) + 1));
    preferences[key].forEach(value => { if (!values.has(value)) values.set(value, 0); });
    const draw = () => {
      options.replaceChildren();
      for (const [value, count] of [...values].sort(([a], [b]) => a.localeCompare(b))) {
        const labelText = value || (key === 'statuses' ? 'No status (blank)' : 'Blank');
        if (!fold(labelText).includes(fold(search.value))) continue;
        const label = node('label'); label.className = 'check';
        const input = node('input'); input.type = 'checkbox'; input.checked = preferences[key].includes(value);
        input.addEventListener('change', () => { preferences[key] = input.checked ? [...preferences[key], value] : preferences[key].filter(entry => entry !== value); changed(); });
        const countLabel = node('span', String(count)); countLabel.className = 'facet-count';
        label.append(input, node('span', labelText), countLabel); options.append(label);
      }
    };
    search.addEventListener('input', draw); group.append(search, options); element(parent).append(group); draw();
  }
}
function chips(): void {
  const target = element('chips'); target.replaceChildren();
  const add = (text: string, remove: () => void) => { const button = node('button', `${text} ×`); button.setAttribute('aria-label', `Remove filter: ${text}`); button.addEventListener('click', () => { remove(); fillControls(); makeFacets(); changed(); }); target.append(button); };
  for (const [key, , title] of facetDefs) for (const value of preferences[key]) add(`${title}: ${value || 'No status (blank)'}`, () => { preferences[key] = preferences[key].filter(entry => entry !== value); });
  if (preferences.query) add(`Search: ${preferences.query}`, () => { preferences.query = ''; });
  if (preferences.exclude) add(`Exclude: ${preferences.exclude}`, () => { preferences.exclude = ''; });
  for (const key of ['isNew', 'shortlisted'] as const) if (preferences[key] !== 'all') add(`${key === 'isNew' ? 'New on SCOPE' : 'Shortlisted'}: ${preferences[key]}`, () => { preferences[key] = 'all'; });
  for (const [key, label] of [['from', 'Deadline from'], ['to', 'Deadline through'], ['min', 'Minimum applications'], ['max', 'Maximum applications']] as const) if (preferences[key]) add(`${label}: ${preferences[key]}`, () => { preferences[key] = ''; });
  if (preferences.unknownDeadline) add('Unknown deadlines', () => { preferences.unknownDeadline = false; });
}
function display(row: Posting, key: Column): string {
  if (key === 'jobTitle') return positionTitle(row);
  if (key === 'isNew' || key === 'shortlisted') return row[key] ? 'Yes' : 'No';
  return String(row[key]);
}
function details(row: Posting): HTMLTableRowElement {
  const tr = node('tr'); tr.className = 'expanded'; tr.id = `details-${row.id}`;
  const td = node('td'); td.colSpan = preferences.columns.length + 1;
  const list = node('dl');
  for (const [key, label] of Object.entries(columnLabels)) list.append(node('dt', label), node('dd', display(row, key as Column) || '—'));
  const copy = node('button', 'Copy posting ID'); copy.addEventListener('click', () => { void navigator.clipboard.writeText(row.id).then(() => { copy.textContent = 'ID copied'; }, error); });
  td.append(list, copy); tr.append(td); return tr;
}
function render(): void {
  matches = selectPostings(index, preferences);
  const pages = Math.max(1, Math.ceil(matches.length / preferences.pageSize)); page = Math.min(page, pages);
  element('count').textContent = `${matches.length.toLocaleString()} matching / ${(snapshot?.postings.length ?? 0).toLocaleString()} postings`;
  const empty = element('empty'); empty.hidden = Boolean(snapshot && matches.length);
  empty.textContent = snapshot ? 'No postings match these filters. Try Clear filters.' : 'No snapshot saved yet. Open SCOPE search results, click Scoped, and start a collection.';
  element('postings').hidden = !snapshot || !matches.length;
  element<HTMLButtonElement>('csv').disabled = element<HTMLButtonElement>('json').disabled = !snapshot;
  element<HTMLButtonElement>('previous').disabled = page <= 1; element<HTMLButtonElement>('next').disabled = page >= pages;
  element('page-label').textContent = `Page ${page} of ${pages}`;
  const head = node('tr');
  for (const key of preferences.columns) {
    const th = node('th'); th.scope = 'col';
    if (preferences.sort === key) th.setAttribute('aria-sort', preferences.direction === 'asc' ? 'ascending' : 'descending');
    const button = node('button', columnLabels[key] + (preferences.sort === key ? preferences.direction === 'asc' ? ' ↑' : ' ↓' : ''));
    button.addEventListener('click', () => { preferences.direction = preferences.sort === key && preferences.direction === 'asc' ? 'desc' : 'asc'; preferences.sort = key; fillControls(); changed(); });
    th.append(button); head.append(th);
  }
  const actionHead = node('th', 'Actions'); actionHead.scope = 'col'; head.append(actionHead); element('headers').replaceChildren(head);
  const fragment = document.createDocumentFragment();
  for (const row of matches.slice((page - 1) * preferences.pageSize, page * preferences.pageSize)) {
    const tr = node('tr');
    for (const key of preferences.columns) {
      const td = node('td'); td.dataset.column = key;
      if (key === 'isNew' || key === 'shortlisted') { if (row[key]) { const badge = node('span', key === 'isNew' ? 'New' : 'Shortlisted'); badge.className = 'badge'; td.append(badge); } else td.textContent = '—'; }
      else if (key === 'jobTitle') {
        const link = node('a', positionTitle(row)); link.href = api.runtime.getURL(`posting.html?id=${encodeURIComponent(row.id)}`); link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', `Open ${positionTitle(row)} in a new tab`); td.append(link);
      } else td.textContent = display(row, key) || '—';
      tr.append(td);
    }
    const actions = node('td'); actions.className = 'actions-cell';
    const toggle = node('button', expanded.has(row.id) ? 'Hide details' : 'Details'); toggle.className = 'secondary'; toggle.dataset.details = row.id; toggle.setAttribute('aria-expanded', String(expanded.has(row.id))); if (expanded.has(row.id)) toggle.setAttribute('aria-controls', `details-${row.id}`);
    toggle.addEventListener('click', () => { if (expanded.has(row.id)) expanded.delete(row.id); else expanded.add(row.id); render(); document.querySelector<HTMLButtonElement>(`button[data-details="${row.id}"]`)?.focus(); });
    actions.append(toggle); tr.append(actions); fragment.append(tr); if (expanded.has(row.id)) fragment.append(details(row));
  }
  element('rows').replaceChildren(fragment); chips();
}
function reset(): void {
  const { sort, direction, pageSize, columns } = preferences;
  preferences = { ...defaults(), sort, direction, pageSize, columns }; fillControls(); makeFacets(); changed();
}
for (const [key, label] of Object.entries(columnLabels)) {
  const option = node('option', label); option.value = key; element('sort').append(option);
  const check = node('input'); check.type = 'checkbox'; check.value = key; check.disabled = key === 'jobTitle';
  const labelNode = node('label'); labelNode.className = 'check'; labelNode.append(check, node('span', label)); element('column-options').append(labelNode);
  check.addEventListener('change', () => { preferences.columns = check.checked ? [...preferences.columns, key as Column] : preferences.columns.filter(column => column !== key); changed(); });
}
for (const id of ['query', 'exclude', 'scope', 'isNew', 'shortlisted', 'from', 'to', 'min', 'max', 'sort', 'direction', 'pageSize', 'unknownDeadline'] as const) {
  const control = element<HTMLInputElement | HTMLSelectElement>(id);
  control.addEventListener(id === 'query' || id === 'exclude' ? 'input' : 'change', () => {
    preferencesLoaded = true;
    if (id === 'unknownDeadline') preferences.unknownDeadline = (control as HTMLInputElement).checked;
    else if (id === 'pageSize') preferences.pageSize = Number(control.value) as Preferences['pageSize'];
    else if (id === 'min' || id === 'max') {
      if (control.value && (!Number.isSafeInteger(Number(control.value)) || Number(control.value) < 0)) { error('Application counts must be whole numbers of zero or more.'); return; }
      preferences[id] = control.value;
    } else Object.assign(preferences, { [id]: control.value });
    error();
    if (timer) clearTimeout(timer);
    if (id === 'query' || id === 'exclude') timer = setTimeout(changed, 60); else changed();
  });
}
element('previous').addEventListener('click', () => { page--; render(); }); element('next').addEventListener('click', () => { page++; render(); }); element('reset').addEventListener('click', reset);
for (const format of ['csv', 'json'] as const) element(format).addEventListener('click', () => { void request({ type: 'download', format }).catch(error); });

async function load(initial = false): Promise<void> {
  const revision = ++loadRevision;
  try {
    const stored = await api.storage.local.get(!preferencesLoaded ? ['snapshot', preferencesKey] : ['snapshot']);
    if (revision !== loadRevision) return;
    if (!preferencesLoaded) { preferences = readPreferences(stored[preferencesKey]); preferencesLoaded = true; fillControls(); }
    snapshot = stored.snapshot === undefined ? undefined : validateSnapshot(stored.snapshot);
    index = indexPostings(snapshot?.postings ?? []); page = 1; expanded.clear();
    element('snapshot-info').textContent = snapshot ? `${snapshot.postings.length.toLocaleString()} postings · Collected ${new Date(snapshot.collectedAt).toLocaleString()}` : 'Your saved SCOPE search, ready to explore.';
    element('update').hidden = initial || !snapshot;
    error(); makeFacets(); render();
  } catch (value) { if (revision === loadRevision) { snapshot = undefined; index = []; render(); error(value); } }
}
fillControls();
if (window.matchMedia?.('(max-width: 900px)').matches) element<HTMLDetailsElement>('filter-panel').open = false;
// Register after starting the initial read. A newer event invalidates that read.
void load(true);
api.storage.onChanged.addListener((changes, area) => { if (area === 'local' && Object.hasOwn(changes, 'snapshot')) void load(); });
