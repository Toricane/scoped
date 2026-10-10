import { api } from './api';
import { annotationPrefix, customPrefix, isLocalId, isCustomId, readAnnotations, readCustom } from './local-library';
import { saveSnapshot, saveText } from './download';
import { backupLimit, createBackup, parseBackup, restoreBackup } from './backup';
import { navigatePostingTab } from './posting-navigation';
import { validateSnapshot } from './viewer-model';
import { readRemovedSaved, removedSavedKey, readApplied, appliedKey, readSaved, savedKey } from './saved';
import { commitSnapshot, isActive, readState, runKey } from './store';
import { isSourceUrl, type Command, type Reply, type Snapshot, type RunState } from './types';

// Serialize storage transitions, including start/cancel/completion and tab events.
// The authoritative run state is stored locally, surviving worker suspension.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.catch(() => undefined);
  return result;
}

async function failTab(tabId: number, message: string): Promise<void> {
  const { run } = await readState(api.storage.local, tabId);
  if (run && isActive(run)) await api.storage.local.set({ [runKey(tabId)]: { ...run, status: 'error', message } });
}

async function handle(command: Command, sender: chrome.runtime.MessageSender): Promise<unknown> {
  if (command.type === 'setRelevance' || command.type === 'setAnnotation' || command.type === 'setCustomApplied' || command.type === 'deleteCustomApplied') {
    if (sender.id !== api.runtime.id || sender.url !== api.runtime.getURL('viewer.html') && !sender.url?.startsWith(api.runtime.getURL('viewer.html') + '?')) throw new Error('Manage local entries from Scoped’s viewer.');
    if (command.type === 'setRelevance') {
      if (!Array.isArray(command.changes) || !command.changes.length || command.changes.length > 1000 || command.changes.some(change => !change || typeof change.id !== 'string' || !isLocalId(change.id) || typeof change.notRelevant !== 'boolean') || new Set(command.changes.map(change => change.id)).size !== command.changes.length) throw new Error('Invalid relevance marks.');
      const stored = await api.storage.local.get(null), annotations = readAnnotations(stored), custom = readCustom(stored);
      const known = new Set([...readSaved(stored).keys(), ...readApplied(stored).keys(), ...annotations.keys()]);
      try { validateSnapshot(stored.snapshot).postings.forEach(row => known.add(row.id)); } catch { /* Retained records remain available. */ }
      const updates: Record<string, unknown> = {};
      for (const change of command.changes) {
        if (!(isCustomId(change.id) ? custom.has(change.id) : known.has(change.id))) throw new Error('A posting is no longer available. Refresh the viewer.');
        updates[annotationPrefix + change.id] = { ...(annotations.get(change.id) ?? { version: 1, id: change.id, notes: '' }), notRelevant: change.notRelevant };
      }
      await api.storage.local.set(updates); return;
    }
    if (command.type === 'setCustomApplied') {
      const record = readCustom({ [customPrefix + command.record?.id]: command.record }).get(command.record?.id);
      if (!record) throw new Error('Enter a title and valid application date. Notes may contain up to 20,000 characters.');
      await api.storage.local.set({ [customPrefix + record.id]: record }); return record;
    }
    if (typeof command.id !== 'string' || !isLocalId(command.id)) throw new Error('Invalid local posting ID.');
    if (command.type === 'deleteCustomApplied') {
      if (!isCustomId(command.id)) throw new Error('Invalid custom entry.');
      await api.storage.local.remove([customPrefix + command.id, annotationPrefix + command.id]); return;
    }
    if (command.notes !== undefined && (typeof command.notes !== 'string' || command.notes.length > 20000) || command.notRelevant !== undefined && typeof command.notRelevant !== 'boolean' || command.notes === undefined && command.notRelevant === undefined) throw new Error('Invalid notes or relevance mark.');
    const stored = await api.storage.local.get(null);
    let current = false;
    try { current = validateSnapshot(stored.snapshot).postings.some(row => row.id === command.id); } catch { /* Retained local records can still be annotated without a valid collection. */ }
    const known = isCustomId(command.id) ? readCustom(stored).has(command.id) : current || readSaved(stored).has(command.id) || readApplied(stored).has(command.id) || readAnnotations(stored).has(command.id);
    if (!known) throw new Error('This posting is no longer available. Refresh the viewer.');
    const prior = readAnnotations(stored).get(command.id) ?? { version: 1, id: command.id, notes: '', notRelevant: false };
    const record = { ...prior, ...(command.notes !== undefined ? { notes: command.notes } : {}), ...(command.notRelevant !== undefined ? { notRelevant: command.notRelevant } : {}) };
    await api.storage.local.set({ [annotationPrefix + command.id]: record }); return record;
  }
  if (command.type === 'restoreBackup') {
    if (sender.id !== api.runtime.id || sender.url !== api.runtime.getURL('backup.html')) throw new Error('Restore backups from Scoped’s backup page.');
    if (typeof command.text !== 'string') throw new Error('Invalid backup request.');
    await restoreBackup(api.storage.local, parseBackup(command.text));
    return;
  }
  if (command.type === 'getSaved' || command.type === 'getLibrary' || command.type === 'setSaved' || command.type === 'setApplied' || command.type === 'undoSavedRemoval') {
    if (sender.id !== undefined && sender.id !== api.runtime.id || !sender.url?.startsWith(api.runtime.getURL(''))) throw new Error('Manage saved postings from Scoped.');
    if (command.type === 'getSaved' || command.type === 'getLibrary') {
      const stored = await api.storage.local.get(null);
      // Undo copies are temporary and cannot authorize posting navigation.
      for (const id of readRemovedSaved(stored)) {
        const record = stored[removedSavedKey(id)] as { version: number; id: string; removedAt: string; undo?: { expiresAt: number } };
        if (record.undo && (!Number.isFinite(record.undo.expiresAt) || Date.now() > record.undo.expiresAt)) {
          const clean = { version: record.version, id, removedAt: record.removedAt };
          await api.storage.local.set({ [removedSavedKey(id)]: clean }); stored[removedSavedKey(id)] = clean;
        }
      }
      return Object.fromEntries([
        ...(command.type === 'getLibrary' ? [...readAnnotations(stored)].map(([id, record]) => [annotationPrefix + id, record]) : []),
        ...(command.type === 'getLibrary' ? [...readCustom(stored)].map(([id, record]) => [customPrefix + id, record]) : []),
        ...[...readSaved(stored)].map(([id, record]) => [savedKey(id), record]),
        ...(command.type === 'getLibrary' ? [...readApplied(stored)].map(([id, record]) => [appliedKey(id), record]) : []),
        ...(command.type === 'getLibrary' ? [...readRemovedSaved(stored)].map(id => {
          const record = stored[removedSavedKey(id)] as { version: number; id: string; removedAt: string };
          return [removedSavedKey(id), { version: record.version, id, removedAt: record.removedAt }];
        }) : []),
      ]);
    }
    if (command.type === 'undoSavedRemoval') {
      if (typeof command.id !== 'string' || !/^\d+$/.test(command.id) || typeof command.token !== 'string') throw new Error('Invalid Saved undo request.');
      const stored = await api.storage.local.get(['snapshot', removedSavedKey(command.id)]);
      const removal = stored[removedSavedKey(command.id)] as { undo?: { token: string; expiresAt: number; record: unknown } } | undefined;
      const undo = removal?.undo;
      const record = readSaved({ [savedKey(command.id)]: undo?.record }).get(command.id);
      if (!readRemovedSaved(stored).has(command.id) || !undo || undo.token !== command.token || !Number.isFinite(undo.expiresAt) || Date.now() > undo.expiresAt || !record) throw new Error('This removal can no longer be undone. Use Save in All postings to restore it.');
      const current = (stored.snapshot as Snapshot | undefined)?.postings?.find(row => row.id === command.id);
      const refreshed = current && readSaved({ [savedKey(command.id)]: { ...record, posting: current } }).get(command.id);
      await api.storage.local.set({ [savedKey(command.id)]: refreshed ?? record });
      await api.storage.local.remove(removedSavedKey(command.id));
      return refreshed ?? record;
    }
    const markingApplied = command.type === 'setApplied';
    const enabled = markingApplied ? command.applied : command.saved;
    if (command.type === 'setSaved' && command.notes !== undefined && (typeof command.notes !== 'string' || command.notes.length > 20000 || !command.saved)) throw new Error('Invalid posting notes.');
    if (typeof command.id !== 'string' || !/^\d+$/.test(command.id) || typeof enabled !== 'boolean') throw new Error('Invalid saved posting request.');
    const key = markingApplied ? appliedKey(command.id) : savedKey(command.id);
    if (!enabled) {
      let token: string | undefined;
      if (!markingApplied) {
        const stored = await api.storage.local.get(['snapshot', savedKey(command.id), appliedKey(command.id)]);
        const prior = readSaved(stored).get(command.id);
        const posting = (stored.snapshot as Snapshot | undefined)?.postings?.find(row => row.id === command.id) ?? prior?.posting ?? readApplied(stored).get(command.id)?.posting;
        const record = readSaved({ [key]: { version: 1, savedAt: prior?.savedAt ?? new Date().toISOString(), posting } }).get(command.id);
        token = record ? crypto.randomUUID() : undefined;
        await api.storage.local.set({ [removedSavedKey(command.id)]: { version: 1, id: command.id, removedAt: new Date().toISOString(), ...(record ? { undo: { token, expiresAt: Date.now() + 5 * 60_000, record } } : {}) } });
      }
      await api.storage.local.remove(key); return { undoToken: token };
    }
    const stored = await api.storage.local.get(['snapshot', savedKey(command.id), appliedKey(command.id), annotationPrefix + command.id]);
    const priorSaved = readSaved(stored).get(command.id), priorApplied = readApplied(stored).get(command.id);
    const posting = (stored.snapshot as Snapshot | undefined)?.postings.find(row => row.id === command.id) ?? priorSaved?.posting ?? priorApplied?.posting;
    if (!posting) throw new Error('This posting is no longer available to save. Refresh the viewer.');
    await api.storage.local.set({ [key]: markingApplied
      ? { version: 1, appliedAt: priorApplied?.appliedAt ?? new Date().toISOString(), posting }
      : { version: 1, savedAt: priorSaved?.savedAt ?? new Date().toISOString(), posting },
      ...(command.type === 'setSaved' && command.notes !== undefined ? { [annotationPrefix + command.id]: { version: 1, id: command.id, notRelevant: readAnnotations(stored).get(command.id)?.notRelevant ?? false, notes: command.notes } } : {}) });
    if (!markingApplied) await api.storage.local.remove(removedSavedKey(command.id));
    return;
  }
  if (command.type === 'openPosting') {
    if (!Number.isInteger(command.tabId) || !sender.url?.startsWith(api.runtime.getURL('posting.html')) || (sender.tab?.id !== undefined && sender.tab.id !== command.tabId)) throw new Error('Open postings from the Scoped viewer.');
    const tabId = command.tabId;
    const opener = await api.tabs.get(tabId);
    if (opener.url !== sender.url) throw new Error('The posting tab changed. Reopen it from the viewer.');
    let navigated = false;
    try {
      const { snapshot } = await readState(api.storage.local, -1);
      const records = await api.storage.local.get([savedKey(command.id), appliedKey(command.id)]);
      const retained = readSaved(records).has(command.id) || readApplied(records).has(command.id);
      if (!/^\d+$/.test(command.id) || (!snapshot?.postings.some(row => row.id === command.id) && !retained)) throw new Error('This posting is no longer in the saved collection. Reopen it from the viewer.');
      navigated = true;
      await navigatePostingTab(api, tabId, command.id);
      return;
    } catch (error) {
      if (navigated) {
        try { await api.tabs.update(tabId, { url: api.runtime.getURL(`posting.html?id=${encodeURIComponent(command.id)}&error=${encodeURIComponent(errorText(error))}`) }); } catch { /* User may have closed the tab. */ }
      }
      throw error;
    }
  }
  if (command.type === 'getState') return readState(api.storage.local, command.tabId);
  if (command.type === 'start') {
    if (sender.tab?.url && !sender.tab.url.startsWith(api.runtime.getURL(''))) throw new Error('Start collection from the extension popup.');
    const tab = await api.tabs.get(command.tabId);
    if (!isSourceUrl(tab.url)) throw new Error('Open SCOPE search results and click the extension button in that tab.');
    const { run: previous } = await readState(api.storage.local, command.tabId);
    if (previous && isActive(previous)) {
      let alive = false;
      try {
        const reply = await api.tabs.sendMessage(command.tabId, { type: 'collectorStatus', runId: previous.runId } satisfies Command) as Reply<boolean>;
        alive = reply?.ok && reply.value === true;
      } catch { /* A reload/browser restart can leave a stored run with no collector. */ }
      if (alive) throw new Error('A collection is already running in this SCOPE tab.');
      await failTab(command.tabId, 'The previous collector is no longer available. Starting a fresh collection.');
    }
    const run: RunState = {
      runId: crypto.randomUUID(), tabId: command.tabId, sourceUrl: tab.url!, status: 'running',
      startedAt: new Date().toISOString(), message: 'Collecting. You can close this popup.',
      currentPage: 0, collected: 0, total: 0,
    };
    await api.storage.local.set({ [runKey(command.tabId)]: run });
    try {
      await api.scripting.executeScript({ target: { tabId: command.tabId }, files: ['content.js'] });
      const reply = await api.tabs.sendMessage(command.tabId, { type: 'collect', runId: run.runId, sourceUrl: run.sourceUrl } satisfies Command) as Reply;
      if (!reply?.ok) throw new Error(reply && !reply.ok ? reply.error : 'The SCOPE tab did not respond.');
    } catch (error) {
      await failTab(command.tabId, `Could not start collection: ${errorText(error)} Click the extension button again from SCOPE to grant tab access.`);
      throw error;
    }
    return run;
  }
  if (command.type === 'cancel') {
    const { run } = await readState(api.storage.local, command.tabId);
    if (!run || !isActive(run)) return;
    await api.storage.local.set({ [runKey(command.tabId)]: { ...run, status: 'canceling', message: 'Canceling collection…' } });
    try {
      const reply = await api.tabs.sendMessage(command.tabId, { type: 'abort', runId: run.runId } satisfies Command) as Reply;
      if (!reply?.ok) throw new Error('Collector is unavailable.');
    } catch {
      await api.storage.local.set({ [runKey(command.tabId)]: { ...run, status: 'canceled', message: 'Collection canceled. Previous snapshot kept.' } });
    }
    return;
  }
  if (command.type === 'progress' || command.type === 'complete' || command.type === 'failed') {
    const tabId = sender.tab?.id;
    if (tabId === undefined || !isSourceUrl(sender.tab?.url)) throw new Error('Collector updates must come from the SCOPE source tab.');
    const { run } = await readState(api.storage.local, tabId);
    if (!run || run.runId !== command.runId || !isActive(run)) throw new Error('This collection is no longer active.');
    if (command.type === 'progress') {
      if (run.status === 'canceling') throw new Error('Collection canceled.');
      await api.storage.local.set({ [runKey(tabId)]: { ...run, ...command.progress } });
    } else if (command.type === 'complete') {
      if (run.status === 'canceling') {
        await api.storage.local.set({ [runKey(tabId)]: { ...run, status: 'canceled', message: 'Collection canceled. Previous snapshot kept.' } });
      } else await commitSnapshot(api.storage.local, run, command.snapshot);
    } else {
      const canceled = command.canceled || run.status === 'canceling';
      await api.storage.local.set({ [runKey(tabId)]: { ...run, status: canceled ? 'canceled' : 'error', message: canceled ? 'Collection canceled. Previous snapshot kept.' : command.message } });
    }
    return;
  }
  throw new Error('Unknown extension command.');
}

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

