import { annotationPrefix, customPrefix, readAnnotations, readCustom, customPosting, isCustomId, type Annotation, type CustomApplied } from './local-library';
import { greaterVancouverKey, greaterVancouverCities, locationChoice, locationLabel, regroupSelections } from './location-groups';
import { api, request } from './api';
import type { Posting, Snapshot } from './types';
import { readRemovedSaved, removedSavedPrefix, readApplied, appliedPostings, appliedPrefix, type AppliedPosting, readSaved, savedPostings, savedPrefix, type SavedPosting } from './saved';
import type { LocationExplorer } from './globe';
import { columnLabels, defaults, fold, indexPostings, isExpired, positionTitle, relativeDeadline, relativeDeadlineTime, preferencesKey, readPreferences, selectPostings, validateSnapshot, type Column, type FacetOrder, type IndexedPosting, type Preferences } from './viewer-model';
import './viewer.css';
import type { SemanticSearch } from './semantic-client';
import { RelevanceWriter, installRowMarking } from './marking';

const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result; };
function icon(kind: 'star' | 'check' | 'more' | 'external'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); svg.classList.add('ui-icon');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  const paths = { star: 'm12 3 2.8 5.7 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z', check: 'm5 12 4 4L19 6', more: 'M4 12h.01M12 12h.01M20 12h.01', external: 'M14 4h6v6M20 4l-9 9M10 4H4v16h16v-6' };
  path.setAttribute('d', paths[kind]); svg.append(path); return svg;
}
let preferences = defaults(), snapshot: Snapshot | undefined, index: IndexedPosting[] = [], page = 1, matches: Posting[] = [];
let loadRevision = 0, timer: ReturnType<typeof setTimeout> | undefined, writeQueue: Promise<unknown> = Promise.resolve();
let preferencesLoaded = false;
let semantic: SemanticSearch | undefined, semanticKey = '', semanticRevision = 0, semanticScores: Map<string, number> | undefined;
let semanticState: 'idle' | 'loading' | 'ready' | 'error' = 'idle', semanticMessage = '';
let libraryRevision = 0;
function semanticFeedback(): void {
  const enabled = preferences.searchMode === 'semantic' && preferences.scope !== 'id';
  element('search-feedback').hidden = !enabled || !semanticMessage;
  element('search-status').textContent = semanticMessage;
  element('semantic-retry').hidden = semanticState !== 'error';
  element('query').setAttribute('aria-busy', String(semanticState === 'loading'));
  element('search-help').textContent = enabled
    ? 'Find related matches within the selected search field. Dates and locations in a sentence are not automatic filters: use Refine results. Exclusions remain literal. No data leaves your browser.'
    : 'Every word must match. Use quotes for an exact phrase. Exclusions remove any match. Searches use saved table text.';
  const option = element<HTMLSelectElement>('sort').querySelector<HTMLOptionElement>('[value="relevance"]');
  if (option) { option.hidden = !enabled; option.disabled = !enabled; }
}
function prepareSemantic(): void {
  const query = preferences.query.trim();
  if (preferences.searchMode !== 'semantic' || preferences.scope === 'id' || !query || !index.length) {
    if (semanticKey || semanticState !== 'idle') { semanticRevision++; semantic?.cancel(); semanticKey = ''; }
    semanticScores = undefined; semanticState = 'idle'; semanticMessage = ''; semanticFeedback(); return;
  }
  const key = JSON.stringify([libraryRevision, preferences.scope, query]);
  if (key === semanticKey) { semanticFeedback(); return; }
  semanticKey = key; const revision = ++semanticRevision;
  semanticScores = undefined; semanticState = 'loading'; semanticMessage = 'Preparing local semantic search… Keyword results are shown while it loads.'; semanticFeedback();
  const scope = preferences.scope, postings = libraryPostings;
  void import('./semantic-client').then(async ({ SemanticSearch }) => {
    if (revision !== semanticRevision) return;
    semantic ??= new SemanticSearch();
    const result = await semantic.search(postings, scope, query, message => {
      if (revision !== semanticRevision) return;
      semanticMessage = `${message}. Keyword results are shown while it loads.`; semanticFeedback();
    });
    if (revision !== semanticRevision) return;
    semanticScores = result.scores; semanticState = 'ready';
    semanticMessage = result.cacheAvailable ? '' : 'Persistent cache unavailable; this tab uses memory.';
    render();
  }).catch(() => {
    if (revision !== semanticRevision) return;
    semanticState = 'error'; semanticScores = undefined;
    semanticMessage = 'Semantic search is unavailable. Keyword results are shown. Reload the extension after rebuilding, or retry.'; render();
  });
}
const expanded = new Set<string>();
const savedMode = new URL(location.href).searchParams.get('view') === 'saved';
const appliedMode = new URL(location.href).searchParams.get('view') === 'applied';
const libraryMode = savedMode || appliedMode;
const preferenceStorageKey = savedMode ? 'viewerPreferences:saved:v1' : appliedMode ? 'viewerPreferences:applied:v1' : preferencesKey;
let removedSaved = new Set<string>();
let annotations = new Map<string, Annotation>(), custom = new Map<string, CustomApplied>();
let annotationRevision = 0;
const annotationChanges = new Map<string, number>();
let markingMode = false;
let markingBaseline = new Set<string>(), markingOrder = new Map<string, number>();
const visibleRows = new Map<string, HTMLTableRowElement>();
function patchMark(id: string): void {
  const row = visibleRows.get(id); if (!row) return;
  const marked = Boolean(annotations.get(id)?.notRelevant);
  row.classList.toggle('not-relevant-posting', marked);
  const checkbox = row.querySelector<HTMLInputElement>('[data-mark]'); if (checkbox) checkbox.checked = marked;
  const action = row.querySelector<HTMLButtonElement>('[data-relevance]'); if (action) action.textContent = marked ? 'Restore relevance' : 'Mark not relevant';
}
const relevanceWriter = new RelevanceWriter(id => Boolean(annotations.get(id)?.notRelevant), (id, value) => {
  annotations.set(id, { ...(annotations.get(id) ?? { version: 1, id, notes: '' }), notRelevant: value });
  annotationChanges.set(id, ++annotationRevision);
  if (markingMode) patchMark(id); else render();
}, changes => request({ type: 'setRelevance', changes }), value => error(`Could not save relevance marks: ${value instanceof Error ? value.message : String(value)}. Unsaved marks were restored.`));
installRowMarking(element('rows'), () => markingMode, id => Boolean(annotations.get(id)?.notRelevant), (id, value) => relevanceWriter.set(id, value));
window.addEventListener('pagehide', () => { void relevanceWriter.flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) void relevanceWriter.flush(); });
const notRelevantIds = () => new Set([...annotations.values()].filter(row => row.notRelevant).map(row => row.id));
let snapshotIds = new Set<string>(), scopeShortlisted = new Set<string>();
function isSaved(row: Posting): boolean { return !removedSaved.has(row.id) && (saved.has(row.id) || scopeShortlisted.has(row.id)); }
let applied = new Map<string, AppliedPosting>();
const markingApplied = new Set<string>();
function rebuildLibrary(): void {
  snapshotIds = new Set(snapshot?.postings.map(row => row.id));
  scopeShortlisted = new Set(snapshot?.postings.filter(row => row.shortlisted).map(row => row.id));
  libraryPostings = savedMode ? savedPostings(saved, snapshot, applied, removedSaved) : appliedMode ? [...appliedPostings(applied, snapshot), ...[...custom.values()].map(customPosting)] : snapshot?.postings ?? [];
  index = indexPostings(libraryPostings);
  libraryRevision++;
}
let saved = new Map<string, SavedPosting>(), libraryPostings: Posting[] = [];
let globe: LocationExplorer | undefined, globeLoading = false, mapView = false;
const saving = new Set<string>();
const openActions = new Set<string>();
function closeRowMenu(menu: HTMLDetailsElement): void {
  const body = menu.querySelector<HTMLElement>('.row-action-options')!;
  menu.open = false; openActions.delete(menu.dataset.id!);
  body.hidePopover?.();
}
function openRowMenu(menu: HTMLDetailsElement): void {
  for (const other of document.querySelectorAll<HTMLDetailsElement>('.row-actions[open]')) if (other !== menu) closeRowMenu(other);
  menu.open = true; openActions.add(menu.dataset.id!);
  const body = menu.querySelector<HTMLElement>('.row-action-options')!;
  if (!body.showPopover) return; // jsdom does not implement the browser top layer.
  body.showPopover();
  const anchor = menu.querySelector('summary')!.getBoundingClientRect(), popup = body.getBoundingClientRect();
  body.style.left = `${Math.max(8, Math.min(anchor.right - popup.width, innerWidth - popup.width - 8))}px`;
  const top = anchor.bottom + 6 + popup.height <= innerHeight - 8 ? anchor.bottom + 6 : anchor.top - popup.height - 6;
  body.style.top = `${Math.max(8, Math.min(top, innerHeight - popup.height - 8))}px`;
}
function dismissRowMenus(): void {
  for (const menu of document.querySelectorAll<HTMLDetailsElement>('.row-actions[open]')) {
    const focused = menu.querySelector('.row-action-options')!.contains(document.activeElement);
    closeRowMenu(menu);
    if (focused) menu.querySelector('summary')!.focus({ preventScroll: true });
  }
}
window.addEventListener('resize', dismissRowMenus);
document.addEventListener('scroll', event => { if (!(event.target instanceof Element) || !event.target.closest('.row-action-options')) dismissRowMenus(); }, true);
element('chips').after(element('saved-feedback'));
let lastRemoval: { id: string; token: string } | undefined;
let undoTimer: ReturnType<typeof setTimeout> | undefined;
function focusRow(id: string, action: 'save' | 'applied' | 'details', index = 0): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>(`#rows button[data-${action}]`)];
  const target = buttons.find(button => button.dataset[action] === id) ?? buttons[Math.min(index, buttons.length - 1)];
  if (target) { const menu = target.closest<HTMLDetailsElement>('.row-actions'); if (menu) openRowMenu(menu); target.focus(); }
  else element('count').focus();
}
function dismissSavedFeedback(): void {
  lastRemoval = undefined; if (undoTimer) clearTimeout(undoTimer);
  const focused = element('saved-feedback').contains(document.activeElement);
  element('saved-feedback').hidden = true;
  if (focused) element('count').focus();
}
const filterPanel = element<HTMLDetailsElement>('filter-panel');
const filterDialog = element<HTMLDialogElement>('filter-dialog');
const filterHome = document.createComment('Desktop filter sidebar'); filterPanel.before(filterHome);
const compactMedia = window.matchMedia?.('(max-width: 900px)');
function arrangeFilters(): void {
  const compact = compactMedia?.matches ?? false;
  if (filterDialog.open) filterDialog.close();
  element('filters-toggle').hidden = !compact;
  updateSidebar();
  const options = document.querySelector<HTMLDetailsElement>('.result-options')!; options.open = !compact;
  if (compact) filterDialog.append(filterPanel); else filterHome.after(filterPanel);
  filterPanel.open = true;
}
function updateSidebar(): void {
  const compact = compactMedia?.matches ?? false;
  const collapsed = !compact && preferences.sidebarCollapsed;
  filterPanel.hidden = collapsed;
  document.querySelector('.workspace')!.classList.toggle('sidebar-collapsed', collapsed);
  const toggle = element('sidebar-toggle');
  toggle.hidden = compact;
  toggle.textContent = collapsed ? 'Show filters' : 'Hide filters';
  toggle.setAttribute('aria-expanded', String(!collapsed));
}
function toggleSidebar(): void {
  preferencesLoaded = true; preferences.sidebarCollapsed = !preferences.sidebarCollapsed;
  updateSidebar(); save(); element('sidebar-toggle').focus({ preventScroll: true });
}
element('sidebar-toggle').addEventListener('click', toggleSidebar);
filterPanel.querySelector('summary')!.addEventListener('click', event => {
  if (!compactMedia?.matches) { event.preventDefault(); toggleSidebar(); }
});
arrangeFilters(); compactMedia?.addEventListener('change', arrangeFilters);
element('filters-toggle').addEventListener('click', () => { filterDialog.showModal(); element('filters-close').focus(); });
element('filters-close').addEventListener('click', () => filterDialog.close());
filterDialog.addEventListener('close', () => { if (compactMedia?.matches) element('filters-toggle').focus(); });
filterDialog.addEventListener('click', event => { if (event.target === filterDialog) { const rect = filterDialog.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) filterDialog.close(); } });
element<HTMLAnchorElement>('saved-tab').href = api.runtime.getURL('viewer.html?view=saved');
element<HTMLAnchorElement>('all-tab').href = api.runtime.getURL('viewer.html');
element<HTMLAnchorElement>('applied-tab').href = api.runtime.getURL('viewer.html?view=applied');
element(appliedMode ? 'applied-tab' : savedMode ? 'saved-tab' : 'all-tab').setAttribute('aria-current', 'page');
if (libraryMode) {
  document.title = appliedMode ? 'Scoped: Applied postings' : 'Scoped: Saved postings';
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
type PreviousSearch = { preferences: Preferences; page: number; mapView: boolean; scroll: number; company: string; facetSearches: string[] };
const previousSearches: PreviousSearch[] = [];
function companySearch(company: string): void {
  if (timer) clearTimeout(timer);
  previousSearches.push({ preferences: structuredClone(preferences), page, mapView, scroll: document.querySelector('.table-scroll')!.scrollTop, company, facetSearches: [...document.querySelectorAll<HTMLInputElement>('.facet-search')].map(input => input.value) });
  const { sort, direction, pageSize, columns, facetOrder, groupGreaterVancouver, relativeDeadlines, searchMode, notRelevantLast, sidebarCollapsed } = preferences;
  preferences = { ...defaults(), sort, direction, pageSize, columns, facetOrder, groupGreaterVancouver, relativeDeadlines, searchMode, notRelevantLast, sidebarCollapsed, organizations: [company] };
  preferencesLoaded = true; mapView = false;
  fillControls(); makeFacets(true); changed();
  document.querySelector('.table-scroll')!.scrollTop = 0;
  element('search-back').focus();
}
element('search-back').addEventListener('click', () => {
  const previous = previousSearches.pop(); if (!previous) return;
  if (timer) clearTimeout(timer);
  preferences = previous.preferences; page = previous.page; mapView = previous.mapView; preferencesLoaded = true;
  fillControls(); makeFacets(true);
  document.querySelectorAll<HTMLInputElement>('.facet-search').forEach((input, i) => { input.value = previous.facetSearches[i] ?? ''; input.dispatchEvent(new Event('input')); });
  save(); render(); document.querySelector('.table-scroll')!.scrollTop = previous.scroll;
  const company = [...document.querySelectorAll<HTMLButtonElement>('.company-search')].find(button => button.dataset.company === previous.company);
  (company ?? element('query')).focus({ preventScroll: true });
});
function fillControls(): void {
  updateSidebar();
  for (const id of ['query', 'exclude', 'scope', 'searchMode', 'isNew', 'shortlisted', 'from', 'to', 'min', 'max', 'sort', 'direction', 'pageSize'] as const) element<HTMLInputElement | HTMLSelectElement>(id).value = String(preferences[id]);
  for (const id of ['unknownDeadline', 'hideExpired', 'expiredLast', 'relativeDeadlines', 'hideNotRelevant', 'notRelevantLast'] as const) element<HTMLInputElement>(id).checked = preferences[id];
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
      const info = node('details'); info.className = 'filter-help'; info.append(node('summary', 'Included cities'), help); group.append(label, info);
    }
    group.append(search, orderLabel, options); element(parent).append(group); draw();
  }
}
function chips(): void {
  const target = element('chips'); target.replaceChildren();
  const add = (text: string, remove: () => void) => { const button = node('button', `${text} ×`); button.setAttribute('aria-label', `Remove filter: ${text}`); button.addEventListener('click', () => { const index = [...target.children].indexOf(button); remove(); fillControls(); makeFacets(); changed(); (target.querySelectorAll<HTMLButtonElement>('button')[Math.min(index, target.children.length - 1)] ?? element('query')).focus(); }); target.append(button); };
  for (const [key, , title] of facetDefs) for (const value of preferences[key]) add(`${title}: ${(key === 'locations' ? locationLabel(value) : value) || 'No status (blank)'}`, () => { preferences[key] = preferences[key].filter(entry => entry !== value); });
  if (preferences.query) add(`Search: ${preferences.query}`, () => { preferences.query = ''; });
  if (preferences.exclude) add(`Exclude: ${preferences.exclude}`, () => { preferences.exclude = ''; });
  for (const key of ['isNew', 'shortlisted'] as const) if (preferences[key] !== 'all') add(`${key === 'isNew' ? 'New on SCOPE' : 'Shortlisted'}: ${preferences[key]}`, () => { preferences[key] = 'all'; });
  for (const [key, label] of [['from', 'Deadline from'], ['to', 'Deadline through'], ['min', 'Minimum applications'], ['max', 'Maximum applications']] as const) if (preferences[key]) add(`${label}: ${preferences[key]}`, () => { preferences[key] = ''; });
  if (preferences.hideNotRelevant) add('Hide not relevant', () => { preferences.hideNotRelevant = false; });
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
  const td = node('td'); td.colSpan = preferences.columns.length + Number(markingMode);
  const list = node('dl');
  for (const [key, label] of Object.entries(columnLabels)) { const field = node('div'); const value = node('dd', display(row, key as Column) || '-'); if (key === 'deadlineText') deadlineHover(value, row.deadlineText); field.append(node('dt', label), value); list.append(field); }
  const copy = node('button', 'Copy posting ID'); copy.addEventListener('click', () => { void navigator.clipboard.writeText(row.id).then(() => { copy.textContent = 'ID copied'; }, error); });
  const note = node('p', isCustomId(row.id) ? custom.get(row.id)?.notes ?? '' : annotations.get(row.id)?.notes ?? ''); note.className = 'posting-note'; td.append(list, note); if (!isCustomId(row.id)) td.append(copy); tr.append(td); return tr;
}
function render(): void {
  const active = document.activeElement as HTMLElement | null;
  const rowFocus = (['save', 'applied', 'details'] as const).find(key => active?.dataset[key]);
  const focusedId = rowFocus ? active?.dataset[rowFocus] : undefined;
  const focusedIndex = active?.closest('tr') ? [...element('rows').children].filter(row => !row.classList.contains('expanded')).indexOf(active.closest('tr')!) : 0;
  const focusedSort = active?.dataset.sort;
  const focusedMenu = active?.dataset.rowActions;
  element('search-back').hidden = !previousSearches.length;
  prepareSemantic();
  matches = selectPostings(index, preferences, new Date(), semanticScores, markingMode ? markingBaseline : notRelevantIds());
  if (markingMode) matches.sort((a, b) => (markingOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (markingOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  element('reset').hidden = !(preferences.query || preferences.exclude || preferences.scope !== 'all' || preferences.organizations.length || preferences.locations.length || preferences.statuses.length || preferences.terms.length || preferences.isNew !== 'all' || preferences.shortlisted !== 'all' || preferences.from || preferences.to || preferences.min || preferences.max || preferences.hideExpired || preferences.hideNotRelevant || preferences.unknownDeadline);
  const searchOptions = Number(preferences.scope !== 'all') + Number(Boolean(preferences.exclude));
  document.querySelector('.search-options summary')!.textContent = searchOptions ? `Search options · ${searchOptions}` : 'Search options';
  const pages = Math.max(1, Math.ceil(matches.length / preferences.pageSize)); page = Math.min(page, pages);
  element('count').textContent = `${matches.length.toLocaleString()} matching / ${libraryPostings.length.toLocaleString()} postings`;
  element('saved-count').textContent = String(savedPostings(saved, snapshot, applied, removedSaved).length);
  element('applied-count').textContent = String(applied.size + custom.size);
  element('filters-toggle').textContent = `Filters${preferences.organizations.length + preferences.locations.length + preferences.statuses.length + preferences.terms.length ? ' · ' + (preferences.organizations.length + preferences.locations.length + preferences.statuses.length + preferences.terms.length) : ''}`;
  if (libraryMode) element('snapshot-info').textContent = appliedMode ? `${libraryPostings.length} Applied postings · Marked locally in Scoped` : `${libraryPostings.length} Saved postings · Local saves + SCOPE shortlist · Applied positions are separate`;
  element('snapshot-info').title = element('snapshot-info').textContent ?? '';
  element('visible-range').textContent = mapView ? `${matches.length.toLocaleString()} filtered postings · Select a city to see its positions` : matches.length ? `Showing ${((page - 1) * preferences.pageSize + 1).toLocaleString()}–${Math.min(page * preferences.pageSize, matches.length).toLocaleString()} · Click a position to open in SCOPE` : 'Search and filter your saved collection';
  element('sort').closest('label')!.hidden = mapView; element('direction').closest('label')!.hidden = mapView; document.querySelector<HTMLElement>('.columns')!.hidden = mapView;
  const empty = element('empty'); empty.hidden = Boolean(snapshot && matches.length);
  empty.textContent = appliedMode && !libraryPostings.length ? 'No Applied positions yet. Use Mark applied after submitting an application, or Add Applied entry for applications from any source.' : savedMode && !libraryPostings.length ? 'No Saved postings yet. Use Save on any position in All postings. Saves stay local to Scoped.' : snapshot || libraryMode ? 'No postings match these filters. Try Clear filters.' : 'No snapshot saved yet. Open SCOPE search results, click Scoped, and start a collection.';
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
  element('postings').classList.toggle('marking-mode', markingMode);
  if (markingMode) { const th = node('th'); th.className = 'mark-column'; th.scope = 'col'; th.setAttribute('aria-label', 'Not relevant'); head.append(th); }
  for (const key of preferences.columns) {
    const th = node('th'); th.scope = 'col'; th.dataset.column = key;
    if (preferences.sort === key) th.setAttribute('aria-sort', preferences.direction === 'asc' ? 'ascending' : 'descending');
    const button = node('button', columnLabels[key] + (preferences.sort === key ? preferences.direction === 'asc' ? ' ↑' : ' ↓' : ''));
    button.dataset.sort = key;
    button.addEventListener('click', () => { preferences.direction = preferences.sort === key && preferences.direction === 'asc' ? 'desc' : 'asc'; preferences.sort = key; fillControls(); changed(); });
    th.append(button); head.append(th);
  }
  element('headers').replaceChildren(head);
  const fragment = document.createDocumentFragment();
  visibleRows.clear();
  for (const row of matches.slice((page - 1) * preferences.pageSize, page * preferences.pageSize)) {
    const tr = node('tr'); tr.dataset.postingId = row.id; visibleRows.set(row.id, tr); if (isExpired(row.deadlineText)) tr.className = 'expired-posting';
    if (annotations.get(row.id)?.notRelevant) tr.classList.add('not-relevant-posting');
    for (const key of preferences.columns) {
      const td = node('td'); td.dataset.column = key;
      td.dataset.label = columnLabels[key];
      if (key === 'isNew' || key === 'shortlisted') { if (row[key]) { const badge = node('span', key === 'isNew' ? 'New' : 'Shortlisted'); badge.className = 'badge'; td.append(badge); } else td.textContent = '-'; }
      else if (key === 'jobTitle') {
        if (isCustomId(row.id)) td.append(node('span', positionTitle(row)));
        else {
          const link = node('a', positionTitle(row)); link.href = api.runtime.getURL(`posting.html?id=${encodeURIComponent(row.id)}`); link.target = '_blank'; link.rel = 'noopener'; link.setAttribute('aria-label', `Open ${positionTitle(row)} in a new tab`); link.prepend(icon('external')); td.append(link);
        }
        if (isCustomId(row.id)) { const badge = node('span', `Custom · Applied ${custom.get(row.id)?.appliedOn}`); badge.className = 'retained-label'; td.append(badge); }
        if (markingMode ? markingBaseline.has(row.id) : annotations.get(row.id)?.notRelevant) { const badge = node('span', 'Not relevant'); badge.className = 'retained-label'; td.append(badge); }
        if (annotations.get(row.id)?.notes || custom.get(row.id)?.notes) { const badge = node('span', 'Notes'); badge.className = 'retained-label'; td.append(badge); }
        const flags = node('span'); flags.className = 'posting-flags';
        for (const [flag, label] of [['isNew', 'New'], ['shortlisted', 'SCOPE shortlist']] as const) {
          if (row[flag] && !preferences.columns.includes(flag)) { const badge = node('span', label); badge.className = 'badge'; flags.append(badge); }
        }
        if (flags.childElementCount) td.append(flags);
        const score = semanticScores?.get(row.id);
        if (score !== undefined) {
          tr.classList.add('relevance-row');
          tr.style.setProperty('--relevance-width', `${Math.max(0, Math.min(1, score)) * 100}%`);
          tr.title = `Relevance ${score.toFixed(3)} to “${preferences.query.trim()}”. Higher scores mean a closer match; this is not a confidence percentage.`;
          const label = node('span', `Relevance ${score.toFixed(3)}`); label.className = 'sr-only relevance-score';
          label.setAttribute('aria-label', `Relevance to your query: ${score.toFixed(3)}`); td.append(label);
        }
        if (isExpired(row.deadlineText)) { const badge = node('span', 'Expired'); badge.className = 'retained-label'; td.append(badge); }
        if (row.shortlisted && savedMode && preferences.columns.includes('shortlisted')) { const badge = node('span', 'SCOPE shortlist'); badge.className = 'retained-label'; td.append(badge); }
        if (libraryMode && !isCustomId(row.id) && !snapshotIds.has(row.id)) { const label = node('span', 'Not in latest search'); label.className = 'retained-label'; label.title = 'Retained when saved. This does not establish whether the posting is still available.'; td.append(label); }
      } else if (key === 'organization' && row.organization) {
        const company = node('button', row.organization); company.className = 'company-search'; company.dataset.company = row.organization;
        company.title = `See all positions from ${row.organization}`; company.setAttribute('aria-label', `See all positions from ${row.organization}`);
        company.addEventListener('click', () => companySearch(row.organization)); td.append(company);
      } else if (key === 'deadlineText') {
        const relative = preferences.relativeDeadlines ? relativeDeadline(row.deadlineText) : undefined; td.textContent = relative ?? (row.deadlineText || '-');
        deadlineHover(td, row.deadlineText, Boolean(relative));
      } else td.textContent = display(row, key) || '-';
      tr.append(td);
    }
    const saveButton = node('button', isSaved(row) ? savedMode ? 'Remove' : 'Saved' : 'Save'); saveButton.className = isSaved(row) ? 'save-posting is-saved' : 'save-posting secondary'; saveButton.dataset.save = row.id; saveButton.disabled = saving.has(row.id); saveButton.title = isSaved(row) ? 'Remove from Saved' : 'Save locally'; saveButton.setAttribute('aria-pressed', String(isSaved(row))); saveButton.setAttribute('aria-label', `${isSaved(row) ? 'Remove from Saved:' : 'Save'} ${positionTitle(row)} locally`);
    saveButton.prepend(icon(isSaved(row) ? 'check' : 'star'));
    saveButton.addEventListener('click', () => void toggleSaved(row));
    const titleCell = tr.querySelector<HTMLTableCellElement>('[data-column="jobTitle"]')!;
    const titleText = node('div'); titleText.className = 'posting-title'; titleText.append(...titleCell.childNodes);
    const layout = node('div'); layout.className = 'posting-layout';
    const saveTools = node('div'); saveTools.className = 'posting-tools'; if (!isCustomId(row.id)) saveTools.append(saveButton); layout.append(titleText, saveTools); titleCell.append(layout);
    const menu = node('details'); menu.className = 'row-actions'; menu.dataset.id = row.id; menu.open = openActions.has(row.id);
    const summary = node('summary', '⋯'); summary.dataset.rowActions = row.id; summary.title = 'Posting actions'; summary.setAttribute('aria-label', `Actions for ${positionTitle(row)}`); summary.setAttribute('aria-controls', `actions-${row.id}`);
    const menuBody = node('div'); menuBody.className = 'row-action-options'; menuBody.id = `actions-${row.id}`; menuBody.setAttribute('popover', 'manual'); menuBody.setAttribute('aria-label', `Actions for ${positionTitle(row)}`); menu.append(summary, menuBody); saveTools.append(menu);
    summary.addEventListener('click', event => { event.preventDefault(); if (menu.open) closeRowMenu(menu); else openRowMenu(menu); });
    menu.addEventListener('toggle', () => { if (menu.isConnected) { if (menu.open) openRowMenu(menu); else closeRowMenu(menu); } });
    const applyButton = node('button', applied.has(row.id) ? '✓ Applied · Undo' : 'Mark applied'); applyButton.className = 'secondary'; applyButton.dataset.applied = row.id; applyButton.disabled = markingApplied.has(row.id); applyButton.setAttribute('aria-pressed', String(applied.has(row.id))); applyButton.setAttribute('aria-label', `${applied.has(row.id) ? 'Undo applied for' : 'Mark as already applied:'} ${positionTitle(row)} locally`);
    applyButton.addEventListener('click', () => void toggleApplied(row)); if (!isCustomId(row.id)) menuBody.append(applyButton);
    const notesButton = node('button', isCustomId(row.id) ? 'Edit entry & notes' : 'Notes / save with notes'); notesButton.className = 'secondary'; notesButton.dataset.notes = row.id;
    notesButton.addEventListener('click', () => { dismissRowMenus(); if (isCustomId(row.id)) openCustom(custom.get(row.id)); else openNotes(row); }); menuBody.append(notesButton);
    const relevantButton = node('button', annotations.get(row.id)?.notRelevant ? 'Restore relevance' : 'Mark not relevant'); relevantButton.className = 'secondary'; relevantButton.dataset.relevance = row.id; relevantButton.addEventListener('click', () => toggleRelevance(row)); menuBody.append(relevantButton);
    if (markingMode) { const cell = node('td'); cell.className = 'mark-column'; const label = node('label'); label.className = 'mark-check'; const check = node('input'); check.type = 'checkbox'; check.checked = Boolean(annotations.get(row.id)?.notRelevant); check.dataset.mark = row.id; check.setAttribute('aria-label', `Not relevant: ${positionTitle(row)}`); check.addEventListener('change', () => relevanceWriter.set(row.id, check.checked)); label.append(check); cell.append(label); tr.prepend(cell); }
    if (isCustomId(row.id)) { const remove = node('button', 'Delete custom entry'); remove.className = 'secondary'; remove.addEventListener('click', async () => { remove.disabled = true; try { await request({ type: 'deleteCustomApplied', id: row.id }); custom.delete(row.id); annotations.delete(row.id); rebuildLibrary(); makeFacets(); render(); element('count').focus(); } catch (value) { error(value); remove.disabled = false; } }); menuBody.append(remove); }
    const toggle = node('button', expanded.has(row.id) ? 'Hide details' : 'Details'); toggle.className = 'secondary'; toggle.dataset.details = row.id; toggle.setAttribute('aria-expanded', String(expanded.has(row.id))); if (expanded.has(row.id)) toggle.setAttribute('aria-controls', `details-${row.id}`);
    toggle.addEventListener('click', () => { if (expanded.has(row.id)) expanded.delete(row.id); else expanded.add(row.id); render(); document.querySelector<HTMLButtonElement>(`button[data-details="${row.id}"]`)?.focus(); });
    menuBody.append(toggle); fragment.append(tr); if (expanded.has(row.id)) fragment.append(details(row));
  }
  element('rows').replaceChildren(fragment); chips();
  for (const menu of document.querySelectorAll<HTMLDetailsElement>('.row-actions[open]')) openRowMenu(menu);
  if (focusedSort) document.querySelector<HTMLButtonElement>(`[data-sort="${focusedSort}"]`)?.focus();
  else if (focusedId && rowFocus) focusRow(focusedId, rowFocus, focusedIndex);
  else if (focusedMenu) document.querySelector<HTMLElement>(`[data-row-actions="${focusedMenu}"]`)?.focus();
}
async function toggleSaved(row: Posting): Promise<void> {
  if (saving.has(row.id)) return;
  const restoreFocus = document.activeElement?.closest('tr')?.querySelector(`[data-save="${row.id}"]`);
  const rowIndex = [...element('rows').children].filter(row => !row.classList.contains('expanded')).indexOf(document.querySelector(`[data-save="${row.id}"]`)!.closest('tr')!);
  saving.add(row.id); const next = !isSaved(row); render();
  try {
    const result = await request<{ undoToken?: string } | undefined>({ type: 'setSaved', id: row.id, saved: next });
    if (next) { saved.set(row.id, { version: 1, savedAt: new Date().toISOString(), posting: row }); removedSaved.delete(row.id); if (lastRemoval?.id === row.id) dismissSavedFeedback(); }
    else {
      saved.delete(row.id); removedSaved.add(row.id);
      if (result?.undoToken) {
        dismissSavedFeedback(); lastRemoval = { id: row.id, token: result.undoToken };
        element('saved-feedback').hidden = false; element('saved-message').textContent = `Removed ${positionTitle(row)} from Saved.`;
        element<HTMLButtonElement>('undo-saved').disabled = false;
        undoTimer = setTimeout(dismissSavedFeedback, 5 * 60_000);
      }
    }
    rebuildLibrary(); makeFacets();
    error();
  } catch (value) { error(value); }
  finally { saving.delete(row.id); render(); if (restoreFocus && document.activeElement === document.body) focusRow(row.id, 'save', rowIndex); }
}
async function toggleApplied(row: Posting): Promise<void> {
  if (markingApplied.has(row.id)) return;
  const restoreFocus = document.activeElement?.closest('tr')?.querySelector(`[data-applied="${row.id}"]`);
  const rowIndex = [...element('rows').children].filter(row => !row.classList.contains('expanded')).indexOf(document.querySelector(`[data-applied="${row.id}"]`)!.closest('tr')!);
  markingApplied.add(row.id); const next = !applied.has(row.id); render();
  try {
    await request({ type: 'setApplied', id: row.id, applied: next });
    if (next) applied.set(row.id, { version: 1, appliedAt: new Date().toISOString(), posting: row }); else applied.delete(row.id);
    rebuildLibrary(); makeFacets(); error();
  } catch (value) { error(value); }
  finally { markingApplied.delete(row.id); render(); if (restoreFocus && document.activeElement === document.body) focusRow(row.id, 'applied', rowIndex); }
}
function toggleRelevance(row: Posting): void { relevanceWriter.set(row.id, !annotations.get(row.id)?.notRelevant); }
element('mark-mode').addEventListener('click', () => {
  void relevanceWriter.flush();
  if (!markingMode) { markingBaseline = notRelevantIds(); markingOrder = new Map(matches.map((row, index) => [row.id, index])); }
  markingMode = !markingMode; if (markingMode) mapView = false; element('mark-mode').setAttribute('aria-pressed', String(markingMode));
  element('mark-mode').textContent = markingMode ? 'Done marking' : 'Mark not relevant'; render();
});
const notesDialog = element<HTMLDialogElement>('notes-dialog'), customDialog = element<HTMLDialogElement>('custom-dialog');
let notesRow: Posting | undefined, customId: string | undefined, editorReturn: HTMLElement | null;
function showEditor(dialog: HTMLDialogElement): void { if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', ''); }
function closeEditor(dialog: HTMLDialogElement): void { if (dialog.close) dialog.close(); else dialog.removeAttribute('open'); editorReturn?.isConnected ? editorReturn.focus() : element('count').focus(); }
function openNotes(row: Posting): void {
  notesRow = row; editorReturn = document.activeElement as HTMLElement;
  element('notes-position').textContent = `${positionTitle(row)} · ${row.organization}`;
  element<HTMLTextAreaElement>('posting-notes').value = annotations.get(row.id)?.notes ?? '';
  element('notes-error').hidden = true; element('notes-status').textContent = '';
  element('notes-save-posting').hidden = isSaved(row); showEditor(notesDialog); element('posting-notes').focus();
}
async function saveNotes(savePosting = false): Promise<void> {
  const row = notesRow; if (!row || element<HTMLButtonElement>('notes-submit').disabled) return;
  const notes = element<HTMLTextAreaElement>('posting-notes').value;
  element<HTMLButtonElement>('notes-submit').disabled = true; element<HTMLButtonElement>('notes-save-posting').disabled = true; element<HTMLButtonElement>('notes-close').disabled = true;
  element('notes-status').textContent = 'Saving…'; element('notes-error').hidden = true;
  try {
    if (savePosting) await request({ type: 'setSaved', id: row.id, saved: true, notes });
    else await request({ type: 'setAnnotation', id: row.id, notes });
    await load(); closeEditor(notesDialog);
  } catch (value) { element('notes-error').hidden = false; element('notes-error').textContent = value instanceof Error ? value.message : String(value); }
  finally { element<HTMLButtonElement>('notes-submit').disabled = false; element<HTMLButtonElement>('notes-save-posting').disabled = false; element<HTMLButtonElement>('notes-close').disabled = false; element('notes-status').textContent = ''; }
}
element('notes-form').addEventListener('submit', event => { event.preventDefault(); void saveNotes(); });
element('notes-save-posting').addEventListener('click', () => void saveNotes(true));
element('notes-close').addEventListener('click', () => closeEditor(notesDialog));
notesDialog.addEventListener('cancel', event => { event.preventDefault(); if (!element<HTMLButtonElement>('notes-submit').disabled) closeEditor(notesDialog); });
function openCustom(record?: CustomApplied): void {
  customId = record?.id; editorReturn = document.activeElement as HTMLElement;
  element('custom-heading').textContent = record ? 'Edit Applied entry' : 'Add Applied entry';
  element<HTMLInputElement>('custom-title').value = record?.jobTitle ?? '';
  element<HTMLInputElement>('custom-organization').value = record?.organization ?? '';
  element<HTMLInputElement>('custom-location').value = record?.location ?? '';
  const today = new Date(); today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
  element<HTMLInputElement>('custom-date').value = record?.appliedOn ?? today.toISOString().slice(0, 10);
  element<HTMLTextAreaElement>('custom-notes').value = record?.notes ?? ''; element('custom-error').hidden = true;
  showEditor(customDialog); element('custom-title').focus();
}
element('add-custom').hidden = !appliedMode;
element('add-custom').addEventListener('click', () => openCustom());
element('custom-close').addEventListener('click', () => closeEditor(customDialog));
customDialog.addEventListener('cancel', event => { event.preventDefault(); if (!element<HTMLButtonElement>('custom-submit').disabled) closeEditor(customDialog); });
element('custom-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = element<HTMLButtonElement>('custom-submit'); if (submit.disabled) return;
  customId ??= `custom:${crypto.randomUUID()}`;
  const record: CustomApplied = { version: 1, id: customId, jobTitle: element<HTMLInputElement>('custom-title').value.trim(), organization: element<HTMLInputElement>('custom-organization').value.trim(), location: element<HTMLInputElement>('custom-location').value.trim(), appliedOn: element<HTMLInputElement>('custom-date').value, notes: element<HTMLTextAreaElement>('custom-notes').value };
  submit.disabled = true; submit.textContent = 'Saving…'; element<HTMLButtonElement>('custom-close').disabled = true; element('custom-error').hidden = true;
  try { await request({ type: 'setCustomApplied', record }); await load(); closeEditor(customDialog); }
  catch (value) { element('custom-error').hidden = false; element('custom-error').textContent = value instanceof Error ? value.message : String(value); }
  finally { submit.disabled = false; submit.textContent = 'Save Applied entry'; element<HTMLButtonElement>('custom-close').disabled = false; }
});
element('dismiss-saved').addEventListener('click', dismissSavedFeedback);
element('undo-saved').addEventListener('click', async () => {
  const removal = lastRemoval; if (!removal) return;
  const undo = element<HTMLButtonElement>('undo-saved'); undo.disabled = true;
  try {
    const record = await request<SavedPosting>({ type: 'undoSavedRemoval', ...removal });
    saved.set(removal.id, record); removedSaved.delete(removal.id); rebuildLibrary(); makeFacets(); render();
    if (lastRemoval === removal) { dismissSavedFeedback(); focusRow(removal.id, 'save'); } error();
  } catch (value) { error(value); if (lastRemoval === removal) { undo.disabled = false; undo.focus(); } }
});
function reset(): void {
  const { sort, direction, pageSize, columns, facetOrder, groupGreaterVancouver, relativeDeadlines, searchMode, notRelevantLast, sidebarCollapsed } = preferences;
  preferences = { ...defaults(), sort, direction, pageSize, columns, facetOrder, groupGreaterVancouver, relativeDeadlines, searchMode, notRelevantLast, sidebarCollapsed }; fillControls(); makeFacets(true); changed();
}
const relevanceOption = node('option', 'Relevance'); relevanceOption.value = 'relevance'; element('sort').append(relevanceOption);
element('semantic-retry').addEventListener('click', () => { semanticKey = ''; changed(); });
for (const [key, label] of Object.entries(columnLabels)) {
  const option = node('option', label); option.value = key; element('sort').append(option);
  const check = node('input'); check.type = 'checkbox'; check.value = key; check.disabled = key === 'jobTitle';
  const labelNode = node('label'); labelNode.className = 'check'; labelNode.append(check, node('span', label)); element('column-options').append(labelNode);
  check.addEventListener('change', () => { preferences.columns = check.checked ? [...preferences.columns, key as Column] : preferences.columns.filter(column => column !== key); changed(); });
}
for (const id of ['query', 'exclude', 'scope', 'searchMode', 'isNew', 'shortlisted', 'from', 'to', 'min', 'max', 'sort', 'direction', 'pageSize', 'unknownDeadline', 'hideExpired', 'expiredLast', 'relativeDeadlines', 'hideNotRelevant', 'notRelevantLast'] as const) {
  const control = element<HTMLInputElement | HTMLSelectElement>(id);
  control.addEventListener(id === 'query' || id === 'exclude' ? 'input' : 'change', () => {
    preferencesLoaded = true;
    if (id === 'unknownDeadline' || id === 'hideExpired' || id === 'expiredLast' || id === 'relativeDeadlines' || id === 'hideNotRelevant' || id === 'notRelevantLast') preferences[id] = (control as HTMLInputElement).checked;
    else if (id === 'pageSize') preferences.pageSize = Number(control.value) as Preferences['pageSize'];
    else if (id === 'min' || id === 'max') {
      if (control.value && (!Number.isSafeInteger(Number(control.value)) || Number(control.value) < 0)) { error('Application counts must be whole numbers of zero or more.'); return; }
      preferences[id] = control.value;
    } else Object.assign(preferences, { [id]: control.value });
    if (id === 'searchMode') {
      if (preferences.searchMode === 'semantic') { preferences.sort = 'relevance'; preferences.direction = 'asc'; }
      else if (preferences.sort === 'relevance') preferences.sort = 'deadlineText';
      fillControls();
    }
    error();
    if (timer) clearTimeout(timer);
    if (id === 'query' || id === 'exclude') {
      if (id === 'query') {
        semanticRevision++; semanticKey = ''; semanticScores = undefined;
        document.querySelectorAll('.relevance-score').forEach(label => label.remove());
        document.querySelectorAll<HTMLElement>('.relevance-row').forEach(row => {
          row.classList.remove('relevance-row'); row.style.removeProperty('--relevance-width'); row.removeAttribute('title');
        });
      }
      timer = setTimeout(changed, preferences.searchMode === 'semantic' ? 300 : 60);
    } else changed();
  });
}
element('previous').addEventListener('click', () => { page--; render(); }); element('next').addEventListener('click', () => { page++; render(); }); element('reset').addEventListener('click', reset);
for (const format of ['csv', 'json'] as const) element(format).addEventListener('click', () => { void request({ type: 'download', format }).catch(error); });
element('list-view').addEventListener('click', () => { mapView = false; render(); });
element('map-view').addEventListener('click', () => { mapView = true; render(); });
const menus = () => [...document.querySelectorAll<HTMLDetailsElement>('.export-menu[open], .search-options[open], .columns[open], .row-actions[open]'), ...(compactMedia?.matches && document.querySelector<HTMLDetailsElement>('.result-options')?.open ? [document.querySelector<HTMLDetailsElement>('.result-options')!] : [])];
document.addEventListener('click', event => { const target = event.target as Node; if (!target.isConnected) return; for (const menu of menus()) if (!menu.contains(target)) { if (menu.classList.contains('row-actions')) closeRowMenu(menu); else menu.open = false; } });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (filterDialog.open) return;
  const active = document.activeElement;
  const opened = menus().filter(menu => menu.open).sort((a, b) => a.contains(b) ? 1 : b.contains(a) ? -1 : 0);
  const focused = opened.find(menu => menu.contains(active)) ?? opened[0];
  if (focused) {
    event.preventDefault();
    for (const menu of opened) if (menu === focused || !menu.contains(focused)) { if (menu.classList.contains('row-actions')) closeRowMenu(menu); else menu.open = false; }
    focused.querySelector('summary')?.focus();
  }
});

async function load(initial = false): Promise<void> {
  const revision = ++loadRevision;
  const metadataRevision = annotationRevision;
  try {
    const [stored, records] = await Promise.all([api.storage.local.get(!preferencesLoaded ? ['snapshot', preferenceStorageKey] : ['snapshot']), request<Record<string, unknown>>({ type: 'getLibrary' })]);
    if (revision !== loadRevision) return;
    if (!preferencesLoaded) { preferences = readPreferences(stored[preferenceStorageKey]); preferencesLoaded = true; fillControls(); }
    let collectionError: unknown;
    try { snapshot = stored.snapshot === undefined ? undefined : validateSnapshot(stored.snapshot); }
    catch (value) { if (!libraryMode) throw value; snapshot = undefined; collectionError = value; }
    const nextAnnotations = readAnnotations(records);
    for (const [id, revision] of annotationChanges) if (revision > metadataRevision) {
      const record = annotations.get(id); if (record) nextAnnotations.set(id, record); else nextAnnotations.delete(id);
    }
    for (const [id, notRelevant] of relevanceWriter.overrides) nextAnnotations.set(id, { ...(nextAnnotations.get(id) ?? { version: 1, id, notes: '' }), notRelevant });
    annotations = nextAnnotations; custom = readCustom(records); saved = readSaved(records); removedSaved = readRemovedSaved(records); applied = readApplied(records); rebuildLibrary();
    index = indexPostings(libraryPostings); if (!markingMode) { page = 1; expanded.clear(); }
    element('snapshot-info').textContent = savedMode ? `${saved.size} Saved postings · Local to Scoped, independent of SCOPE` : snapshot ? `${snapshot.postings.length.toLocaleString()} postings · Collected ${new Date(snapshot.collectedAt).toLocaleString()}` : 'Your saved SCOPE search, ready to explore.';
    error(collectionError); makeFacets(); render();
  } catch (value) { if (revision === loadRevision) { snapshot = undefined; libraryPostings = []; index = []; libraryRevision++; render(); error(value); } }
}
fillControls();
// Register after starting the initial read. A newer event invalidates that read.
void load(true);
api.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let metadataChanged = false;
  for (const [key, change] of Object.entries(changes)) if (key.startsWith(annotationPrefix)) {
    const prior = annotations.get(key.slice(annotationPrefix.length));
    const id = key.slice(annotationPrefix.length), record = readAnnotations({ [key]: change.newValue }).get(id);
    relevanceWriter.observe(id, record?.notRelevant ?? false);
    const override = relevanceWriter.overrides.get(id);
    if (record || override !== undefined) annotations.set(id, { ...(record ?? { version: 1, id, notes: '' }), ...(override !== undefined ? { notRelevant: override } : {}) } as Annotation);
    else annotations.delete(id);
    const next = annotations.get(id), changed = prior?.notes !== next?.notes || prior?.notRelevant !== next?.notRelevant;
    annotationChanges.set(id, ++annotationRevision); metadataChanged ||= changed;
    if (markingMode && changed) patchMark(id);
  }
  const libraryChanged = Object.hasOwn(changes, 'snapshot') || Object.keys(changes).some(key => key.startsWith(savedPrefix) || key.startsWith(appliedPrefix) || key.startsWith(removedSavedPrefix) || key.startsWith(customPrefix));
  if (libraryChanged || metadataChanged && !preferencesLoaded) void load();
  else if (metadataChanged && !markingMode) render();
});

let expirySignature = '';
function refreshExpiry(): void {
  if (document.hidden) return;
  const next = libraryPostings.filter(row => isExpired(row.deadlineText)).map(row => row.id).join(',') + (preferences.relativeDeadlines ? `:${Math.floor(Date.now() / 60_000)}` : '');
  if (next !== expirySignature) { expirySignature = next; render(); }
}
setInterval(refreshExpiry, 60_000);
document.addEventListener('visibilitychange', refreshExpiry);
