import { semanticText, type SearchScope, type SemanticReply, type SemanticRequest } from './semantic-model';
import type { Posting } from './types';

export class SemanticSearch {
  private worker?: Worker;
  private revision = 0;
  private pending?: { resolve: (value: { scores: Map<string, number>; cacheAvailable: boolean }) => void; reject: (error: Error) => void; progress: (message: string) => void };
  cancel(): void {
    this.revision++;
    this.pending?.reject(new DOMException('Search superseded', 'AbortError')); this.pending = undefined;
    this.worker?.terminate(); this.worker = undefined;
  }
  search(postings: Posting[], scope: SearchScope, query: string, progress: (message: string) => void): Promise<{ scores: Map<string, number>; cacheAvailable: boolean }> {
    this.pending?.reject(new DOMException('Search superseded', 'AbortError')); this.pending = undefined;
    const revision = ++this.revision;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, progress };
      try {
        if (!this.worker) {
          this.worker = new Worker(new URL('./semantic-worker.ts', import.meta.url), { type: 'module' });
          const worker = this.worker;
          this.worker.onmessage = (event: MessageEvent<SemanticReply>) => {
            const reply = event.data; if (reply.revision !== this.revision || !this.pending) return;
            if (reply.type === 'progress') this.pending.progress(reply.message);
            else {
              const pending = this.pending; this.pending = undefined;
              if (reply.type === 'result') pending.resolve({ scores: new Map(reply.scores), cacheAvailable: reply.cacheAvailable });
              else pending.reject(new Error(reply.message));
            }
          };
          this.worker.onerror = () => {
            if (this.worker !== worker) return;
            this.pending?.reject(new Error('Local semantic search could not start. Keyword results are shown. Reload the extension after rebuilding, or retry.'));
            this.pending = undefined; this.worker?.terminate(); this.worker = undefined;
          };
        }
        const request: SemanticRequest = { revision, query, documents: postings.map(posting => ({ id: posting.id, text: semanticText(posting, scope) })) };
        this.worker.postMessage(request);
      } catch (error) { this.pending = undefined; reject(error); }
    });
  }
}
