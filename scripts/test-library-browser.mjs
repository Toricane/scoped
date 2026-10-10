import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('.'), extension = join(root, 'dist/chrome');
let executablePath;
for (const path of [process.env.SCOPED_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean)) {
  try { await access(path); executablePath = path; break; } catch {}
}
if (!executablePath) throw new Error('Set SCOPED_BROWSER to a Chromium executable.');
await mkdir(join(root, '.cache'), { recursive: true });
const profile = await mkdtemp(join(root, '.cache/library-browser-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, { executablePath, headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  await context.route(/^https?:/, route => route.abort());
  const background = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15000 });
  const workerUrl = new URL(background.url()), origin = `${workerUrl.protocol}//${workerUrl.host}`;
  const row = { id: '001', applicationStatus: '', term: '', jobTitle: 'Example Engineer 001B', organization: 'Example Labs', division: '', location: 'Vancouver, BC', applications: '', deadlineText: '', isNew: false, shortlisted: false };
  await background.evaluate(async row => chrome.storage.local.set({ snapshot: { schemaVersion: 1, collectedAt: '2026-10-10T00:00:00Z', sourceUrl: 'https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm', reportedTotal: 2, postings: [row, { ...row, id: '002' }] } }), row);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/viewer.html`);
  await page.locator('#count').filter({ hasText: '2 matching' }).waitFor();
  await page.locator('[data-row-actions="001"]').click(); await page.locator('[data-notes="001"]').click();
  await page.locator('#posting-notes').fill('<b>Private note</b>\nFollow up');
  await page.locator('#notes-save-posting').click();
  await page.locator('#notes-dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-save="001"]').getAttribute('aria-pressed'), 'true');
  const originalOrder = await page.locator('[data-save]').evaluateAll(buttons => buttons.map(button => button.dataset.save));
  const originalHeight = (await page.locator('#rows > tr').first().boundingBox()).height;
  await page.locator('#mark-mode').click();
  assert.equal(await page.locator('#headers th').first().textContent(), '');
  assert.equal((await page.locator('#rows > tr').first().boundingBox()).height, originalHeight);
  await page.screenshot({ path: join(root, '.cache/library-marking-desktop.png') });
  await page.locator('.relevance-settings > summary').click();
  await page.locator('#hideNotRelevant').check();
  await page.locator('[data-mark="001"]').click();
  await page.locator('.not-relevant-posting').waitFor();
  assert.match(await page.locator('#count').textContent(), /2 matching/);
  assert.deepEqual(await page.locator('[data-save]').evaluateAll(buttons => buttons.map(button => button.dataset.save)), originalOrder);
  await page.locator('#mark-mode').click();
  await page.locator('#count').filter({ hasText: '1 matching' }).waitFor();
  await page.reload(); await page.locator('#count').filter({ hasText: '1 matching' }).waitFor();
  await page.locator('.relevance-settings > summary').click();
  await page.locator('#hideNotRelevant').uncheck(); await page.locator('#count').filter({ hasText: '2 matching' }).waitFor();
  assert(await page.locator('#rows tr').last().evaluate(row => row.classList.contains('not-relevant-posting')));
  await page.goto(`${origin}/viewer.html?view=applied`);
  await page.locator('#add-custom').click();
  await page.locator('#custom-title').fill('External Engineer'); await page.locator('#custom-organization').fill('Example employer');
  await page.locator('#custom-notes').fill('Applied on company website');
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme }); await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    const bounds = await page.locator('#custom-dialog').boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= 390 && bounds.y >= 0 && bounds.y + bounds.height <= 844);
    await page.screenshot({ path: join(root, `.cache/library-form-${theme}.png`) });
  }
  await page.locator('#custom-submit').click(); await page.locator('#custom-dialog').waitFor({ state: 'hidden' });
  await page.locator('#count').filter({ hasText: '1 matching' }).waitFor();
  assert.equal(await page.locator('#rows a').count(), 0);
  await page.locator('[data-row-actions]').click(); await page.locator('[data-notes]').click();
  assert.equal(await page.locator('#custom-notes').inputValue(), 'Applied on company website');
  await page.locator('#custom-title').fill('Updated Engineer'); await page.locator('#custom-submit').click();
  await page.locator('#custom-dialog').waitFor({ state: 'hidden' });
  await page.reload(); await page.locator('#rows').filter({ hasText: 'Updated Engineer' }).waitFor();
  await page.locator('#mark-mode').click(); await page.locator('[data-mark]').click();
  await page.locator('.not-relevant-posting').waitFor();
  await page.locator('[data-row-actions]').click(); await page.locator('[data-details]').click();
  assert.equal(await page.locator('.posting-note').textContent(), 'Applied on company website');
  await page.locator('[data-details]').click(); await page.keyboard.press('Escape');
  await page.locator('#mark-mode').click();
  await page.screenshot({ path: join(root, '.cache/library-applied-narrow.png') });
  const backup = await page.evaluate(async () => {
    const stored = await chrome.storage.local.get(null);
    return { annotation: stored['annotation:001'], custom: Object.entries(stored).filter(([key]) => key.startsWith('customApplied:')) };
  });
  assert.equal(backup.annotation.notes, '<b>Private note</b>\nFollow up'); assert.equal(backup.annotation.notRelevant, true); assert.equal(backup.custom.length, 1);
  await background.evaluate(async row => chrome.storage.local.set({
    snapshot: { schemaVersion: 1, collectedAt: '2026-10-10T00:00:00Z', sourceUrl: 'https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm', reportedTotal: 60, postings: Array.from({ length: 60 }, (_, i) => ({ ...row, id: String(2000 + i) })) },
    'viewerPreferences:v1': { version: 1, pageSize: 25, hideNotRelevant: true },
  }), row);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${origin}/viewer.html`);
  await page.locator('#count').filter({ hasText: '60 matching' }).waitFor(); await page.locator('#next').click(); await page.locator('#mark-mode').click();
  await page.locator('.table-scroll').evaluate(scroller => { scroller.scrollTop = 260; });
  const beforeMark = await page.locator('.table-scroll').evaluate(scroller => ({ top: scroller.scrollTop, ids: [...scroller.querySelectorAll('[data-save]')].map(button => button.dataset.save), positions: [...scroller.querySelectorAll('#rows > tr')].map(row => row.getBoundingClientRect().top) }));
  const visibleId = await page.locator('.table-scroll').evaluate(scroller => {
    const bounds = scroller.getBoundingClientRect();
    return [...scroller.querySelectorAll('[data-mark]')].find(check => { const rect = check.getBoundingClientRect(); return rect.top > bounds.top + 50 && rect.bottom < bounds.bottom; }).dataset.mark;
  });
  await page.locator(`[data-mark="${visibleId}"]`).click(); await page.locator('.not-relevant-posting').waitFor();
  assert.equal(await page.locator('.table-scroll').evaluate(scroller => scroller.scrollTop), beforeMark.top);
  assert.deepEqual(await page.locator('#rows > tr').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().top)), beforeMark.positions);
  assert.deepEqual(await page.locator('[data-save]').evaluateAll(buttons => buttons.map(button => button.dataset.save)), beforeMark.ids);
  assert.equal(await page.locator('#page-label').textContent(), 'Page 2 of 3');
  assert.match(await page.locator('#count').textContent(), /60 matching/);
  await page.screenshot({ path: join(root, '.cache/library-marking-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const checkBounds = await page.locator('[data-mark]').first().boundingBox(), titleBounds = await page.locator('#rows td[data-column=jobTitle]').first().boundingBox();
  assert(checkBounds.x + checkBounds.width < titleBounds.x);
  await page.screenshot({ path: join(root, '.cache/library-marking-narrow.png') });
  await page.locator('#mark-mode').click(); await page.locator('#count').filter({ hasText: '59 matching' }).waitFor();
  assert.equal(await page.locator('.mark-column').count(), 0);
  await background.evaluate(async row => chrome.storage.local.set({
    snapshot: { schemaVersion: 1, collectedAt: '2026-10-10T00:00:00Z', sourceUrl: 'https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm', reportedTotal: 1000, postings: Array.from({ length: 1000 }, (_, i) => ({ ...row, id: String(3000 + i) })) },
    'viewerPreferences:v1': { version: 1, pageSize: 1000, hideNotRelevant: true },
  }), row);
  await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${origin}/viewer.html`);
  await page.locator('#count').filter({ hasText: /1,?000 matching/ }).waitFor(); await page.locator('#mark-mode').click();
  const timing = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#rows > tr')], checks = [...document.querySelectorAll('[data-mark]')];
    window.libraryMessages = [];
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = command => { window.libraryMessages.push(command.type); return original(command); };
    const start = performance.now();
    for (let i = 0; i < 20; i++) checks[i * 20].click();
    const ms = performance.now() - start;
    const after = [...document.querySelectorAll('#rows > tr')];
    return { ms, sameRows: rows.every((row, i) => row === after[i]), checked: checks.filter(check => check.checked).length };
  });
  assert.equal(timing.sameRows, true); assert.equal(timing.checked, 20);
  await page.waitForFunction(() => window.libraryMessages.includes('setRelevance'));
  await page.waitForFunction(async () => Boolean((await chrome.storage.local.get('annotation:3619'))['annotation:3619']?.notRelevant));
  assert.equal(await page.evaluate(() => window.libraryMessages.filter(type => type === 'getLibrary').length), 0);
  const first = page.locator('[data-mark]').nth(2), last = page.locator('[data-mark]').nth(6);
  const start = await first.boundingBox(), end = await last.boundingBox();
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 2 }); await page.mouse.up();
  for (let i = 2; i <= 6; i++) assert.equal(await page.locator('[data-mark]').nth(i).isChecked(), true);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2); await page.mouse.down();
  await page.mouse.move(end.x + end.width / 2, end.y + end.height / 2, { steps: 2 }); await page.mouse.up();
  for (let i = 2; i <= 6; i++) assert.equal(await page.locator('[data-mark]').nth(i).isChecked(), false);
  await page.locator('#rows > tr').nth(4).locator('[data-column="location"]').click();
  assert.equal(await page.locator('[data-mark]').nth(4).isChecked(), true);
  await page.locator('#rows > tr').nth(4).locator('[data-row-actions]').click();
  assert.equal(await page.locator('[data-mark]').nth(4).isChecked(), true); await page.keyboard.press('Escape');
  await page.locator('#mark-mode').click(); await page.locator('#count').filter({ hasText: '979 matching' }).waitFor();
  await page.waitForFunction(async () => {
    const records = await chrome.storage.local.get(['annotation:3995', 'annotation:3997', 'annotation:3993']);
    return records['annotation:3995']?.notRelevant === true && records['annotation:3997']?.notRelevant === false && records['annotation:3993']?.notRelevant === false;
  });
  await page.reload(); await page.locator('#count').filter({ hasText: '979 matching' }).waitFor();
  console.log(`1000-row marking: 20 synchronous toggles took ${timing.ms.toFixed(1)} ms; row nodes retained; no library reloads; mouse drag mark/unmark and row clicks passed.`);
  assert.deepEqual(errors, []);
  console.log('Synthetic Edge library check passed: notes/save, marking/hide/reload, custom create/edit/persistence, narrow light/dark forms.');
} finally {
  await context?.close();
  const expected = join(root, '.cache'); assert(profile.startsWith(expected + '\\') || profile.startsWith(expected + '/'));
  await rm(profile, { recursive: true, force: true });
}
