import { beforeEach, expect, it } from 'vitest';
import { readRemovedSaved, readApplied, appliedPostings, readSaved, savedPostings, savedKey } from '../src/saved';
import { commitSnapshot, type LocalStore } from '../src/store';
import { parsePage } from '../src/parser';
import { SOURCE_URL, type Snapshot, type RunState } from '../src/types';
import { loadFixture } from './helpers';
let snapshot: Snapshot;
beforeEach(() => { loadFixture(); snapshot = { schemaVersion: 1, collectedAt: '2026-10-10T00:00:00Z', sourceUrl: SOURCE_URL, reportedTotal: 3, postings: parsePage(document).postings }; });
it('validates saved records without conflating the local save and SCOPE shortlist', () => {
  const record = { version: 1, savedAt: snapshot.collectedAt, posting: snapshot.postings[1] };
  expect(readSaved({ [savedKey('1002')]: record }).has('1002')).toBe(true);
  expect(readSaved({ 'saved:wrong': record, 'saved:1002': { ...record, posting: { ...record.posting, jobTitle: 5 } } }).size).toBe(0);
  expect(readSaved({ 'saved:1002': { ...record, savedAt: 0 } }).size).toBe(0);
});
it('uses fresh captured values when present and retained records when absent', () => {
  const old = snapshot.postings[0];
  const saved = readSaved({ 'saved:1001': { version: 1, savedAt: snapshot.collectedAt, posting: old } });
  snapshot.postings[0] = { ...old, applications: 55 };
  expect(savedPostings(saved, snapshot)[0].applications).toBe(55);
  snapshot.postings = []; expect(savedPostings(saved, snapshot)[0]).toEqual(old);
  expect(savedPostings(saved)[0]).toEqual(old);
});
it('refreshes saved copies atomically on success while keeping missing saves', async () => {
  const data: Record<string, unknown> = { 'saved:1001': { version: 1, savedAt: snapshot.collectedAt, posting: snapshot.postings[0] }, 'saved:9999': { version: 1, savedAt: snapshot.collectedAt, posting: { ...snapshot.postings[0], id: '9999' } } };
  const store: LocalStore = { get: async keys => Object.fromEntries(keys.map(key => [key, data[key]])), set: async value => { Object.assign(data, value); } };
  const run: RunState = { runId: 'new', tabId: 7, status: 'running', sourceUrl: SOURCE_URL, startedAt: snapshot.collectedAt, currentPage: 1, total: 3, collected: 3, message: '' };
  snapshot.postings[0] = { ...snapshot.postings[0], applications: 23 };
  await commitSnapshot(store, run, snapshot);
  expect(readSaved(data).get('1001')!.posting.applications).toBe(23);
  expect(readSaved(data).get('9999')).toBeDefined();
  const prior = data['saved:1001'];
  await expect(commitSnapshot(store, { ...run, status: 'canceling' }, snapshot)).rejects.toThrow();
  expect(data['saved:1001']).toBe(prior);
});

it('unions SCOPE shortlist and local saves, deduplicating and separating Applied', () => {
  const saved = readSaved({ 'saved:1001': { version: 1, savedAt: snapshot.collectedAt, posting: snapshot.postings[0] } });
  expect(savedPostings(new Map(), snapshot).map(row => row.id)).toEqual(['1001']);
  expect(savedPostings(saved, snapshot)).toHaveLength(1);
  const applied = readApplied({ 'applied:1001': { version: 1, appliedAt: snapshot.collectedAt, posting: snapshot.postings[0] } });
  expect(savedPostings(saved, snapshot, applied)).toHaveLength(0);
  expect(appliedPostings(applied)[0]).toEqual(snapshot.postings[0]);
  expect(readApplied({ 'applied:1001': { version: 1, appliedAt: 'invalid', posting: snapshot.postings[0] }, 'applied:2': { version: 1 } }).size).toBe(0);
});
it('updates Applied retained copies only on successful collection commit', async () => {
  const data: Record<string, unknown> = { 'applied:1001': { version: 1, appliedAt: snapshot.collectedAt, posting: snapshot.postings[0] } };
  const store: LocalStore = { get: async keys => Object.fromEntries(keys.map(key => [key, data[key]])), set: async value => { Object.assign(data, value); } };
  const run: RunState = { runId: 'new', tabId: 7, status: 'running', sourceUrl: SOURCE_URL, startedAt: snapshot.collectedAt, currentPage: 1, total: 3, collected: 3, message: '' };
  snapshot.postings[0] = { ...snapshot.postings[0], applications: 99 };
  await commitSnapshot(store, run, snapshot);
  expect(readApplied(data).get('1001')!.posting.applications).toBe(99);
  const prior = data['applied:1001'];
  await expect(commitSnapshot(store, { ...run, status: 'canceling' }, snapshot)).rejects.toThrow();
  expect(data['applied:1001']).toBe(prior);
});

it('validates removal records and keeps shortlisted or locally saved IDs excluded on refresh', () => {
  const removed = readRemovedSaved({ 'savedRemoved:1001': { version: 1, id: '1001', removedAt: snapshot.collectedAt }, 'savedRemoved:1002': { version: 1, id: 'bad', removedAt: snapshot.collectedAt } });
  expect([...removed]).toEqual(['1001']);
  const saved = readSaved({ 'saved:1001': { version: 1, savedAt: snapshot.collectedAt, posting: snapshot.postings[0] } });
  expect(savedPostings(saved, snapshot, new Map(), removed)).toHaveLength(0);
  snapshot.postings[0].applications = 99;
  expect(savedPostings(saved, snapshot, new Map(), removed)).toHaveLength(0);
});
