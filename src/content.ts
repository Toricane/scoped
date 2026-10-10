import { api, request } from './api';
import { collect } from './collector';
import type { Command, Reply } from './types';

// Repeated toolbar clicks/injections must not install multiple collectors.
const context = globalThis as typeof globalThis & { scopedCollectorInstalled?: boolean };
if (!context.scopedCollectorInstalled) {
  context.scopedCollectorInstalled = true;
  let active: { runId: string; controller: AbortController } | undefined;
  api.runtime.onMessage.addListener((command: Command, _sender, sendResponse) => {
    if (command.type === 'collectorStatus') {
      sendResponse({ ok: true, value: active?.runId === command.runId } satisfies Reply<boolean>);
      return false;
    }
    if (command.type === 'abort') {
      if (active?.runId === command.runId) active.controller.abort();
      sendResponse({ ok: true, value: undefined } satisfies Reply);
      return false;
    }
    if (command.type !== 'collect') return false;
    if (active) {
      sendResponse({ ok: false, error: 'This SCOPE tab already has an active collector.' } satisfies Reply);
      return false;
    }
    const controller = new AbortController();
    active = { runId: command.runId, controller };
    sendResponse({ ok: true, value: undefined } satisfies Reply);
    void (async () => {
      try {
        if (location.href !== command.sourceUrl) throw new Error('The SCOPE page changed before collection started.');
        const snapshot = await collect({
          doc: document, sourceUrl: command.sourceUrl, signal: controller.signal,
          onProgress: progress => request({ type: 'progress', runId: command.runId, progress }),
        });
        await request({ type: 'complete', runId: command.runId, snapshot });
      } catch (error) {
        try {
          await request({ type: 'failed', runId: command.runId, canceled: controller.signal.aborted, message: error instanceof Error ? error.message : String(error) });
        } catch (reportError) { console.error('SCOPE exporter could not report collection failure:', reportError); }
      } finally { active = undefined; }
    })();
    return false;
  });
}
