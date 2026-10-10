import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parsePage } from '../src/parser';
import { defaults, preferencesKey } from '../src/viewer-model';
import { SOURCE_URL, type Snapshot } from '../src/types';
import { loadFixture } from './helpers';

let stored: Record<string, unknown>, get: ReturnType<typeof vi.fn>, set: ReturnType<typeof vi.fn>, onChanged: ReturnType<typeof vi.fn>, sendMessage: ReturnType<typeof vi.fn>;
let snapshot: Snapshot;
let savedRecords: Record<string, unknown>;
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.resetModules(); loadFixture();
  snapshot = { schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: '2026-10-10T00:00:00Z', reportedTotal: 3, postings: parsePage(document).postings };
  stored = { snapshot };
  savedRecords = {};
  document.body.innerHTML = new DOMParser().parseFromString(readFileSync('viewer.html', 'utf8'), 'text/html').body.innerHTML;
  get = vi.fn(async keys => Object.fromEntries(keys.map((key: string) => [key, stored[key]])));
  set = vi.fn(async items => { Object.assign(stored, items); }); onChanged = vi.fn(); sendMessage = vi.fn(async (command: any) => {
    if (command.type === 'getLibrary') return { ok: true, value: savedRecords };
    if (command.type === 'setSaved') {
      if (command.saved) { savedRecords['saved:' + command.id] = { version: 1, savedAt: snapshot.collectedAt, posting: snapshot.postings.find(row => row.id === command.id) }; delete savedRecords['savedRemoved:' + command.id]; }
      else { delete savedRecords['saved:' + command.id]; savedRecords['savedRemoved:' + command.id] = { version: 1, id: command.id, removedAt: snapshot.collectedAt }; }
    }
    if (command.type === 'setApplied') {
      if (command.applied) savedRecords['applied:' + command.id] = { version: 1, appliedAt: snapshot.collectedAt, posting: snapshot.postings.find(row => row.id === command.id) };
      else delete savedRecords['applied:' + command.id];
    }
    return { ok: true };
  });
  vi.stubGlobal('chrome', { storage: { local: { get, set }, onChanged: { addListener: onChanged } }, runtime: { getURL: (path: string) => 'chrome-extension://scoped/' + path, sendMessage } });
});
const control = (id: string) => document.getElementById(id) as HTMLInputElement;
const rows = () => document.querySelectorAll('#rows tr:not(.expanded)');
async function open(): Promise<void> { await import('../src/viewer'); await vi.waitFor(() => expect(document.getElementById('snapshot-info')!.textContent).not.toContain('Loading')); }
function change(id: string, value: string): void { control(id).value = value; control(id).dispatchEvent(new Event(id === 'query' ? 'input' : 'change')); }
describe('local viewer', () => {
  it('saves locally, syncs another tab, and removes the save without changing SCOPE flags', async () => {
    snapshot.postings[0].shortlisted = false; await open(); const original = snapshot.postings[0].shortlisted;
    document.querySelector<HTMLButtonElement>('[data-save="1001"]')!.click();
    await vi.waitFor(() => expect(document.querySelector('[data-save="1001"]')!.getAttribute('aria-pressed')).toBe('true'));
    expect(sendMessage).toHaveBeenCalledWith({ type: 'setSaved', id: '1001', saved: true }); expect(snapshot.postings[0].shortlisted).toBe(original);
    delete savedRecords['saved:1001']; onChanged.mock.calls[0][0]({ 'saved:1001': {} }, 'local');
    await vi.waitFor(() => expect(document.querySelector('[data-save="1001"]')!.getAttribute('aria-pressed')).toBe('false'));
  });
  it('renders retained Saved postings without a current snapshot and removes them from that view', async () => {
    vi.stubGlobal('location', { href: 'chrome-extension://scoped/viewer.html?view=saved' });
    savedRecords['saved:1001'] = { version: 1, savedAt: snapshot.collectedAt, posting: snapshot.postings[0] };
    delete stored.snapshot; await open(); expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Not in latest search');
    expect(document.querySelector<HTMLAnchorElement>('#saved-tab')!.getAttribute('aria-current')).toBe('page');
    document.querySelector<HTMLButtonElement>('[data-save="1001"]')!.click();
    await vi.waitFor(() => expect(rows()).toHaveLength(0));
    expect(document.getElementById('empty')!.textContent).toContain('No Saved postings');
  });
  it('keeps an unsuccessful save visibly unsaved and reports its error', async () => {
    snapshot.postings[0].shortlisted = false; await open(); sendMessage.mockImplementationOnce(async () => ({ ok: false, error: 'Storage unavailable' }));
    document.querySelector<HTMLButtonElement>('[data-save="1001"]')!.click();
    await vi.waitFor(() => expect(document.getElementById('error')!.textContent).toContain('Storage unavailable'));
    expect(document.querySelector('[data-save="1001"]')!.getAttribute('aria-pressed')).toBe('false');
  });
  it('keeps validated Saved records accessible even if the current collection is malformed', async () => {
    vi.stubGlobal('location', { href: 'chrome-extension://scoped/viewer.html?view=saved' });
    savedRecords['saved:1001'] = { version: 1, savedAt: snapshot.collectedAt, posting: snapshot.postings[0] };
    stored.snapshot = { schemaVersion: 99 }; await open();
    expect(rows()).toHaveLength(1); expect(document.getElementById('error')!.textContent).toContain('unsupported');
    expect(stored.snapshot).toEqual({ schemaVersion: 99 });
  });
  it('sorts filter options by count, reverse name, and selection without changing the result sort', async () => {
    snapshot.postings[0].organization = 'Alpha'; snapshot.postings[1].organization = 'Zebra'; snapshot.postings[2].organization = 'Zebra';
    await open();
    const group = document.querySelector<HTMLElement>('[data-facet="organizations"]')!;
    const sort = group.querySelector<HTMLSelectElement>('select')!;
    const values = () => [...group.querySelectorAll<HTMLInputElement>('.facet-options input')].map(input => input.value);
    expect(values()).toEqual(['Alpha', 'Zebra']);
    sort.value = 'count'; sort.dispatchEvent(new Event('change'));
    expect(values()).toEqual(['Zebra', 'Alpha']);
    await vi.waitFor(() => expect(stored[preferencesKey]).toMatchObject({ facetOrder: { organizations: 'count' }, sort: 'deadlineText' }));
    sort.value = 'za'; sort.dispatchEvent(new Event('change')); expect(values()).toEqual(['Zebra', 'Alpha']);
    sort.value = 'selected'; sort.dispatchEvent(new Event('change'));
    const zebra = [...group.querySelectorAll<HTMLInputElement>('.facet-options input')].find(input => input.value === 'Zebra')!;
    zebra.click(); expect(values()).toEqual(['Zebra', 'Alpha']); expect(rows()).toHaveLength(2);
    expect(group.querySelector('.facet-selected')!.textContent).toBe('1 selected');
    control('reset').click(); expect(rows()).toHaveLength(3);
    expect(document.querySelector<HTMLSelectElement>('[data-facet="organizations"] select')!.value).toBe('selected');
  });
  it('retains option searches when removing a chip and explains empty option searches', async () => {
    await open();
    const search = document.querySelector<HTMLInputElement>('[data-facet="locations"] input[type="search"]')!;
    search.value = 'missing location'; search.dispatchEvent(new Event('input'));
    expect(document.querySelector('[data-facet="locations"] .facet-empty')!.textContent).toContain('No options match');
    change('query', 'python'); await vi.waitFor(() => expect(rows()).toHaveLength(1));
    document.querySelector<HTMLButtonElement>('#chips button')!.click();
    expect(document.querySelector<HTMLInputElement>('[data-facet="locations"] input[type="search"]')!.value).toBe('missing location');
    control('reset').click(); expect(document.querySelector<HTMLInputElement>('[data-facet="locations"] input[type="search"]')!.value).toBe('');
  });
  it('renders safe full text, posting actions, captured details, and downloads', async () => {
    snapshot.postings[0].jobTitle = '<img src=x onerror=alert(1)> Full title';
    await open(); expect(rows()).toHaveLength(3); expect(document.querySelector('#rows img')).toBeNull();
    expect(document.querySelector<HTMLAnchorElement>('#rows a')!.href).toBe('chrome-extension://scoped/posting.html?id=1001');
    expect(document.querySelector('#rows .actions-cell a')).toBeNull();
    document.querySelector<HTMLButtonElement>('button[data-details="1001"]')!.click();
    expect(document.getElementById('details-1001')!.textContent).toContain('<img src=x onerror=alert(1)> Full title');
    control('csv').click(); await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({ type: 'download', format: 'csv' }));
  });
  it('hyperlinks cleaned position text even in older snapshots without link metadata', async () => {
    snapshot.postings.forEach(row => { delete row.postingLink; });
    await open();
    const title = document.querySelector<HTMLAnchorElement>('#rows [data-column="jobTitle"] a')!;
    expect(title.textContent).toBe('W27 Backend Engineer — Python + FastAPI');
    expect(title.target).toBe('_blank');
    expect(title.href).toBe('chrome-extension://scoped/posting.html?id=1001');
    expect(document.querySelector('#rows .actions-cell button[data-details]')!.textContent).toBe('Details');
  });
  it('restores preferences, filters instantly, persists changes, and resets filters', async () => {
    stored[preferencesKey] = { ...defaults(), query: 'research', columns: ['jobTitle', 'id'] };
    await open(); expect(rows()).toHaveLength(1); expect(control('query').value).toBe('research');
    change('query', 'python'); await vi.waitFor(() => expect(rows()[0].textContent).toContain('Backend'));
    await vi.waitFor(() => expect(set).toHaveBeenCalled());
    control('reset').click(); expect(rows()).toHaveLength(3); expect(control('query').value).toBe('');
  });
  it('paginates the complete locally filtered set', async () => {
    snapshot.postings = Array.from({ length: 65 }, (_, index) => ({ ...snapshot.postings[0], id: String(5000 + index), jobTitle: `Job ${index}` })); snapshot.reportedTotal = 65;
    await open(); expect(rows()).toHaveLength(50); control('next').click(); expect(rows()).toHaveLength(15);
    change('query', 'Job 64'); await vi.waitFor(() => expect(rows()).toHaveLength(1)); expect(document.getElementById('page-label')!.textContent).toBe('Page 1 of 1');
  });
  it('updates only on a successful snapshot change, preserving the current query', async () => {
    await open(); change('query', 'python'); await vi.waitFor(() => expect(rows()).toHaveLength(1));
    const changed = onChanged.mock.calls[0][0]; changed({ 'run:7': { newValue: { status: 'error' } } }, 'local'); expect(rows()).toHaveLength(1);
    stored.snapshot = { ...snapshot, postings: [snapshot.postings[0]], reportedTotal: 1, collectedAt: '2026-10-11T00:00:00Z' };
    changed({ snapshot: { newValue: stored.snapshot } }, 'local');
    await vi.waitFor(() => expect(document.getElementById('count')!.textContent).toContain('1 matching / 1 postings')); expect(control('query').value).toBe('python');
  });
  it('shows no-data/no-matches and rejects invalid snapshots without deleting them', async () => {
    delete stored.snapshot; await open(); expect(document.getElementById('empty')!.textContent).toContain('No snapshot');
    stored.snapshot = snapshot; onChanged.mock.calls[0][0]({ snapshot: {} }, 'local'); await vi.waitFor(() => expect(rows()).toHaveLength(3));
    change('query', 'no such job'); await vi.waitFor(() => { expect(document.getElementById('empty')!.hidden).toBe(false); expect(document.getElementById('empty')!.textContent).toContain('No postings match'); });
    stored.snapshot = { ...snapshot, schemaVersion: 99 }; onChanged.mock.calls[0][0]({ snapshot: {} }, 'local'); await vi.waitFor(() => expect(document.getElementById('error')!.textContent).toContain('unsupported')); expect(stored.snapshot).toMatchObject({ schemaVersion: 99 });
  });
  it('discards an older initial read when a newer snapshot event wins, while restoring preferences', async () => {
    let finish!: (value: unknown) => void; get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    stored[preferencesKey] = { ...defaults(), query: 'python' };
    await import('../src/viewer');
    stored.snapshot = { ...snapshot, postings: [snapshot.postings[0]], reportedTotal: 1 };
    onChanged.mock.calls[0][0]({ snapshot: {} }, 'local');
    expect(get).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(document.getElementById('count')!.textContent).toContain('1 matching / 1'));
    finish({ snapshot, [preferencesKey]: defaults() }); await Promise.resolve();
    expect(document.getElementById('count')!.textContent).toContain('1 matching / 1'); expect(control('query').value).toBe('python');
  });
});

