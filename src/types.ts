export const SOURCE_URL = 'https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm';

export function isSourceUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const candidate = new URL(url);
    const source = new URL(SOURCE_URL);
    return candidate.origin === source.origin && candidate.pathname === source.pathname;
  } catch { return false; }
}

export interface Posting {
  id: string;
  applicationStatus: string;
  term: string;
  jobTitle: string;
  organization: string;
  division: string;
  location: string;
  applications: number | '';
  deadlineText: string;
  isNew: boolean;
  shortlisted: boolean;
  /** Real URL when supplied by SCOPE; otherwise a session-independent row target. */
  postingLink?: { kind: 'url'; url: string } | { kind: 'scope'; page: number };
}

export interface Snapshot {
  schemaVersion: 1;
  collectedAt: string;
  sourceUrl: string;
  reportedTotal: number;
  postings: Posting[];
}

export interface Progress {
  currentPage: number;
  collected: number;
  total: number;
}

export interface RunState extends Progress {
  runId: string;
  tabId: number;
  sourceUrl: string;
  status: 'running' | 'canceling' | 'complete' | 'canceled' | 'error';
  startedAt: string;
  message: string;
}

export type Command =
  | { type: 'getSaved' }
  | { type: 'getLibrary' }
  | { type: 'setApplied'; id: string; applied: boolean }
  | { type: 'setSaved'; id: string; saved: boolean }
  | { type: 'undoSavedRemoval'; id: string; token: string }
  | { type: 'getState'; tabId: number }
  | { type: 'start'; tabId: number }
  | { type: 'cancel'; tabId: number }
  | { type: 'download'; format: 'csv' | 'json' }
  | { type: 'openPosting'; id: string; tabId: number }
  | { type: 'collect'; runId: string; sourceUrl: string }
  | { type: 'abort'; runId: string }
  | { type: 'collectorStatus'; runId: string }
  | { type: 'progress'; runId: string; progress: Progress }
  | { type: 'complete'; runId: string; snapshot: Snapshot }
  | { type: 'failed'; runId: string; canceled: boolean; message: string };

export type Reply<T = unknown> = { ok: true; value: T } | { ok: false; error: string };
