import { SOURCE_URL, type Posting } from './types';

export function postingLink(anchor: HTMLAnchorElement | null, page: number): Posting['postingLink'] {
  if (!anchor) return undefined;
  const href = anchor.getAttribute('href');
  if (href && !/^(?:#|javascript:)/i.test(href.trim())) {
    try {
      const url = new URL(href, SOURCE_URL);
      if (url.origin === new URL(SOURCE_URL).origin && url.protocol === 'https:' && !url.username && !url.password) return { kind: 'url', url: url.href };
    } catch { /* A form action is resolved from the live row instead. */ }
  }
  return { kind: 'scope', page };
}

export const normalize = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

export interface ParsedPage {
  table: HTMLTableElement;
  pagination: HTMLElement | null;
  page: number;
  total: number;
  start: number;
  end: number;
  postings: Posting[];
}

function integer(text: string, label: string): number {
  const cleaned = text.replace(/,/g, '');
  if (!/^\d+$/.test(cleaned)) throw new Error(`SCOPE ${label} is missing or invalid.`);
  return Number(cleaned);
}

export function parsePage(doc: Document): ParsedPage {
  const root = doc.querySelector<HTMLElement>('#postingsTablePlaceholder');
  const table = root?.querySelector<HTMLTableElement>('#postingsTable');
  if (!root || !table) throw new Error('The SCOPE results table is missing. Check that you are signed in and viewing search results.');
  const total = integer(normalize(root.querySelector('.orbis-posting-actions .badge-info')?.textContent), 'result count');
  const headers = [...table.querySelectorAll('thead tr:first-child > th, thead tr:first-child > td')].map(cell => normalize(cell.textContent));
  const required = ['App Status', 'Term', 'ID', 'Job Title', 'Organization', 'Division', 'Location', 'Applications', 'App Deadline'];
  const indices = Object.fromEntries(required.map(name => {
    const index = headers.indexOf(name);
    if (index < 0 || headers.lastIndexOf(name) !== index) throw new Error(`SCOPE table structure changed: missing or ambiguous ${name} column.`);
    return [name, index];
  }));
  const rows = [...table.querySelectorAll<HTMLTableRowElement>('tbody tr.searchResult')];
  const postings = rows.map(row => {
    const cells = [...row.cells];
    if (cells.length !== headers.length) throw new Error('SCOPE table structure changed: row and header column counts differ.');
    const cell = (name: string) => cells[indices[name]];
    const text = (name: string) => normalize(cell(name).textContent);
    const full = (name: string) => normalize(cell(name).getAttribute('data-totitle')) || text(name);
    const id = text('ID');
    if (!/^\d+$/.test(id) || row.id !== `posting${id}`) throw new Error('A posting ID is missing or does not match its row.');
    const titleCell = cell('Job Title');
    const title = normalize(titleCell.querySelector(`a.np-view-btn-${id}`)?.textContent) || normalize(titleCell.getAttribute('data-totitle'));
    if (!title) throw new Error(`Posting ${id} has no full title.`);
    const applications = text('Applications');
    return {
      id, applicationStatus: text('App Status'), term: text('Term'), jobTitle: title,
      organization: full('Organization'), division: full('Division'), location: full('Location'),
      applications: applications === '' ? '' : integer(applications, 'application count'),
      deadlineText: text('App Deadline'), isNew: row.classList.contains('isNew'), shortlisted: row.classList.contains('isFav'),
    } satisfies Posting;
  });
  const pagination = root.querySelector<HTMLElement>('.pagination');
  const pageInputs = [...root.querySelectorAll<HTMLInputElement>('.pagination input[id^="currentPage"]')];
  const pages = pageInputs.map(input => integer(input.value, 'current page'));
  const activePage = normalize(pagination?.querySelector('li.active a')?.textContent);
  const page = pages[0] ?? (activePage ? integer(activePage, 'active page') : 1);
  if (page < 1 || pages.some(value => value !== page) || (activePage && integer(activePage, 'active page') !== page)) {
    throw new Error('SCOPE pagination indicators disagree. Wait for the page to finish loading.');
  }
  postings.forEach(posting => {
    const anchor = table.querySelector<HTMLAnchorElement>(`#posting${posting.id} .np-view-btn-${posting.id}`);
    const target = postingLink(anchor, page);
    if (target) Object.assign(posting, { postingLink: target });
  });
  const startText = normalize(root.querySelector('#totalOverAllDocs')?.textContent);
  const endText = normalize(root.querySelector('#totalOverAllPacks')?.textContent);
  const start = total === 0 && !startText ? 0 : integer(startText, 'displayed start');
  const end = total === 0 && !endText ? 0 : integer(endText, 'displayed end');
  if (total === 0) {
    if (postings.length || end !== 0) throw new Error('The empty result count does not match the table.');
  } else if (start < 1 || end < start || end > total || postings.length !== end - start + 1) {
    throw new Error('SCOPE displayed range does not match the table rows.');
  }
  return { table, pagination, page, total, start, end, postings };
}

export function pageLink(page: ParsedPage, target: number): HTMLAnchorElement {
  if (!page.pagination) throw new Error('SCOPE pagination controls are missing.');
  const links = [...page.pagination.querySelectorAll<HTMLAnchorElement>('li:not(.disabled) a')];
  const link = links.find(anchor => normalize(anchor.textContent) === String(target)) ?? links.find(anchor => {
    // Read the page argument as data. Never evaluate the site's handler text.
    const match = anchor.getAttribute('onclick')?.match(/loadPostingTable\(\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*'(\d+)'/);
    return match?.[1] === String(target);
  });
  if (!link) throw new Error(`Cannot find a SCOPE pagination control for page ${target}.`);
  return link;
}
