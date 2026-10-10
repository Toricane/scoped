import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collect } from '../src/collector';
import { SOURCE_URL, type Progress } from '../src/types';
import { installPagination, loadFixture, setPage } from './helpers';

let cleanup: (() => void) | undefined;
beforeEach(() => { loadFixture(); setPage(1); });
afterEach(() => { cleanup?.(); cleanup = undefined; });
const options = (signal = new AbortController().signal) => ({ doc: document, sourceUrl: SOURCE_URL, signal, timeoutMs: 100, onProgress: async (_progress: Progress) => {} });

describe('all-page collection', () => {
  it('starts from a later page, uses sequential AJAX replacements, and reports progress', async () => {
    setPage(2);
    const visited: number[] = [];
    const progress: Progress[] = [];
    cleanup = installPagination(page => { visited.push(page); setTimeout(() => setPage(page), 5); });
    const snapshot = await collect({ ...options(), onProgress: async value => { progress.push(value); } });
    expect(visited).toEqual([1, 2, 3]);
    expect(snapshot.postings.map(row => row.id)).toEqual(['2001', '2002', '2003', '2004', '2005']);
    expect(snapshot.reportedTotal).toBe(5);
    expect(progress.at(-1)).toEqual({ currentPage: 3, collected: 5, total: 5 });
    expect(document.querySelector<HTMLInputElement>('.pagination input')!.value).toBe('3');
  });
  it('collects one page and empty results without clicking posting actions', async () => {
    loadFixture();
    cleanup = installPagination(() => { throw new Error('Unexpected navigation'); });
    expect((await collect(options())).postings).toHaveLength(3);
    setPage(1, 0);
    expect((await collect(options())).postings).toEqual([]);
  });
  it('rejects a changed total, wrong page, skipped range, and repeated rows', async () => {
    cleanup = installPagination(page => setPage(page, 6));
    await expect(collect(options())).rejects.toThrow('total changed');
    cleanup();
    setPage(1);
    cleanup = installPagination(() => setPage(3));
    await expect(collect(options())).rejects.toThrow('instead');
    cleanup();
    setPage(1);
    cleanup = installPagination(page => { setPage(page); document.querySelector('#totalOverAllDocs')!.textContent = '4'; document.querySelector('tbody tr:last-child')!.remove(); });
    await expect(collect(options())).rejects.toThrow('range');
    cleanup();
    setPage(1);
    cleanup = installPagination(page => setPage(page, 5, ['2001', '2002']));
    await expect(collect(options())).rejects.toThrow('repeated');
  });
  it('deduplicates overlapping IDs and rejects an incomplete unique count', async () => {
    cleanup = installPagination(page => setPage(page, 5, page === 2 ? ['2002', '2004'] : undefined));
    await expect(collect(options())).rejects.toThrow('4 unique');
  });
  it('times out instead of silently saving a partial snapshot', async () => {
    cleanup = installPagination(() => {});
    await expect(collect({ ...options(), timeoutMs: 10 })).rejects.toThrow('Timed out');
  });
  it('reports session expiry when the table is replaced with a login page', async () => {
    cleanup = installPagination(() => { document.body.innerHTML = '<h1>Sign in</h1>'; });
    await expect(collect(options())).rejects.toThrow('signed in');
  });
  it('cancels while awaiting AJAX and stops further navigation', async () => {
    const controller = new AbortController();
    const visited: number[] = [];
    cleanup = installPagination(page => { visited.push(page); setTimeout(() => controller.abort(), 5); });
    await expect(collect(options(controller.signal))).rejects.toMatchObject({ name: 'AbortError' });
    expect(visited).toEqual([2]);
  });
  it('rejects a pre-canceled collection and user changes during progress acknowledgement', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(collect(options(controller.signal))).rejects.toMatchObject({ name: 'AbortError' });
    let updates = 0;
    await expect(collect({ ...options(), onProgress: async () => { if (++updates === 2) setPage(2); } })).rejects.toThrow('outside collection');
  });
  it('detects missing navigation controls', async () => {
    document.querySelectorAll('.pagination li:not(.active)').forEach(item => item.remove());
    await expect(collect(options())).rejects.toThrow('pagination control');
  });
});
