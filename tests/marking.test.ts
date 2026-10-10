import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelevanceWriter, installRowMarking } from '../src/marking';

afterEach(() => { vi.useRealTimers(); });
describe('batched optimistic relevance', () => {
  it('paints synchronously and coalesces repeated toggles while preserving later edits across slow replies', async () => {
    vi.useFakeTimers();
    const state = new Map<string, boolean>(), send = vi.fn(); let finish!: () => void;
    send.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const writer = new RelevanceWriter(id => state.get(id) ?? false, (id, value) => { state.set(id, value); }, send, vi.fn());
    writer.set('001', true); writer.set('002', true); writer.set('002', false);
    expect(state.get('001')).toBe(true); expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(40);
    expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0]).toEqual([{ id: '001', notRelevant: true }, { id: '002', notRelevant: false }]);
    writer.set('001', false); const second = writer.flush();
    expect(state.get('001')).toBe(false); expect(send).toHaveBeenCalledTimes(2);
    finish(); await second;
    expect(state.get('001')).toBe(false); expect(writer.overrides.size).toBe(0); expect(send).toHaveBeenCalledTimes(2);
  });
  it('rolls failures back to the last persisted state and reports them without losing newer toggles', async () => {
    const state = new Map<string, boolean>(), failed = vi.fn();
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('quota'));
    const writer = new RelevanceWriter(id => state.get(id) ?? false, (id, value) => { state.set(id, value); }, send, failed);
    writer.set('001', true); await writer.flush(); writer.set('001', false); await writer.flush();
    expect(state.get('001')).toBe(true); expect(writer.overrides.size).toBe(0); expect(failed).toHaveBeenCalledTimes(1);
  });
  it('honors a newer persisted cross-tab mark and splits large gestures into bounded batches', async () => {
    const state = new Map<string, boolean>(); let finish!: () => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const writer = new RelevanceWriter(id => state.get(id) ?? false, (id, value) => { state.set(id, value); }, send, vi.fn());
    writer.set('001', true); const first = writer.flush(); await Promise.resolve();
    writer.observe('001', false); finish(); await first; expect(state.get('001')).toBe(false);
    for (let i = 0; i < 1001; i++) writer.set(String(2000 + i), true);
    await writer.flush(); expect(send.mock.calls.slice(1).map(([changes]) => changes.length)).toEqual([1000, 1]);
  });
});

describe('row marking gestures', () => {
  it('paints skipped rows once, paints unchecked on reverse drag, and excludes interactive controls', () => {
    document.body.innerHTML = '<table><tbody id="rows">' + ['001', '002', '003'].map(id => `<tr data-posting-id="${id}"><td><label><input type="checkbox" data-mark="${id}"></label></td><td class="text">Position</td><td><a href="#">Open</a><button>Save</button></td></tr>`).join('') + '</tbody></table>';
    const rows = document.getElementById('rows')!, state = new Map<string, boolean>(), set = vi.fn((id: string, value: boolean) => { state.set(id, value); });
    installRowMarking(rows, () => true, id => state.get(id) ?? false, set);
    const pointer = (target: Element, type: string, buttons = 1) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons }); Object.defineProperty(event, 'pointerId', { value: 1 }); Object.defineProperty(event, 'pointerType', { value: 'mouse' }); target.dispatchEvent(event);
    };
    const checks = rows.querySelectorAll('input');
    pointer(checks[0], 'pointerdown'); pointer(checks[2], 'pointermove'); pointer(checks[0], 'pointermove'); pointer(checks[0], 'pointerup', 0);
    expect([...state.values()]).toEqual([true, true, true]); expect(set).toHaveBeenCalledTimes(3);
    rows.querySelector('input')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    pointer(checks[2], 'pointerdown'); pointer(checks[0], 'pointermove'); pointer(checks[0], 'pointerup', 0);
    expect([...state.values()]).toEqual([false, false, false]);
    rows.querySelector('input')!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    const calls = set.mock.calls.length;
    rows.querySelector('button')!.click(); pointer(rows.querySelector('a')!, 'pointerdown');
    expect(set).toHaveBeenCalledTimes(calls);
    rows.querySelector<HTMLElement>('.text')!.click(); expect(state.get('001')).toBe(true);
    pointer(checks[0], 'pointerdown'); document.dispatchEvent(new Event('pointercancel')); pointer(checks[2], 'pointermove');
    expect(state.get('003')).toBe(false);
  });
});