it('includes SCOPE shortlist in Saved and moves local applications to Applied, with undo', async () => {
  vi.stubGlobal('location', { href: 'chrome-extension://scoped/viewer.html?view=saved' });
  await open(); expect(rows()).toHaveLength(1); expect(rows()[0].textContent).toContain('SCOPE shortlist');
  document.querySelector<HTMLButtonElement>('[data-applied="1001"]')!.click();
  await vi.waitFor(() => expect(rows()).toHaveLength(0));
  expect(document.getElementById('applied-count')!.textContent).toBe('1');
  expect(snapshot.postings[0].shortlisted).toBe(true);
});
it('shows retained Applied positions and removes them on undo without a snapshot', async () => {
  vi.stubGlobal('location', { href: 'chrome-extension://scoped/viewer.html?view=applied' });
  savedRecords['applied:1001'] = { version: 1, appliedAt: snapshot.collectedAt, posting: snapshot.postings[0] };
  delete stored.snapshot; await open(); expect(rows()).toHaveLength(1);
  document.querySelector<HTMLButtonElement>('[data-applied="1001"]')!.click();
  await vi.waitFor(() => expect(rows()).toHaveLength(0));
  expect(document.getElementById('empty')!.textContent).toContain('No Applied');
});
it('dims expired rows and can hide them using the local deadline time', async () => {
  snapshot.postings[0].deadlineText = 'Jan 1, 2000 09:00 AM';
  await open(); expect(document.querySelector('.expired-posting')).not.toBeNull();
  control('hideExpired').checked = true; control('hideExpired').dispatchEvent(new Event('change'));
  expect(document.querySelector('[data-save="1001"]')).toBeNull();
});

