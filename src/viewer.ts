import { greaterVancouverKey, greaterVancouverCities, locationChoice, locationLabel, regroupSelections } from './location-groups';
import { api, request } from './api';
import type { Posting, Snapshot } from './types';
import { readRemovedSaved, removedSavedPrefix, readApplied, appliedPostings, appliedPrefix, type AppliedPosting, readSaved, savedPostings, savedPrefix, type SavedPosting } from './saved';
import type { LocationExplorer } from './globe';
import { columnLabels, defaults, fold, indexPostings, isExpired, positionTitle, relativeDeadline, relativeDeadlineTime, preferencesKey, readPreferences, selectPostings, validateSnapshot, type Column, type FacetOrder, type IndexedPosting, type Preferences } from './viewer-model';
import './viewer.css';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result; };
let preferences = defaults(), snapshot: Snapshot | undefined, index: IndexedPosting[] = [], page = 1, matches: Posting[] = [];
let loadRevision = 0, timer: ReturnType<typeof setTimeout> | undefined, writeQueue: Promise<unknown> = Promise.resolve();
let preferencesLoaded = false;
const expanded = new Set<string>();
const savedMode = new URL(location.href).searchParams.get('view') === 'saved';
const appliedMode = new URL(location.href).searchParams.get('view') === 'applied';
const libraryMode = savedMode || appliedMode;
const preferenceStorageKey = savedMode ? 'viewerPreferences:saved:v1' : appliedMode ? 'viewerPreferences:applied:v1' : preferencesKey;
let removedSaved = new Set<string>();
function isSaved(row: Posting): boolean { return !removedSaved.has(row.id) && (saved.has(row.id) || Boolean(snapshot?.postings.some(current => current.id === row.id && current.shortlisted))); }
let applied = new Map<string, AppliedPosting>();
const markingApplied = new Set<string>();
function rebuildLibrary(): void {
  libraryPostings = savedMode ? savedPostings(saved, snapshot, applied, removedSaved) : appliedMode ? appliedPostings(applied, snapshot) : snapshot?.postings ?? [];
  index = indexPostings(libraryPostings);
}
let saved = new Map<string, SavedPosting>(), libraryPostings: Posting[] = [];
let globe: LocationExplorer | undefined, globeLoading = false, mapView = false;
const saving = new Set<string>();
element<HTMLAnchorElement>('saved-tab').href = api.runtime.getURL('viewer.html?view=saved');
element<HTMLAnchorElement>('all-tab').href = api.runtime.getURL('viewer.html');
element<HTMLAnchorElement>('applied-tab').href = api.runtime.getURL('viewer.html?view=applied');
element(appliedMode ? 'applied-tab' : savedMode ? 'saved-tab' : 'all-tab').setAttribute('aria-current', 'page');
if (libraryMode) {
  element<HTMLAnchorElement>(appliedMode ? 'applied-tab' : 'saved-tab').target = '_self'; document.title = appliedMode ? 'Scoped — Applied postings' : 'Scoped — Saved postings';
  document.querySelector('.export-menu summary')!.textContent = 'Export SCOPE collection ↓';
  document.querySelector('.export-menu .help')!.textContent = 'Exports contain the full latest SCOPE collection, not local Saved or Applied records.';
}
const facetDefs = [ ['organizations', 'organization', 'Organizations', 'facets'], ['locations', 'location', 'Locations', 'facets'], ['statuses', 'applicationStatus', 'Application status', 'extra-facets'], ['terms', 'term', 'Term', 'extra-facets'] ] as const;