api.runtime.onMessage.addListener((command: Command, sender, sendResponse) => {
  // Content scripts handle these messages; the background only handles commands above.
  if (command.type === 'collect' || command.type === 'abort' || command.type === 'collectorStatus') return false;
  // Save dialogs can outlive the popup. Do not block collector/storage updates
  // in the serialized run queue while the user chooses a download location.
  const task = command.type === 'downloadBackup' ? (async () => {
    if (sender.id !== api.runtime.id || sender.url !== api.runtime.getURL('backup.html')) throw new Error('Download backups from Scoped’s backup page.');
    const backup = await serial(async () => createBackup(await api.storage.local.get(null)));
    const text = JSON.stringify(backup, null, 2) + '\n';
    if (new TextEncoder().encode(text).byteLength > backupLimit) throw new Error('Backup exceeds the 25 MB restore limit.');
    return saveText(api.downloads, text, `scoped-backup-${backup.exportedAt.replace(/[:.]/g, '-')}.json`);
  })() : command.type === 'download' ? (async () => {
    if (!sender.url?.startsWith(api.runtime.getURL(''))) throw new Error('Download from the extension popup.');
    const { snapshot } = await readState(api.storage.local, -1);
    if (!snapshot) throw new Error('Collect postings before downloading a snapshot.');
    return saveSnapshot(api.downloads, snapshot, command.format);
  })() : command.type === 'openPosting' ? handle(command, sender) : serial(() => handle(command, sender));
  void task.then(
    value => sendResponse({ ok: true, value } satisfies Reply),
    error => sendResponse({ ok: false, error: errorText(error) } satisfies Reply),
  );
  return true;
});

api.tabs.onRemoved.addListener(tabId => { void serial(() => failTab(tabId, 'The SCOPE source tab was closed. Previous snapshot kept.')).catch(console.error); });
api.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === 'loading' || (change.url !== undefined && !isSourceUrl(change.url))) {
    void serial(() => failTab(tabId, 'The SCOPE source tab navigated or reloaded. Check your session and start again. Previous snapshot kept.')).catch(console.error);
  }
});

async function endInterruptedRuns(): Promise<void> {
  const stored = await api.storage.local.get(null);
  const changes: Record<string, RunState> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (key.startsWith('run:') && isActive(value as RunState)) {
      changes[key] = { ...(value as RunState), status: 'error', message: 'The browser or extension restarted. Previous snapshot kept; start a fresh collection.' };
    }
  }
  if (Object.keys(changes).length) await api.storage.local.set(changes);
}
api.runtime.onStartup.addListener(() => { void serial(endInterruptedRuns).catch(console.error); });
api.runtime.onInstalled.addListener(() => { void serial(endInterruptedRuns).catch(console.error); });