it('groups location choices, persists the option, and restores city choices when disabled', async () => {
  snapshot.postings[1].location = 'Burnaby, BC'; await open();
  const selectedCity = document.querySelector<HTMLInputElement>('[data-facet="locations"] input[value="Vancouver, BC"]')!;
  selectedCity.checked = true; selectedCity.dispatchEvent(new Event('change')); expect(rows()).toHaveLength(1);
  const group = control('groupGreaterVancouver'); group.checked = true; group.dispatchEvent(new Event('change'));
  expect(rows()).toHaveLength(2);
  const grouped = document.querySelector<HTMLInputElement>('[data-facet="locations"] input[value="group:greater-vancouver"]')!;
  expect(grouped.checked).toBe(true); expect(grouped.parentElement!.textContent).toContain('Greater Vancouver');
  expect(document.querySelector('[data-facet="locations"] input[value="Burnaby, BC"]')).toBeNull();
  expect(document.getElementById('chips')!.textContent).toContain('Greater Vancouver');
  await vi.waitFor(() => expect(set).toHaveBeenCalledWith(expect.objectContaining({ [preferencesKey]: expect.objectContaining({ groupGreaterVancouver: true }) })));
  const off = control('groupGreaterVancouver'); off.checked = false; off.dispatchEvent(new Event('change'));
  expect(rows()).toHaveLength(2); expect(document.querySelector('[data-facet="locations"] input[value="Burnaby, BC"]')).not.toBeNull();
  expect(snapshot.postings[1].location).toBe('Burnaby, BC');
});

