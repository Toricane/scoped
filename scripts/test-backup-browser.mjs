import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';

// Synthetic state in a disposable profile; never touches the user's installed add-on.
const root = resolve('.'), extension = join(root, 'dist/chrome');
let executablePath;
for (const path of [process.env.SCOPED_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean)) {
  try { await access(path); executablePath = path; break; } catch {}
}
if (!executablePath) throw new Error('Set SCOPED_BROWSER to a Chromium executable.');
await mkdir(join(root, '.cache'), { recursive: true });
const profile = await mkdtemp(join(root, '.cache/backup-browser-'));
let context;
const launch = async () => {
  context = await chromium.launchPersistentContext(profile, { executablePath, headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  await context.route(/^https?:/, route => route.abort());
  return context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15000 });
};
try {
  let background = await launch();
  const workerUrl = new URL(background.url()), origin = `${workerUrl.protocol}//${workerUrl.host}`;
  const row = { id: '001', applicationStatus: '', term: '', jobTitle: 'Example Engineer 001B', organization: 'Example Labs', division: '', location: 'Vancouver, BC', applications: '', deadlineText: '', isNew: false, shortlisted: true };
  const timestamp = '2026-10-10T00:00:00Z';
  const data = { snapshot: { schemaVersion: 1, collectedAt: timestamp, sourceUrl: 'https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm', reportedTotal: 1, postings: [row] }, 'saved:001': { version: 1, savedAt: timestamp, posting: row }, 'applied:002': { version: 1, appliedAt: timestamp, posting: { ...row, id: '002' } }, 'savedRemoved:003': { version: 1, id: '003', removedAt: timestamp }, 'viewerPreferences:saved:v1': { version: 1, query: 'example', scope: 'organization' } };
  const backup = JSON.stringify({ format: 'scoped-backup', version: 1, exportedAt: timestamp, data });
  await background.evaluate(async row => { await chrome.storage.local.set({ 'savedRemoved:001': { version: 1, id: '001', removedAt: '2026-10-10T00:00:00Z' }, 'saved:999': { version: 1, savedAt: '2026-10-10T00:00:00Z', posting: { ...row, id: '999' } } }); }, row);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/backup.html`);
  await page.locator('#backup-file').setInputFiles({ name: 'collection.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data.snapshot)) });
  await page.locator('#error').filter({ hasText: 'full backup' }).waitFor();
  await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.locator('#restore-review').waitFor();
  assert.match(await page.locator('#backup-summary').textContent(), /1 collection postings.*1 local Saved.*1 Applied.*1 Saved removals/);
  assert.equal((await background.evaluate(() => chrome.storage.local.get('snapshot'))).snapshot, undefined, 'File selection must not restore before confirmation');
  await page.locator('#cancel-restore').click();
  assert.equal(await page.locator('#restore-review').isVisible(), false);
  await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
  await page.locator('#restore-review').waitFor();
  await page.screenshot({ path: join(root, '.cache/backup-review-desktop.png') });
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme }); await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Backup page must not overflow narrow viewport');
    await page.screenshot({ path: join(root, `.cache/backup-review-${theme}-narrow.png`) });
  }
  await background.evaluate(() => chrome.storage.local.set({ 'run:7': { status: 'running' } }));
  await page.locator('#confirm-restore').click();
  await page.locator('#error').filter({ hasText: 'Finish or cancel' }).waitFor();
  await background.evaluate(() => chrome.storage.local.remove('run:7'));
  await page.locator('#confirm-restore').click();
  await page.locator('#backup-status').filter({ hasText: 'Backup restored' }).waitFor();
  const restored = await background.evaluate(() => chrome.storage.local.get(null));
  assert.deepEqual(restored.snapshot, data.snapshot); assert.equal(restored['savedRemoved:001'], null);
  assert.equal(restored['saved:999'].posting.id, '999'); assert.deepEqual(restored['applied:002'], data['applied:002']);
  await page.goto(`${origin}/viewer.html?view=saved`);
  await page.locator('#count').filter({ hasText: '2 matching' }).waitFor();
  assert.equal(await page.locator('#query').inputValue(), 'example');
  assert.deepEqual(errors, []);
  await context.close(); context = undefined;
  background = await launch();
  const afterRestart = await background.evaluate(() => chrome.storage.local.get(null));
  assert.deepEqual(afterRestart.snapshot, data.snapshot); assert.deepEqual(afterRestart['applied:002'], data['applied:002']);
  console.log('Isolated Edge backup check passed: validation/review/cancel, collection guard, retained records/preferences, narrow light/dark layout and profile restart persistence. This is synthetic evidence, not Firefox migration acceptance.');
} finally {
  await context?.close();
  const expected = join(root, '.cache');
  assert(profile.startsWith(expected + '\\') || profile.startsWith(expected + '/'));
  await rm(profile, { recursive: true, force: true });
}
