import { toCsv, toJson } from './export';
import type { Snapshot } from './types';

export function downloadOptions(snapshot: Snapshot, format: 'csv' | 'json'): chrome.downloads.DownloadOptions {
  const text = format === 'csv' ? toCsv(snapshot) : toJson(snapshot);
  const mime = format === 'csv' ? 'text/csv' : 'application/json';
  // Chrome workers cannot create object URLs. A self-contained data URL needs
  // no popup document to stay alive. Firefox uses a background-owned blob below.
  return {
    url: `data:${mime};charset=utf-8,${encodeURIComponent(text)}`,
    filename: `scope-postings-${snapshot.collectedAt.replace(/[:.]/g, '-')}.${format}`,
    saveAs: true,
  };
}

export async function saveSnapshot(downloads: Pick<typeof chrome.downloads, 'download' | 'search' | 'onChanged'>, snapshot: Snapshot, format: 'csv' | 'json'): Promise<number> {
  const options = downloadOptions(snapshot, format);
  const text = format === 'csv' ? toCsv(snapshot) : toJson(snapshot);
  return saveText(downloads, text, options.filename!, format === 'csv' ? 'text/csv' : 'application/json');
}

export async function saveText(downloads: Pick<typeof chrome.downloads, 'download' | 'search' | 'onChanged'>, text: string, filename: string, mime = 'application/json'): Promise<number> {
  const options = { url: `data:${mime};charset=utf-8,${encodeURIComponent(text)}`, filename, saveAs: true };
  // Firefox rejects data URLs in downloads.download (Mozilla bug 1318564), but
  // its event-page background supports blobs. Never create a blob in the popup.
  if (typeof URL.createObjectURL !== 'function') return downloads.download(options);
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  let release: ((delta: chrome.downloads.DownloadDelta) => void) | undefined;
  try {
    const id = await downloads.download({ ...options, url });
    release = delta => {
      if (delta.id === id && (delta.state?.current === 'complete' || delta.state?.current === 'interrupted')) {
        URL.revokeObjectURL(url);
        downloads.onChanged.removeListener(release!);
      }
    };
    downloads.onChanged.addListener(release);
    const [item] = await downloads.search({ id });
    if (!item || item.state !== 'in_progress') {
      URL.revokeObjectURL(url);
      downloads.onChanged.removeListener(release);
    }
    return id;
  } catch (error) {
    URL.revokeObjectURL(url);
    if (release) downloads.onChanged.removeListener(release);
    throw error;
  }
}
