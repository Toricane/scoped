import type { Posting, Snapshot } from './types';

export const columns: (keyof Posting)[] = ['id', 'applicationStatus', 'term', 'jobTitle', 'organization', 'division', 'location', 'applications', 'deadlineText', 'isNew', 'shortlisted', 'postingLink'];

function csvCell(value: unknown): string {
  let text = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value ?? '');
  // JSON preserves original text. CSV protects spreadsheet applications from formulas.
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(snapshot: Snapshot): string {
  return '\uFEFF' + [columns.map(csvCell).join(','), ...snapshot.postings.map(posting => columns.map(key => csvCell(posting[key])).join(','))].join('\r\n') + '\r\n';
}

export function toJson(snapshot: Snapshot): string { return JSON.stringify(snapshot, null, 2) + '\n'; }
