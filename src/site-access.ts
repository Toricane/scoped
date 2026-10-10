import { api } from './api';

export const SCOPE_ACCESS = { origins: ['https://scope.sciencecoop.ubc.ca/*'] };
export const hasScopeAccess = (): Promise<boolean> => api.permissions.contains(SCOPE_ACCESS);

export function mountSiteAccess(container: HTMLElement, onGranted?: () => Promise<void>): void {
  container.innerHTML = `<h2>SCOPE site access</h2>
    <p class="muted">Allow access to SCOPE so positions can open in a new tab.</p>
    <button id="allow-access" class="secondary">Allow SCOPE access</button>
    <p id="access-status" role="status" aria-live="polite"></p>
    <details id="access-help"><summary>Firefox / Chrome setup instructions</summary>
      <p><strong>Firefox / Zen</strong>: Open a SCOPE tab, right-click the Scoped toolbar icon, and select <strong>Always Allow on scope.sciencecoop.ubc.ca</strong>.</p>
      <p><strong>Chrome</strong>: Open a SCOPE tab, right-click the Scoped icon, choose <strong>This can read and change site data</strong>, then <strong>On scope.sciencecoop.ubc.ca</strong>. Alternatively, open Manage extensions → Scoped → Details → Site access, select <strong>On specific sites</strong>, and add <code>https://scope.sciencecoop.ubc.ca</code>.</p>
      <p>Return here and try again after changing access. “Only When Clicked” grants access to the current tab; opening a position needs access in its new tab too.</p>
    </details>`;
  const button = container.querySelector<HTMLButtonElement>('#allow-access')!;
  const status = container.querySelector<HTMLElement>('#access-status')!;
  const help = container.querySelector<HTMLDetailsElement>('#access-help')!;
  let revision = 0;
  void hasScopeAccess().then(granted => {
    if (revision !== 0) return;
    status.textContent = granted ? 'SCOPE access is enabled.' : 'SCOPE access is needed to open positions.';
    help.open = !granted || help.open;
  }).catch(() => {
    if (revision !== 0) return;
    status.textContent = 'Check SCOPE access using the instructions below.'; help.open = true;
  });
  button.addEventListener('click', async () => {
    revision++;
    button.disabled = true;
    try {
      // Invoke directly in the click handler: awaiting first loses Firefox's user gesture.
      const granted = await api.permissions.request(SCOPE_ACCESS);
      status.textContent = granted ? 'SCOPE access is enabled.' : 'Access was not granted. Use the browser setup instructions below, then try again.';
      help.open = !granted;
      if (granted) await onGranted?.();
    } catch {
      status.textContent = 'The browser could not enable access here. Follow the setup instructions below, then try again.';
      help.open = true;
    } finally { button.disabled = false; }
  });
}
