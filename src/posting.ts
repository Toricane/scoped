import { request } from './api';
import './popup.css';
import { api } from './api';
import { hasScopeAccess, mountSiteAccess } from './site-access';

const message = document.getElementById('message')!;
const retry = document.getElementById('retry') as HTMLButtonElement;
const params = new URL(location.href).searchParams;
const access = document.getElementById('site-access')!;
mountSiteAccess(access, open);
async function open(): Promise<void> {
  retry.hidden = true;
  const id = params.get('id') ?? '';
  try {
    if (!/^\d+$/.test(id)) throw new Error('Invalid posting ID. Open a posting from the viewer.');
    if (!await hasScopeAccess()) {
      message.textContent = 'Allow Scoped access to SCOPE below, then this position can open in a new tab.';
      retry.hidden = false;
      return;
    }
    message.textContent = 'Opening SCOPE and searching this posting ID…';
    const tab = await api.tabs.getCurrent();
    if (tab?.id === undefined) throw new Error('Could not identify this posting tab. Reopen it from the viewer.');
    await request({ type: 'openPosting', id, tabId: tab.id });
  } catch (error) {
    message.textContent = error instanceof Error ? error.message : String(error);
    retry.hidden = false;
    if (/access|permission|inspect/i.test(message.textContent)) access.querySelector('details')!.open = true;
  }
}
retry.addEventListener('click', () => void open());
if (params.has('error')) { message.textContent = params.get('error'); retry.hidden = false; }
else void open();