it('removes SCOPE shortlist entries from Saved persistently without changing their SCOPE flag', async () => {
  vi.stubGlobal('location', { href: 'chrome-extension://scoped/viewer.html?view=saved' });
  await open(); expect(rows()).toHaveLength(1);
  const remove = document.querySelector<HTMLButtonElement>('[data-save="1001"]')!;
  expect(remove.textContent).toBe('Remove from Saved'); expect(document.body.textContent).not.toContain('Keep locally');
  remove.click(); await vi.waitFor(() => expect(rows()).toHaveLength(0));
  expect(snapshot.postings[0].shortlisted).toBe(true);
  onChanged.mock.calls[0][0]({ snapshot: {} }, 'local');
  await vi.waitFor(() => expect(document.getElementById('snapshot-info')!.textContent).toContain('0 Saved'));
  expect(rows()).toHaveLength(0);
});
it('restores an excluded shortlist entry through Save in All postings', async () => {
  savedRecords['savedRemoved:1001'] = { version: 1, id: '1001', removedAt: snapshot.collectedAt };
  await open(); expect(document.querySelector('[data-save="1001"]')!.textContent).toContain('Save');
  document.querySelector<HTMLButtonElement>('[data-save="1001"]')!.click();
  await vi.waitFor(() => expect(document.querySelector('[data-save="1001"]')!.textContent).toBe('Remove from Saved'));
  expect(savedRecords['savedRemoved:1001']).toBeUndefined();
});