function error(value?: unknown): void { const target = element('error'); target.hidden = value === undefined; target.textContent = value instanceof Error ? value.message : String(value ?? ''); }
function save(): void {
  const value = structuredClone(preferences);
  writeQueue = writeQueue.catch(() => {}).then(() => api.storage.local.set({ [preferenceStorageKey]: value })).catch(error);
}
function changed(): void { page = 1; save(); render(); }
function fillControls(): void {
  for (const id of ['query', 'exclude', 'scope', 'isNew', 'shortlisted', 'from', 'to', 'min', 'max', 'sort', 'direction', 'pageSize'] as const) element<HTMLInputElement | HTMLSelectElement>(id).value = String(preferences[id]);
  for (const id of ['unknownDeadline', 'hideExpired', 'expiredLast', 'relativeDeadlines'] as const) element<HTMLInputElement>(id).checked = preferences[id];
  document.querySelectorAll<HTMLInputElement>('#column-options input').forEach(input => { input.checked = preferences.columns.includes(input.value as Column); });
}
function makeFacets(clearSearch = false): void {
  const searches = new Map([...document.querySelectorAll<HTMLElement>('.facet')].map(group => [group.dataset.facet, group.querySelector<HTMLInputElement>('input[type="search"]')?.value ?? '']));
  element('facets').replaceChildren(); element('extra-facets').replaceChildren();
  for (const [key, field, title, parent] of facetDefs) {
    const group = node('fieldset'); group.className = 'facet'; group.dataset.facet = key;
    const legend = node('legend', title), selected = node('span'); selected.className = 'facet-selected'; legend.append(selected); group.append(legend);
    const search = node('input'); search.type = 'search'; search.placeholder = `Find ${title.toLowerCase()}`; search.setAttribute('aria-label', `Find ${title.toLowerCase()}`); search.className = 'facet-search';
    const options = node('div'); options.className = 'facet-options';
    search.value = clearSearch ? '' : searches.get(key) ?? '';
    const orderLabel = node('label', 'Options order'); orderLabel.className = 'facet-sort';
    const order = node('select'); order.setAttribute('aria-label', `Sort ${title.toLowerCase()} options`);
    for (const [value, text] of [['az', 'Name A–Z'], ['za', 'Name Z–A'], ['count', 'Most postings'], ['selected', 'Selected first']]) {
      const option = node('option', text); option.value = value; order.append(option);
    }
    order.value = preferences.facetOrder[key]; orderLabel.append(order);
    const values = new Map<string, number>();
    libraryPostings.forEach(row => { const value = key === 'locations' ? locationChoice(row.location, preferences.groupGreaterVancouver) : row[field]; values.set(value, (values.get(value) ?? 0) + 1); });
    preferences[key].forEach(value => { if (!values.has(value)) values.set(value, 0); });
    const draw = () => {
      options.replaceChildren();
      selected.textContent = preferences[key].length ? `${preferences[key].length} selected` : '';
      const ordered = [...values].sort(([a, ac], [b, bc]) => {
        const names = (key === 'locations' ? locationLabel(a) : a).localeCompare(key === 'locations' ? locationLabel(b) : b);
        if (order.value === 'count') return bc - ac || names;
        if (order.value === 'selected') return Number(preferences[key].includes(b)) - Number(preferences[key].includes(a)) || names;
        return order.value === 'za' ? -names : names;
      });
      for (const [value, count] of ordered) {
        const labelText = (key === 'locations' ? locationLabel(value) : value) || (key === 'statuses' ? 'No status (blank)' : 'Blank');
        const searchable = value === greaterVancouverKey ? `${labelText} ${greaterVancouverCities.join(' ')}` : labelText;
        if (!fold(searchable).includes(fold(search.value))) continue;
        const label = node('label'); label.className = 'check';
        const input = node('input'); input.type = 'checkbox'; input.value = value; input.checked = preferences[key].includes(value);
        input.addEventListener('change', () => {
          preferences[key] = input.checked ? [...preferences[key], value] : preferences[key].filter(entry => entry !== value);
          preferencesLoaded = true; changed();
          selected.textContent = preferences[key].length ? `${preferences[key].length} selected` : '';
          if (order.value === 'selected') { draw(); [...options.querySelectorAll<HTMLInputElement>('input')].find(check => check.value === value)?.focus(); }
        });
        const countLabel = node('span', String(count)); countLabel.className = 'facet-count';
        countLabel.title = `${count} postings in the saved collection`;
        label.append(input, node('span', labelText), countLabel); options.append(label);
      }
      if (!options.childElementCount) { const empty = node('p', 'No options match. Try another name.'); empty.className = 'facet-empty'; options.append(empty); }
    };
    order.addEventListener('change', () => { preferencesLoaded = true; preferences.facetOrder[key] = order.value as FacetOrder; save(); draw(); });
    search.addEventListener('input', draw);
    if (key === 'locations') {
      const label = node('label'); label.className = 'check'; const checkbox = node('input'); checkbox.type = 'checkbox'; checkbox.id = 'groupGreaterVancouver'; checkbox.checked = preferences.groupGreaterVancouver;
      label.append(checkbox, node('span', 'Group Greater Vancouver'));
      const help = node('p', `${greaterVancouverCities.join(', ')}. Grouping a selected city includes all six.`); help.className = 'help';
      checkbox.addEventListener('change', () => { preferencesLoaded = true; preferences.groupGreaterVancouver = checkbox.checked; preferences.locations = regroupSelections(preferences.locations, checkbox.checked, libraryPostings.map(row => row.location)); makeFacets(); changed(); element('groupGreaterVancouver')?.focus(); });
      group.append(label, help);
    }
    group.append(search, orderLabel, options); element(parent).append(group); draw();
  }
}
function chips(): void {
  const target = element('chips'); target.replaceChildren();
  const add = (text: string, remove: () => void) => { const button = node('button', `${text} ×`); button.setAttribute('aria-label', `Remove filter: ${text}`); button.addEventListener('click', () => { remove(); fillControls(); makeFacets(); changed(); }); target.append(button); };
  for (const [key, , title] of facetDefs) for (const value of preferences[key]) add(`${title}: ${(key === 'locations' ? locationLabel(value) : value) || 'No status (blank)'}`, () => { preferences[key] = preferences[key].filter(entry => entry !== value); });
  if (preferences.query) add(`Search: ${preferences.query}`, () => { preferences.query = ''; });
  if (preferences.exclude) add(`Exclude: ${preferences.exclude}`, () => { preferences.exclude = ''; });
  for (const key of ['isNew', 'shortlisted'] as const) if (preferences[key] !== 'all') add(`${key === 'isNew' ? 'New on SCOPE' : 'Shortlisted'}: ${preferences[key]}`, () => { preferences[key] = 'all'; });
  for (const [key, label] of [['from', 'Deadline from'], ['to', 'Deadline through'], ['min', 'Minimum applications'], ['max', 'Maximum applications']] as const) if (preferences[key]) add(`${label}: ${preferences[key]}`, () => { preferences[key] = ''; });
  if (preferences.hideExpired) add('Hide expired', () => { preferences.hideExpired = false; });
  if (preferences.unknownDeadline) add('Unknown deadlines', () => { preferences.unknownDeadline = false; });
}
function display(row: Posting, key: Column): string {
  if (key === 'jobTitle') return positionTitle(row);
  if (key === 'isNew' || key === 'shortlisted') return row[key] ? 'Yes' : 'No';
  return String(row[key]);
}
function deadlineHover(target: HTMLElement, text: string, relativeShown = false): void {
  const update = () => {
    const counterpart = relativeShown ? text : relativeDeadlineTime(text);
    if (counterpart) { target.title = counterpart; target.setAttribute('aria-label', `${target.textContent}; ${counterpart} in your local timezone`); }
  };
  update(); target.addEventListener('mouseenter', update); target.addEventListener('focus', update);
}
function details(row: Posting): HTMLTableRowElement {
  const tr = node('tr'); tr.className = 'expanded'; tr.id = `details-${row.id}`;
  const td = node('td'); td.colSpan = preferences.columns.length + 1;
  const list = node('dl');
  for (const [key, label] of Object.entries(columnLabels)) { const field = node('div'); const value = node('dd', display(row, key as Column) || '—'); if (key === 'deadlineText') deadlineHover(value, row.deadlineText); field.append(node('dt', label), value); list.append(field); }
  const copy = node('button', 'Copy posting ID'); copy.addEventListener('click', () => { void navigator.clipboard.writeText(row.id).then(() => { copy.textContent = 'ID copied'; }, error); });
  td.append(list, copy); tr.append(td); return tr;
}
function render(): void {
  matches = selectPostings(index, preferences);
  const searchOptions = Number(preferences.scope === 'title') + Number(Boolean(preferences.exclude));
  document.querySelector('.search-options summary')!.textContent = searchOptions ? `Search options · ${searchOptions}` : 'Search options';
  const pages = Math.max(1, Math.ceil(matches.length / preferences.pageSize)); page = Math.min(page, pages);
  element('count').textContent = `${matches.length.toLocaleString()} matching / ${libraryPostings.length.toLocaleString()} postings`;
  element('saved-count').textContent = String(savedPostings(saved, snapshot, applied, removedSaved).length);
  element('applied-count').textContent = String(applied.size);
  if (libraryMode) element('snapshot-info').textContent = appliedMode ? `${libraryPostings.length} Applied postings · Marked locally in Scoped` : `${libraryPostings.length} Saved postings · Local saves + SCOPE shortlist · Applied positions are separate`;
  document.querySelector('.notice')!.textContent = savedMode ? 'Saved includes local saves and your captured SCOPE shortlist. Remove from Saved stays removed after refresh; use Save in All postings to restore it.' : appliedMode ? 'Marked as already applied, locally in Scoped. Undo Applied to return a position to Saved when applicable.' : 'Save positions to review later · Mark applications already submitted · Click a title to open SCOPE';
  element('visible-range').textContent = mapView ? `${matches.length.toLocaleString()} filtered postings · Select a city to see its positions` : matches.length ? `Showing ${((page - 1) * preferences.pageSize + 1).toLocaleString()}–${Math.min(page * preferences.pageSize, matches.length).toLocaleString()} · Click a position to open in SCOPE` : 'Search and filter your saved collection';
  element('sort').closest('label')!.hidden = mapView; element('direction').closest('label')!.hidden = mapView; document.querySelector<HTMLElement>('.columns')!.hidden = mapView;
  const empty = element('empty'); empty.hidden = Boolean(snapshot && matches.length);
  empty.textContent = appliedMode && !libraryPostings.length ? 'No Applied positions yet. Use Mark applied after submitting an application.' : savedMode && !libraryPostings.length ? 'No Saved postings yet. Use Save on any position in All postings. Saves stay local to Scoped.' : snapshot || libraryMode ? 'No postings match these filters. Try Clear filters.' : 'No snapshot saved yet. Open SCOPE search results, click Scoped, and start a collection.';
  empty.hidden = Boolean((snapshot || libraryMode) && matches.length);
  element('postings').hidden = (!snapshot && !libraryMode) || !matches.length;
  element('globe-view').hidden = !mapView;
  document.querySelector<HTMLElement>('.table-scroll')!.hidden = mapView;
  document.querySelector<HTMLElement>('.pagination')!.hidden = mapView;
  element('list-view').setAttribute('aria-pressed', String(!mapView)); element('map-view').setAttribute('aria-pressed', String(mapView));
  if (mapView) {
    if (globe) globe.update(matches, preferences.groupGreaterVancouver);
    else if (!globeLoading) {
      globeLoading = true;
      void import('./globe').then(({ LocationExplorer }) => {
        globe = new LocationExplorer(element('globe-view'), locations => {
          preferences.locations = regroupSelections(locations, preferences.groupGreaterVancouver, libraryPostings.map(row => row.location)); mapView = false; fillControls(); makeFacets(); changed();
        }); globe.update(matches, preferences.groupGreaterVancouver);
      }).catch(error).finally(() => { globeLoading = false; });
    }
  }
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
  const actionHead = node('th', ''); actionHead.scope = 'col'; actionHead.append(node('span', 'Your actions')); head.append(actionHead); element('headers').replaceChildren(head);
  const fragment = document.createDocumentFragment();
  for (const row of matches.slice((page - 1) * preferences.pageSize, page * preferences.pageSize)) {
    const tr = node('tr'); if (isExpired(row.deadlineText)) tr.className = 'expired-posting';
    for (const key of preferences.columns) {
      const td = node('td'); td.dataset.column = key;
      if (key === 'isNew' || key === 'shortlisted') { if (row[key]) { const badge = node('span', key === 'isNew' ? 'New' : 'Shortlisted'); badge.className = 'badge'; td.append(badge); } else td.textContent = '—'; }
      else if (key === 'jobTitle') {
        const link = node('a', positionTitle(row)); link.href = api.runtime.getURL(`posting.html?id=${encodeURIComponent(row.id)}`); link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', `Open ${positionTitle(row)} in a new tab`); td.append(link);
        if (isExpired(row.deadlineText)) { const badge = node('span', 'Expired'); badge.className = 'retained-label'; td.append(badge); }
        if (row.shortlisted && savedMode) { const badge = node('span', 'SCOPE shortlist'); badge.className = 'retained-label'; td.append(badge); }
        if (libraryMode && !snapshot?.postings.some(current => current.id === row.id)) { const label = node('span', 'Not in latest search'); label.className = 'retained-label'; label.title = 'Retained when saved. This does not establish whether the posting is still available.'; td.append(label); }
      } else if (key === 'deadlineText') {
        const relative = preferences.relativeDeadlines ? relativeDeadline(row.deadlineText) : undefined; td.textContent = relative ?? (row.deadlineText || '—');
        deadlineHover(td, row.deadlineText, Boolean(relative));
      } else td.textContent = display(row, key) || '—';
      tr.append(td);
    }
    const actions = node('td'); actions.className = 'actions-cell';
    const saveButton = node('button', isSaved(row) ? 'Remove from Saved' : '☆ Save'); saveButton.className = isSaved(row) ? 'save-posting is-saved' : 'save-posting secondary'; saveButton.dataset.save = row.id; saveButton.disabled = saving.has(row.id); saveButton.setAttribute('aria-pressed', String(isSaved(row))); saveButton.setAttribute('aria-label', `${isSaved(row) ? 'Remove from Saved:' : 'Save'} ${positionTitle(row)} locally`);
    saveButton.addEventListener('click', () => void toggleSaved(row)); actions.append(saveButton);
    const applyButton = node('button', applied.has(row.id) ? '✓ Applied · Undo' : 'Mark applied'); applyButton.className = 'secondary'; applyButton.dataset.applied = row.id; applyButton.disabled = markingApplied.has(row.id); applyButton.setAttribute('aria-pressed', String(applied.has(row.id))); applyButton.setAttribute('aria-label', `${applied.has(row.id) ? 'Undo applied for' : 'Mark as already applied:'} ${positionTitle(row)} locally`);
    applyButton.addEventListener('click', () => void toggleApplied(row)); actions.append(applyButton);
    const toggle = node('button', expanded.has(row.id) ? 'Hide details' : 'Details'); toggle.className = 'secondary'; toggle.dataset.details = row.id; toggle.setAttribute('aria-expanded', String(expanded.has(row.id))); if (expanded.has(row.id)) toggle.setAttribute('aria-controls', `details-${row.id}`);
    toggle.addEventListener('click', () => { if (expanded.has(row.id)) expanded.delete(row.id); else expanded.add(row.id); render(); document.querySelector<HTMLButtonElement>(`button[data-details="${row.id}"]`)?.focus(); });
    actions.append(toggle); tr.append(actions); fragment.append(tr); if (expanded.has(row.id)) fragment.append(details(row));
  }
  element('rows').replaceChildren(fragment); chips();
}
async function toggleSaved(row: Posting): Promise<void> {
  if (saving.has(row.id)) return;
  saving.add(row.id); const next = !isSaved(row); render();
  try {
    await request({ type: 'setSaved', id: row.id, saved: next });
    if (next) { saved.set(row.id, { version: 1, savedAt: new Date().toISOString(), posting: row }); removedSaved.delete(row.id); }
    else { saved.delete(row.id); removedSaved.add(row.id); }
    rebuildLibrary(); makeFacets();
    error();
  } catch (value) { error(value); }
  finally { saving.delete(row.id); render(); document.querySelector<HTMLButtonElement>(`button[data-save="${row.id}"]`)?.focus(); }
}
async function toggleApplied(row: Posting): Promise<void> {
  if (markingApplied.has(row.id)) return;
  markingApplied.add(row.id); const next = !applied.has(row.id); render();
  try {
    await request({ type: 'setApplied', id: row.id, applied: next });
    if (next) applied.set(row.id, { version: 1, appliedAt: new Date().toISOString(), posting: row }); else applied.delete(row.id);
    rebuildLibrary(); makeFacets(); error();
  } catch (value) { error(value); }
  finally { markingApplied.delete(row.id); render(); document.querySelector<HTMLButtonElement>(`button[data-applied="${row.id}"]`)?.focus(); }
}
function reset(): void {
  const { sort, direction, pageSize, columns, facetOrder, groupGreaterVancouver, relativeDeadlines } = preferences;
  preferences = { ...defaults(), sort, direction, pageSize, columns, facetOrder, groupGreaterVancouver, relativeDeadlines }; fillControls(); makeFacets(true); changed();
}
for (const [key, label] of Object.entries(columnLabels)) {
  const option = node('option', label); option.value = key; element('sort').append(option);
  const check = node('input'); check.type = 'checkbox'; check.value = key; check.disabled = key === 'jobTitle';
  const labelNode = node('label'); labelNode.className = 'check'; labelNode.append(check, node('span', label)); element('column-options').append(labelNode);
  check.addEventListener('change', () => { preferences.columns = check.checked ? [...preferences.columns, key as Column] : preferences.columns.filter(column => column !== key); changed(); });
}
for (const id of ['query', 'exclude', 'scope', 'isNew', 'shortlisted', 'from', 'to', 'min', 'max', 'sort', 'direction', 'pageSize', 'unknownDeadline', 'hideExpired', 'expiredLast', 'relativeDeadlines'] as const) {
  const control = element<HTMLInputElement | HTMLSelectElement>(id);
  control.addEventListener(id === 'query' || id === 'exclude' ? 'input' : 'change', () => {
    preferencesLoaded = true;
    if (id === 'unknownDeadline' || id === 'hideExpired' || id === 'expiredLast' || id === 'relativeDeadlines') preferences[id] = (control as HTMLInputElement).checked;
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
element('list-view').addEventListener('click', () => { mapView = false; render(); });
element('map-view').addEventListener('click', () => { mapView = true; render(); });
const menus = [...document.querySelectorAll<HTMLDetailsElement>('.export-menu, .search-options, .columns')];
document.addEventListener('click', event => { for (const menu of menus) if (!menu.contains(event.target as Node)) menu.open = false; });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  for (const menu of menus) if (menu.open) { menu.open = false; menu.querySelector('summary')?.focus(); }
});

async function load(initial = false): Promise<void> {
  const revision = ++loadRevision;
  try {
    const [stored, records] = await Promise.all([api.storage.local.get(!preferencesLoaded ? ['snapshot', preferenceStorageKey] : ['snapshot']), request<Record<string, unknown>>({ type: 'getLibrary' })]);
    if (revision !== loadRevision) return;
    if (!preferencesLoaded) { preferences = readPreferences(stored[preferenceStorageKey]); preferencesLoaded = true; fillControls(); }
    let collectionError: unknown;
    try { snapshot = stored.snapshot === undefined ? undefined : validateSnapshot(stored.snapshot); }
    catch (value) { if (!libraryMode) throw value; snapshot = undefined; collectionError = value; }
    saved = readSaved(records); removedSaved = readRemovedSaved(records); applied = readApplied(records); rebuildLibrary();
    index = indexPostings(libraryPostings); page = 1; expanded.clear();
    element('snapshot-info').textContent = savedMode ? `${saved.size} Saved postings · Local to Scoped, independent of SCOPE` : snapshot ? `${snapshot.postings.length.toLocaleString()} postings · Collected ${new Date(snapshot.collectedAt).toLocaleString()}` : 'Your saved SCOPE search, ready to explore.';
    element('update').hidden = initial || !snapshot;
    error(collectionError); makeFacets(); render();
  } catch (value) { if (revision === loadRevision) { snapshot = undefined; libraryPostings = []; index = []; render(); error(value); } }
}
fillControls();
if (window.matchMedia?.('(max-width: 900px)').matches) element<HTMLDetailsElement>('filter-panel').open = false;
// Register after starting the initial read. A newer event invalidates that read.
void load(true);
api.storage.onChanged.addListener((changes, area) => { if (area === 'local' && (Object.hasOwn(changes, 'snapshot') || Object.keys(changes).some(key => (key.startsWith(savedPrefix) || key.startsWith(appliedPrefix) || key.startsWith(removedSavedPrefix))))) void load(); });

let expirySignature = '';
function refreshExpiry(): void {
  if (document.hidden) return;
  const next = libraryPostings.filter(row => isExpired(row.deadlineText)).map(row => row.id).join(',') + (preferences.relativeDeadlines ? `:${Math.floor(Date.now() / 60_000)}` : '');
  if (next !== expirySignature) { expirySignature = next; render(); }
}
setInterval(refreshExpiry, 60_000);
document.addEventListener('visibilitychange', refreshExpiry);
