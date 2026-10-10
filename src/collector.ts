import { pageLink, parsePage, type ParsedPage } from './parser';
import { isSourceUrl, type Posting, type Progress, type Snapshot } from './types';

export interface CollectionOptions {
  doc: Document;
  sourceUrl: string;
  signal: AbortSignal;
  onProgress: (progress: Progress) => Promise<void>;
  timeoutMs?: number;
}

function abortCheck(signal: AbortSignal): void { signal.throwIfAborted(); }

async function navigate(options: CollectionOptions, before: ParsedPage, target: number): Promise<ParsedPage> {
  const { doc, signal } = options;
  abortCheck(signal);
  const link = pageLink(before, target);
  return new Promise((resolve, reject) => {
    let done = false;
    const window = doc.defaultView!;
    const cleanup = () => {
      observer.disconnect();
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    };
    const finish = (error?: unknown, result?: ParsedPage) => {
      if (done) return;
      done = true;
      cleanup();
      if (error) reject(error); else resolve(result!);
    };
    const onAbort = () => finish(signal.reason ?? new DOMException('Collection canceled.', 'AbortError'));
    const observer = new window.MutationObserver(() => {
      if (doc.querySelector('#postingsTable') === before.table) return;
      try {
        const next = parsePage(doc);
        if (next.page !== target) throw new Error(`SCOPE loaded page ${next.page} instead of page ${target}. Collection stopped.`);
        if (next.total !== before.total) throw new Error('The result total changed during collection. Start a fresh collection.');
        if (next.postings.length && next.postings.map(row => row.id).join(',') === before.postings.map(row => row.id).join(',')) {
          throw new Error('SCOPE repeated the previous page instead of loading new rows.');
        }
        finish(undefined, next);
      } catch (error) { finish(error); }
    });
    const timer = window.setTimeout(() => finish(new Error(`Timed out loading SCOPE page ${target}. Check your session and try again.`)), options.timeoutMs ?? 30_000);
    signal.addEventListener('abort', onAbort, { once: true });
    // Observe the document as a missing table/login redirect can replace its container.
    observer.observe(doc.documentElement, { childList: true, subtree: true });
    try { link.click(); } catch (error) { finish(error); }
  });
}

export async function collect(options: CollectionOptions): Promise<Snapshot> {
  if (!isSourceUrl(options.sourceUrl)) throw new Error('Open the SCOPE job-posting search results before collecting.');
  abortCheck(options.signal);
  let current = parsePage(options.doc);
  await options.onProgress({ currentPage: current.page, collected: 0, total: current.total });
  if (current.page !== 1) current = await navigate(options, current, 1);
  const postings = new Map<string, Posting>();
  let end = 0;
  const seenPages = new Set<number>();
  for (;;) {
    abortCheck(options.signal);
    if (seenPages.has(current.page)) throw new Error('SCOPE repeated a page. Collection stopped.');
    seenPages.add(current.page);
    if (current.total > 0 && current.start !== end + 1) throw new Error('SCOPE skipped or repeated a displayed range.');
    for (const posting of current.postings) postings.set(posting.id, posting);
    end = current.end;
    await options.onProgress({ currentPage: current.page, collected: postings.size, total: current.total });
    // Storage acknowledgement can yield while the user changes the search.
    abortCheck(options.signal);
    if (options.doc.querySelector('#postingsTable') !== current.table) throw new Error('SCOPE results changed outside collection. Start again and leave the source tab alone.');
    if (end >= current.total) break;
    current = await navigate(options, current, current.page + 1);
  }
  if (postings.size !== current.total) throw new Error(`Collected ${postings.size} unique postings but SCOPE reports ${current.total}. Start a fresh collection.`);
  return { schemaVersion: 1, collectedAt: new Date().toISOString(), sourceUrl: options.sourceUrl, reportedTotal: current.total, postings: [...postings.values()] };
}
