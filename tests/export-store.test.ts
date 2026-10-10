import { beforeEach, describe, expect, it } from 'vitest';
import { toCsv, toJson } from '../src/export';
import { parsePage } from '../src/parser';
import { commitSnapshot, readState, runKey, type LocalStore } from '../src/store';
import { SOURCE_URL, type RunState, type Snapshot } from '../src/types';
import { loadFixture } from './helpers';

beforeEach(loadFixture);
const snapshot = (): Snapshot => ({ schemaVersion: 1, sourceUrl: SOURCE_URL, collectedAt: '2026-10-09T12:00:00.000Z', reportedTotal: 3, postings: parsePage(document).postings });
const run = (): RunState => ({ tabId: 7, runId: 'run', sourceUrl: SOURCE_URL, status: 'running', startedAt: '2026-10-09T12:00:00.000Z', message: '', currentPage: 1, collected: 3, total: 3 });

describe('exports', () => {
  it('exports versioned JSON with raw text and no executable handlers', () => {
    const data = snapshot();
    data.postings[0].jobTitle = '=SUM(1,2)';
    expect(JSON.parse(toJson(data))).toEqual(data);
    expect(toJson(data)).not.toMatch(/onclick|initialSearchAction|buildForm/);
  });
  it('quotes commas, quotes, and multiline Unicode; preserves blanks and protects formulas', () => {
    const data = snapshot();
    data.postings[0].jobTitle = 'A "quoted",\n職務';
    data.postings[1].organization = '=HYPERLINK("evil")';
    const text = toCsv(data);
    expect(text.startsWith('\uFEFF"id"')).toBe(true);
    expect(text).toContain('"A ""quoted"",\n職務"');
    expect(text).toContain('"\'=HYPERLINK(""evil"")"');
    expect(text).toContain('"1001","","2027 - Winter"');
    expect(text).toContain('Montréal');
    expect(text).toContain('"true","true"');
  });
  it.each(['+cmd', '-cmd', '@cmd', '  =cmd', '\tcmd', '\rcmd', '\ncmd'])('protects dangerous CSV prefix %j', prefix => {
    const data = snapshot(); data.postings[0].jobTitle = prefix;
    expect(toCsv(data)).toContain(`"'${prefix}"`);
  });
});

describe('snapshot commit', () => {
  function memory(): { store: LocalStore; data: Record<string, unknown> } {
    const data: Record<string, unknown> = { snapshot: { ...snapshot(), collectedAt: 'old' } };
    return { data, store: { get: async keys => Object.fromEntries(keys.map(key => [key, data[key]])), set: async items => { Object.assign(data, items); } } };
  }
  it('commits a complete result and terminal run together', async () => {
    const { store } = memory();
    await commitSnapshot(store, run(), snapshot());
    expect(await readState(store, 7)).toMatchObject({ snapshot: snapshot(), run: { status: 'complete', collected: 3 } });
  });
  it('keeps the previous successful snapshot for incomplete, canceled, and duplicate results', async () => {
    const { store, data } = memory();
    const old = data.snapshot;
    await expect(commitSnapshot(store, run(), { ...snapshot(), postings: [] })).rejects.toThrow('incomplete');
    await expect(commitSnapshot(store, { ...run(), status: 'canceling' }, snapshot())).rejects.toThrow('no longer');
    const bad = snapshot(); bad.postings[1].id = bad.postings[0].id;
    await expect(commitSnapshot(store, run(), bad)).rejects.toThrow('incomplete');
    expect(data.snapshot).toBe(old);
    expect(data[runKey(7)]).toBeUndefined();
  });
});
