import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright-core';

// Isolated profile + synthetic data only. Never opens SCOPE or reads the user's browser.
const root = resolve('.'), extension = join(root, 'dist/chrome');
const candidates = [process.env.SCOPED_BROWSER, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
let executablePath;
for (const path of candidates) { try { await access(path); executablePath = path; break; } catch {} }
if (!executablePath) throw new Error('Set SCOPED_BROWSER to a Chromium executable for this optional browser check.');
await mkdir(join(root, '.cache'), { recursive: true });
const profile = await mkdtemp(join(root, '.cache/semantic-browser-'));
let context;
try {
  context = await chromium.launchPersistentContext(profile, { executablePath, headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const external = [];
  context.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()); });
  await context.route(/^https?:/, route => route.abort());
  const background = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15000 });
  const workerUrl = new URL(background.url()), origin = `${workerUrl.protocol}//${workerUrl.host}`;
  const row = (id, jobTitle, location, organization = 'Example Labs') => ({ id, jobTitle: `${jobTitle} ${id}B`, organization, division: '', location, deadlineText: 'Oct 16, 2099 09:00 AM', applicationStatus: '', applications: 0, term: 'Winter', isNew: false, shortlisted: false });
  const postings = [row('1001', 'Backend Software Engineer', 'Vancouver, BC'), row('1002', 'Graphic Design Intern', 'Vancouver, BC'), row('1003', 'Server Infrastructure Developer', 'Montréal, QC'), row('1004', 'Laboratory Research Assistant', 'Vancouver, BC')];
  await background.evaluate(async postings => { await chrome.storage.local.set({ snapshot: { schemaVersion: 1, sourceUrl: 'https://scope.sciencecoop.ubc.ca/myAccount/co-op/postings.htm', collectedAt: '2026-10-10T00:00:00Z', reportedTotal: postings.length, postings } }); }, postings);
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/viewer.html`);
  assert.equal(await page.title(), 'Scoped: postings');
  // Extension resources can be fetched directly by the document, independently of HTTP tooling.
  const icon = await page.evaluate(async () => { const response = await fetch(document.querySelector('link[rel="icon"]').href); return { ok: response.ok, bytes: (await response.arrayBuffer()).byteLength }; });
  assert(icon.ok && icon.bytes > 0, 'Browser-tab icon must resolve inside the extension');
  await page.locator('#count').filter({ hasText: '4 matching' }).waitFor();
  await page.locator('.search-options summary').click();
  await page.locator('#scope').selectOption('location');
  await page.locator('#query').fill('Montreal');
  await page.locator('#count').filter({ hasText: '1 matching' }).waitFor();
  await page.locator('.search-options summary').click();
  await page.locator('.company-search').click();
  await page.locator('#count').filter({ hasText: '4 matching' }).waitFor();
  await page.locator('#search-back').click();
  await page.locator('#count').filter({ hasText: '1 matching' }).waitFor();
  assert.equal(await page.locator('#query').inputValue(), 'Montreal');
  assert.equal(await page.locator('#scope').inputValue(), 'location');
  assert.equal(await page.getByText('Updated collection loaded. Your filters are preserved.').count(), 0);
  await page.screenshot({ path: join(root, '.cache/field-company-search-desktop.png') });
  await page.locator('#reset').click();
  await page.locator('#query').fill('server development');
  await page.locator('#searchMode').selectOption('semantic');
  const waitForSemantic = () => page.waitForFunction(() => document.getElementById('query').getAttribute('aria-busy') === 'false' && Boolean(document.querySelector('.relevance-row')), undefined, { timeout: 120000 });
  const started = Date.now();
  await waitForSemantic();
  assert.equal(await page.locator('#search-feedback').isVisible(), false, 'Normal completed semantic search should have no helper message');
  const coldMs = Date.now() - started;
  assert.equal(await page.locator('#semantic-retry').isVisible(), false);
  const ids = await page.locator('#rows [data-save]').evaluateAll(elements => elements.map(element => element.dataset.save));
  const debugScores = async queryText => page.evaluate(async ({ postings, queryText }) => {
    const db = await new Promise(resolve => { const request = indexedDB.open('scoped-semantic-v1'); request.onsuccess = () => resolve(request.result); });
    const read = async text => {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      const key = 'minilm-l6-v2:751bff3:q8:mean:384:text-v1:' + Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
      return new Promise(resolve => { const request = db.transaction('vectors').objectStore('vectors').get(key); request.onsuccess = () => resolve(request.result); });
    };
    const query = await read(queryText), result = [];
    for (const posting of postings) {
      const title = posting.jobTitle.replace(new RegExp(`\\s+${posting.id}[A-Za-z]*$`), '').trim();
      const vector = await read(`Position: ${title}\nOrganization: ${posting.organization}\nDivision: ${posting.division}\nLocation: ${posting.location}`);
      result.push({ id: posting.id, cosine: vector && query ? vector.reduce((sum, value, i) => sum + value * query[i], 0) : null });
    }
    db.close(); return result;
  }, { postings, queryText });
  const similarities = await debugScores('server development');
  console.log(JSON.stringify({ ids, similarities }));
  assert(ids.includes('1001'), 'Related backend title was not recalled');
  assert(['1001', '1003'].includes(ids[0]), 'Relevant software role should rank first');
  assert(ids.includes('1004'), 'Lower similarity research row should now be visible');
  assert.equal(await page.locator('.relevance-score').count(), ids.length);
  const shownScores = await page.locator('.relevance-score').allTextContents();
  assert(shownScores.every(label => /^Relevance -?\d+\.\d{3}$/.test(label)), 'Rows must display their ranking scores');
  const verifyBars = async () => {
    const bars = await page.locator('.relevance-row').evaluateAll(rows => rows.map(row => {
      const bar = getComputedStyle(row, '::after'), score = Number(row.querySelector('.relevance-score').textContent.split(' ')[1]);
      const label = row.querySelector('.relevance-score').getBoundingClientRect();
      return { width: parseFloat(bar.width), rowWidth: row.getBoundingClientRect().width, score, height: parseFloat(bar.height), labelWidth: label.width };
    }));
    assert(bars.length > 0);
    for (const bar of bars) {
      assert(Math.abs(bar.width / bar.rowWidth - bar.score) < 0.002, 'Green bar must span score × full row width');
      assert.equal(bar.height, 2); assert(bar.labelWidth <= 1, 'Numeric score must be visually hidden');
    }
  };
  await verifyBars();
  await page.screenshot({ path: join(root, '.cache/semantic-relevance-bars-desktop.png') });
  await page.emulateMedia({ colorScheme: 'dark' });
  await verifyBars();
  await page.screenshot({ path: join(root, '.cache/semantic-relevance-bars-dark.png') });
  await page.emulateMedia({ colorScheme: 'light' });
  // Exact filters remain active even when the query contains no location words.
  await page.locator('input[value="Vancouver, BC"]').check();
  assert.equal(await page.locator('#rows [data-save="1003"]').count(), 0);
  // Warm-cache reload remains completely offline.
  await page.reload();
  await waitForSemantic();
  const warmStart = Date.now();
  await page.locator('#query').fill('backend engineer');
  await waitForSemantic();
  const warmMs = Date.now() - warmStart;
  console.log(JSON.stringify({ backendQuery: await debugScores('backend engineer') }));
  assert.equal(await page.locator('#rows [data-save="1002"]').count(), 1, 'Weaker designer overlap should remain visible with its lower score');
  assert.equal((await page.locator('#rows [data-save]').first().getAttribute('data-save')), '1001', 'Backend role still ranks above weaker matches');
  await page.setViewportSize({ width: 390, height: 844 });
  await verifyBars();
  await page.screenshot({ path: join(root, '.cache/semantic-search-mobile.png') });
  const layout = await page.evaluate(() => ({ width: innerWidth, documentWidth: document.documentElement.scrollWidth }));
  assert.equal(layout.documentWidth, layout.width);
  assert.deepEqual(external, [], 'Installed extension attempted external network access');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browser: executablePath, coldMs, warmMs, recalledIds: ids, externalRequests: external.length, narrowLayout: layout }, null, 2));
} finally {
  await context?.close();
  const absolute = resolve(profile);
  assert(absolute.startsWith(join(root, '.cache') + '/') || absolute.startsWith(join(root, '.cache') + '\\'));
  assert(absolute.split(/[\\/]/).at(-1).startsWith('semantic-browser-'));
  await rm(absolute, { recursive: true, force: true });
}
