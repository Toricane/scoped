import { afterEach, expect, it, vi } from 'vitest';
import { SemanticSearch } from '../src/semantic-client';
import type { SemanticReply, SemanticRequest } from '../src/semantic-model';
afterEach(() => vi.unstubAllGlobals());
it('ignores stale worker replies, terminates on cancellation, and recovers after failure', async () => {
  const workers: FakeWorker[] = [];
  class FakeWorker {
    onmessage?: (event: { data: SemanticReply }) => void; onerror?: () => void;
    postMessage = vi.fn<(request: SemanticRequest) => void>(); terminate = vi.fn();
    constructor() { workers.push(this); }
  }
  vi.stubGlobal('Worker', FakeWorker);
  const search = new SemanticSearch(), progress = vi.fn();
  const first = search.search([], 'all', 'old query', progress); const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
  const second = search.search([], 'title', 'new query', progress); await rejected;
  workers[0].onmessage!({ data: { type: 'progress', revision: 1, message: 'Stale' } }); expect(progress).not.toHaveBeenCalled();
  workers[0].onmessage!({ data: { type: 'result', revision: 2, scores: [['1001', 0.8]], cacheAvailable: true } });
  expect((await second).scores.get('1001')).toBe(0.8);
  const third = search.search([], 'all', 'another', progress); const canceled = expect(third).rejects.toMatchObject({ name: 'AbortError' }); search.cancel(); await canceled;
  expect(workers[0].terminate).toHaveBeenCalledOnce();
  const failed = search.search([], 'all', 'retry', progress); const failure = expect(failed).rejects.toThrow('Keyword results'); workers[1].onerror!(); await failure;
  const final = search.search([], 'all', 'recovered', progress); const revision = workers[2].postMessage.mock.calls[0][0].revision;
  workers[1].onerror!(); expect(workers[2].terminate).not.toHaveBeenCalled();
  workers[2].onmessage!({ data: { type: 'result', revision, scores: [], cacheAvailable: false } }); expect((await final).cacheAvailable).toBe(false); search.cancel();
});
