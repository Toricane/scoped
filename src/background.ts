import { api } from './api';
import { saveSnapshot } from './download';
import { navigatePostingTab } from './posting-navigation';
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
  if (command.type === 'getSaved' || command.type === 'getLibrary' || command.type === 'setSaved' || command.type === 'setApplied') {
    if (!sender.url?.startsWith(api.runtime.getURL(''))) throw new Error('Manage saved postings from Scoped.');
    if (command.type === 'getSaved' || command.type === 'getLibrary') {
      const stored = await api.storage.local.get(null);
      return Object.fromEntries([
        ...[...readSaved(stored)].map(([id, record]) => [savedKey(id), record]),
        ...(command.type === 'getLibrary' ? [...readApplied(stored)].map(([id, record]) => [appliedKey(id), record]) : []),
        ...(command.type === 'getLibrary' ? [...readRemovedSaved(stored)].map(id => [removedSavedKey(id), stored[removedSavedKey(id)]]) : []),
      ]);
    }
    const markingApplied = command.type === 'setApplied';
    const enabled = markingApplied ? command.applied : command.saved;
    if (typeof command.id !== 'string' || !/^\d+$/.test(command.id) || typeof enabled !== 'boolean') throw new Error('Invalid saved posting request.');
    const key = markingApplied ? appliedKey(command.id) : savedKey(command.id);
    if (!enabled) {
      if (!markingApplied) await api.storage.local.set({ [removedSavedKey(command.id)]: { version: 1, id: command.id, removedAt: new Date().toISOString() } });
      await api.storage.local.remove(key); return;
    }
    const stored = await api.storage.local.get(['snapshot', savedKey(command.id), appliedKey(command.id)]);
    const priorSaved = readSaved(stored).get(command.id), priorApplied = readApplied(stored).get(command.id);
    const posting = (stored.snapshot as Snapshot | undefined)?.postings.find(row => row.id === command.id) ?? priorSaved?.posting ?? priorApplied?.posting;
    if (!posting) throw new Error('This posting is no longer available to save. Refresh the viewer.');
    await api.storage.local.set({ [key]: markingApplied
      ? { version: 1, appliedAt: priorApplied?.appliedAt ?? new Date().toISOString(), posting }
      : { version: 1, savedAt: priorSaved?.savedAt ?? new Date().toISOString(), posting } });
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
  const task = command.type === 'download' ? (async () => {
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
