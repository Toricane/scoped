import type { RunState, Snapshot } from './types';

export interface LocalStore {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const runKey = (tabId: number) => `run:${tabId}`;
export const isActive = (run?: RunState) => run?.status === 'running' || run?.status === 'canceling';

export async function readState(store: LocalStore, tabId: number): Promise<{ run?: RunState; snapshot?: Snapshot }> {
  const data = await store.get([runKey(tabId), 'snapshot']);
  return { run: data[runKey(tabId)] as RunState | undefined, snapshot: data.snapshot as Snapshot | undefined };
}

export async function commitSnapshot(store: LocalStore, run: RunState, snapshot: Snapshot): Promise<void> {
  if (run.status !== 'running') throw new Error('This collection is no longer running.');
  if (snapshot.schemaVersion !== 1 || snapshot.sourceUrl !== run.sourceUrl || snapshot.reportedTotal !== run.total || snapshot.postings.length !== snapshot.reportedTotal || new Set(snapshot.postings.map(row => row.id)).size !== snapshot.reportedTotal) {
    throw new Error('The collected snapshot is incomplete or does not match this run.');
  }
  await store.set({ snapshot, [runKey(run.tabId)]: { ...run, status: 'complete', collected: snapshot.postings.length, message: 'Collection complete. Your local snapshot is ready to export.' } });
}
