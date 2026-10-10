import { beforeEach, describe, expect, it } from 'vitest';
import { normalize, pageLink, parsePage } from '../src/parser';
import { isSourceUrl, SOURCE_URL } from '../src/types';
import { fixture, loadFixture, setPage } from './helpers';

beforeEach(loadFixture);

describe('SCOPE DOM adapter', () => {
  it('reads full text, separate badges/flags, blanks, counts, and source title suffixes', () => {
    const page = parsePage(document);
    expect(page).toMatchObject({ page: 1, total: 3, start: 1, end: 3 });
    expect(page.postings[0]).toEqual({ id: '1001', applicationStatus: '', term: '2027 - Winter', jobTitle: 'W27 Backend Engineer — Python + FastAPI 1001', organization: 'Example Innovations Inc.', division: 'Head Office', location: 'Vancouver, BC', applications: 0, deadlineText: 'Oct 16, 2026 09:00 AM', isNew: true, shortlisted: true, postingLink: { kind: 'scope', page: 1 } });
    expect(page.postings[1]).toMatchObject({ applicationStatus: 'Applied', jobTitle: 'W27 Research Intern, “Tools” 1002B E1', organization: 'Société Exemple & Co.', applications: 12, shortlisted: false });
    expect(page.postings[2]).toMatchObject({ applications: '', deadlineText: '', division: '', isNew: false });
  });
  it('uses data-totitle when the title anchor is absent', () => {
    document.querySelector('.np-view-btn-1001')!.remove();
    expect(parsePage(document).postings[0].jobTitle).toBe('W27 Backend Engineer — Python + FastAPI 1001');
    expect(parsePage(document).postings[0].postingLink).toBeUndefined();
  });
  it('captures genuine same-origin URLs and falls back to row targets for script or unsafe links', () => {
    const anchor = document.querySelector('.np-view-btn-1001')!;
    anchor.setAttribute('href', '/myAccount/co-op/detail.htm?id=1001');
    expect(parsePage(document).postings[0].postingLink).toEqual({ kind: 'url', url: 'https://scope.sciencecoop.ubc.ca/myAccount/co-op/detail.htm?id=1001' });
    anchor.setAttribute('href', 'https://evil.example/');
    expect(parsePage(document).postings[0].postingLink).toEqual({ kind: 'scope', page: 1 });
    setPage(2);
    expect(parsePage(document).postings[0].postingLink).toEqual({ kind: 'scope', page: 2 });
  });
  it('maps reordered columns using headers including unlabeled action columns', () => {
    document.querySelectorAll<HTMLTableRowElement>('#postingsTable tr').forEach(row => row.append(row.cells[2]));
    expect(parsePage(document).postings[0].term).toBe('2027 - Winter');
  });
  it('uses only the first paginator and reads a target from its handler without executing it', () => {
    setPage(2);
    const page = parsePage(document);
    expect(page.page).toBe(2);
    const link = pageLink(page, 1);
    expect(link.closest('.pagination')).toBe(document.querySelector('.pagination'));
    link.textContent = '««';
    expect(pageLink(parsePage(document), 1)).toBe(link);
  });
  it('rejects missing columns, row IDs, and invalid row ranges', () => {
    document.querySelector('thead th')!.textContent = 'Changed';
    expect(() => parsePage(document)).toThrow('column');
    loadFixture();
    document.querySelector('tbody tr')!.id = 'posting999';
    expect(() => parsePage(document)).toThrow('ID');
    loadFixture();
    document.querySelector('#totalOverAllPacks')!.textContent = '2';
    expect(() => parsePage(document)).toThrow('range');
  });
  it('rejects mismatched duplicated page indicators and supports empty searches', () => {
    document.querySelectorAll<HTMLInputElement>('.pagination input')[1].value = '2';
    expect(() => parsePage(document)).toThrow('disagree');
    setPage(1, 0);
    expect(parsePage(document)).toMatchObject({ total: 0, postings: [] });
  });
  it('normalizes whitespace and limits collection to the exact source origin/path', () => {
    expect(normalize('  a\n b\t ')).toBe('a b');
    expect(isSourceUrl(SOURCE_URL + '?search=1')).toBe(true);
    expect(isSourceUrl(SOURCE_URL.replace('https:', 'http:'))).toBe(false);
    expect(isSourceUrl(SOURCE_URL + '/other')).toBe(false);
    expect(isSourceUrl('invalid')).toBe(false);
  });
  it('keeps the fixture self-contained and sanitized', () => {
    expect(fixture).not.toMatch(/<script\b|\bsrc=|_-_-|Prajwal|Prashanth|185565|https?:/i);
    expect(fixture).toContain('loadPostingTable');
    expect(parsePage(document).postings).toHaveLength(3);
  });
});
