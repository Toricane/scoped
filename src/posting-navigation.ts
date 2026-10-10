import { SOURCE_URL } from './types';

/** Self-contained MAIN-world adapter for the overview's Search Posting panel. */
export function searchPostingById(id: string, timeoutMs = 15_000): Promise<boolean> {
  if (!/^\d+$/.test(id) || location.origin !== 'https://scope.sciencecoop.ubc.ca' || location.pathname !== '/myAccount/co-op/postings.htm') throw new Error('Sign in to SCOPE before opening postings.');
  const normalize = (value: string | null) => (value ?? '').replace(/\s+/g, ' ').trim();
  const visible = (element: HTMLElement) => {
    for (let current: HTMLElement | null = element; current; current = current.parentElement) {
      const style = getComputedStyle(current);
      if (current.hidden || current.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  const find = (): { input: HTMLInputElement; button: HTMLElement } | undefined => {
    const candidates = new Map<HTMLInputElement, HTMLElement>();
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input:not([type]), input[type="text"], input[type="search"], input[type="number"]')].filter(input => !input.disabled && !input.readOnly && visible(input));
    for (const input of inputs) {
      const labelled = /(?:job|posting)\s*id/i.test([input.getAttribute('aria-label'), input.placeholder, ...[...input.labels ?? []].map(label => label.textContent)].join(' '));
      for (let panel = input.parentElement; panel && panel !== document.body; panel = panel.parentElement) {
        if (!labelled && !/search\s*posting|(?:enter[^.]*?)?(?:job|posting)\s*id/i.test(normalize(panel.textContent))) continue;
        const panelInputs = inputs.filter(candidate => panel!.contains(candidate));
        if (panelInputs.length !== 1) continue;
        const buttons = [...panel.querySelectorAll<HTMLElement>('button, input[type="submit"], input[type="button"], a, [role="button"]')].filter(button => {
          if (!visible(button) || ('disabled' in button && button.disabled)) return false;
          return normalize(button instanceof HTMLInputElement ? button.value : button.textContent).toLowerCase() === 'search';
        });
        if (buttons.length === 1) { candidates.set(input, buttons[0]); break; }
      }
    }
    if (candidates.size > 1) throw new Error('SCOPE has multiple posting-ID search panels. Search the ID manually rather than choosing an ambiguous control.');
    const [candidate] = candidates;
    return candidate ? { input: candidate[0], button: candidate[1] } : undefined;
  };
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (error?: unknown) => { if (done) return; done = true; observer.disconnect(); clearTimeout(timer); if (error) reject(error); else resolve(true); };
    const attempt = () => {
      try {
        const target = find();
        if (!target) {
          if ([...document.querySelectorAll<HTMLInputElement>('input[type="password"]')].some(visible)) throw new Error('Your SCOPE session has expired. Sign in and retry.');
          return;
        }
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(target.input, id);
        target.input.dispatchEvent(new Event('input', { bubbles: true }));
        target.input.dispatchEvent(new Event('change', { bubbles: true }));
        // Return the injection result before Search can unload this document.
        setTimeout(() => target.button.click(), 50);
        finish();
      } catch (error) { finish(error); }
    };
    const observer = new MutationObserver(attempt);
    const timer = setTimeout(() => finish(new Error(`Could not find SCOPE's Search Posting input and Search button. Sign in, or search posting ID ${id} manually on the overview.`)), timeoutMs);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    attempt();
  });
}

export async function navigatePostingTab(api: typeof chrome, tabId: number, id: string): Promise<void> {
  if (!/^\d+$/.test(id)) throw new Error('Invalid posting ID.');
  await new Promise<void>((resolve, reject) => {
    let done = false;
    let navigationRequested = false;
    let completionObserved = false;
    let checking = false;
    let checkAgain = false;
    const finish = (error?: Error) => { if (done) return; done = true; clearTimeout(timer); api.tabs.onUpdated.removeListener(updated); api.tabs.onRemoved.removeListener(removed); if (error) reject(error); else resolve(); };
    const inspect = async () => {
      if (done || !navigationRequested) return;
      if (checking) { checkAgain = true; return; }
      checking = true;
      try {
        // Event payloads can still describe posting.html, or omit the URL.
        // Read current tab state only after tabs.update has acknowledged the request.
        const tab = await api.tabs.get(tabId);
        if (done || tab.pendingUrl || tab.status === 'loading' || (tab.status !== 'complete' && !completionObserved)) return;
        let url = tab.url;
        if (!url) {
          // Missing tab metadata is not evidence of an expired login. Inspect the
          // permitted document instead; no general tabs permission is necessary.
          try {
            const [probe] = await api.scripting.executeScript({ target: { tabId }, func: () => ({ url: location.href, ready: document.readyState }) });
            const documentState = probe?.result as { url?: string; ready?: string } | undefined;
            if (documentState?.ready !== 'complete') return;
            url = documentState.url;
          } catch {
            throw new Error('Could not inspect the posting tab. Allow Scoped access to SCOPE in the extension permissions, then retry.');
          }
        }
        if (!url || url.startsWith(api.runtime.getURL('')) || url === 'about:blank') return;
        if (new URL(url).origin === new URL(SOURCE_URL).origin) finish();
        else finish(new Error('SCOPE redirected to another site. Sign in to SCOPE, then retry opening the posting.'));
      } catch (error) { finish(error instanceof Error ? error : new Error(String(error))); }
      finally {
        checking = false;
        if (checkAgain) { checkAgain = false; void inspect(); }
      }
    };
    const updated = (updatedId: number, change: chrome.tabs.OnUpdatedInfo) => {
      if (updatedId === tabId && change.status === 'complete') {
        completionObserved = true;
        void inspect();
      }
    };
    const removed = (removedId: number) => { if (removedId === tabId) finish(new Error('The posting tab was closed.')); };
    const timer = setTimeout(() => finish(new Error('Timed out loading the new SCOPE tab. Check your session and retry.')), 30_000);
    api.tabs.onUpdated.addListener(updated); api.tabs.onRemoved.addListener(removed);
    void api.tabs.update(tabId, { url: SOURCE_URL }).then(() => {
      navigationRequested = true;
      // Also covers a cached page completing before the update promise resolves.
      void inspect();
    }, error => finish(error instanceof Error ? error : new Error(String(error))));
  });
  const [result] = await api.scripting.executeScript({ target: { tabId }, world: 'MAIN', func: searchPostingById, args: [id] });
  const failure = (result as { error?: { message?: string } | string } | undefined)?.error;
  if (failure) throw new Error(typeof failure === 'string' ? failure : failure.message || 'The posting-ID search script failed.');
  if (result?.result !== true) throw new Error('The posting tab did not confirm that the ID search started. Retry opening the position.');
}
