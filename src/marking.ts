/** Paint rows immediately; coalesce writes and keep newer edits safe from old replies. */
export class RelevanceWriter {
  readonly overrides = new Map<string, boolean>();
  private pending = new Map<string, { notRelevant: boolean; version: number }>();
  private versions = new Map<string, number>();
  private confirmed = new Map<string, boolean>();
  private observations = new Map<string, number>();
  private revision = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private read: (id: string) => boolean, private apply: (id: string, value: boolean) => void,
    private send: (changes: { id: string; notRelevant: boolean }[]) => Promise<unknown>, private failed: (error: unknown) => void) {}
  observe(id: string, value: boolean): void {
    this.observations.set(id, (this.observations.get(id) ?? 0) + 1);
    if (this.confirmed.has(id)) this.confirmed.set(id, value);
  }
  set(id: string, notRelevant: boolean): void {
    if (this.read(id) === notRelevant) return;
    if (!this.confirmed.has(id)) this.confirmed.set(id, this.read(id));
    const version = ++this.revision;
    this.versions.set(id, version); this.overrides.set(id, notRelevant);
    this.pending.set(id, { notRelevant, version }); this.apply(id, notRelevant);
    if (this.pending.size >= 1000) void this.flush();
    else this.timer ??= setTimeout(() => { void this.flush(); }, 40);
  }
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    const batch = [...this.pending]; this.pending.clear();
    if (!batch.length) return;
    const observed = new Map(batch.map(([id]) => [id, this.observations.get(id) ?? 0]));
    // Dispatch now, including during pagehide. Reconcile replies in dispatch order;
    // the background serializes the actual storage writes.
    let completion: Promise<{ ok: true } | { ok: false; error: unknown }>;
    try { completion = Promise.resolve(this.send(batch.map(([id, value]) => ({ id, notRelevant: value.notRelevant })))).then(() => ({ ok: true as const }), error => ({ ok: false as const, error })); }
    catch (error) { completion = Promise.resolve({ ok: false, error }); }
    const task = this.queue.then(async () => {
      const result = await completion;
      if (!result.ok) {
        for (const [id, value] of batch) if (this.versions.get(id) === value.version) {
          const confirmed = this.confirmed.get(id) ?? false;
          this.overrides.delete(id); this.versions.delete(id); this.confirmed.delete(id); this.apply(id, confirmed);
        }
        this.failed(result.error); return;
      }
      for (const [id, value] of batch) {
        if ((this.observations.get(id) ?? 0) === observed.get(id)) this.confirmed.set(id, value.notRelevant);
        if (this.versions.get(id) === value.version) {
          const persisted = this.confirmed.get(id) ?? value.notRelevant;
          this.overrides.delete(id); this.versions.delete(id); this.confirmed.delete(id);
          if (this.read(id) !== persisted) this.apply(id, persisted);
        }
      }
    });
    this.queue = task.catch(() => undefined); await task;
  }
}

/** Native keyboard/touch checkbox behavior remains; mouse/pen can paint a range. */
export function installRowMarking(rows: HTMLElement, enabled: () => boolean, read: (id: string) => boolean, set: (id: string, value: boolean) => void): void {
  const interactive = (target: Element) => Boolean(target.closest('a,button,summary,details,select,textarea,input:not([data-mark]),[contenteditable]'));
  const postingRow = (target: Element | null) => target?.closest<HTMLTableRowElement>('tr[data-posting-id]');
  let gesture: { pointer: number; value: boolean; ids: string[]; indices: Map<string, number>; last: number; visited: Set<string> } | undefined;
  let suppressClick = false;
  const finish = () => { gesture = undefined; rows.classList.remove('mark-dragging'); setTimeout(() => { suppressClick = false; }, 0); };
  rows.addEventListener('pointerdown', event => {
    if (!enabled() || event.button !== 0 || event.pointerType === 'touch' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !(event.target instanceof Element) || interactive(event.target)) return;
    const row = postingRow(event.target); if (!row) return;
    const id = row.dataset.postingId!, ids = [...rows.querySelectorAll<HTMLTableRowElement>('tr[data-posting-id]')].map(row => row.dataset.postingId!);
    const indices = new Map(ids.map((id, index) => [id, index]));
    event.preventDefault(); suppressClick = true;
    gesture = { pointer: event.pointerId, value: !read(id), ids, indices, last: indices.get(id)!, visited: new Set([id]) };
    rows.classList.add('mark-dragging'); row.querySelector<HTMLInputElement>('[data-mark]')?.focus({ preventScroll: true });
    set(id, gesture.value);
  });
  document.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    if (!enabled() || event.buttons === 0) { finish(); return; }
    const row = postingRow(document.elementFromPoint?.(event.clientX, event.clientY) ?? (event.target instanceof Element ? event.target : null));
    if (!row || !rows.contains(row)) return;
    const index = gesture.indices.get(row.dataset.postingId!); if (index === undefined) return;
    event.preventDefault();
    for (let i = Math.min(index, gesture.last); i <= Math.max(index, gesture.last); i++) {
      const id = gesture.ids[i]; if (gesture.visited.has(id)) continue;
      gesture.visited.add(id); set(id, gesture.value);
    }
    gesture.last = index;
  });
  document.addEventListener('pointerup', event => { if (gesture?.pointer === event.pointerId) finish(); });
  document.addEventListener('pointercancel', finish);
  window.addEventListener('blur', finish);
  rows.addEventListener('click', event => {
    if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; return; }
    if (!enabled() || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !(event.target instanceof Element) || event.target.closest('input,label') || interactive(event.target)) return;
    const row = postingRow(event.target); if (row) set(row.dataset.postingId!, !read(row.dataset.postingId!));
  }, true);
}