it('toggles relative deadline display without changing Details or source data and remembers it', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 9, 10, 9));
  try {
    snapshot.postings[0].deadlineText = 'Oct 13, 2026 09:00 AM'; await open();
    expect(document.querySelector('[data-save="1001"]')!.closest('tr')!.querySelector('[data-column="deadlineText"]')!.getAttribute('title')).toBe('in 3 days');
    control('relativeDeadlines').checked = true; control('relativeDeadlines').dispatchEvent(new Event('change'));
    const row = document.querySelector('[data-save="1001"]')!.closest('tr')!;
    expect(row.querySelector('[data-column="deadlineText"]')!.textContent).toBe('in 3 days');
    expect(row.querySelector('[data-column="deadlineText"]')!.getAttribute('title')).toBe('Oct 13, 2026 09:00 AM');
    document.querySelector<HTMLButtonElement>('[data-details="1001"]')!.click();
    expect(document.getElementById('details-1001')!.textContent).toContain('Oct 13, 2026 09:00 AM');
    expect(document.querySelector('#details-1001 dd[title="in 3 days"]')).not.toBeNull();
    control('relativeDeadlines').checked = false; control('relativeDeadlines').dispatchEvent(new Event('change'));
    const current = document.querySelector('[data-save="1001"]')!.closest('tr')!.querySelector<HTMLElement>('[data-column="deadlineText"]')!;
    expect(current.textContent).toBe('Oct 13, 2026 09:00 AM'); expect(current.title).toBe('in 3 days');
    vi.setSystemTime(new Date(2026, 9, 11, 9)); current.dispatchEvent(new Event('mouseenter')); expect(current.title).toBe('in 2 days');
    control('relativeDeadlines').checked = true; control('relativeDeadlines').dispatchEvent(new Event('change'));
    document.getElementById('reset')!.click(); expect(control('relativeDeadlines').checked).toBe(true);
    await vi.waitFor(() => expect(stored[preferencesKey]).toMatchObject({ relativeDeadlines: true }));
    expect(snapshot.postings[0].deadlineText).toBe('Oct 13, 2026 09:00 AM');
  } finally { vi.useRealTimers(); }
});
