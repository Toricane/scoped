import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';
import { modelFiles, verifyModelFile } from './semantic-assets.mjs';

for (const browser of ['firefox', 'chrome']) {
  const root = new URL(`../dist/${browser}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage', 'downloads']);
  assert.deepEqual(manifest.host_permissions, ['https://scope.sciencecoop.ubc.ca/*']);
  assert.equal(manifest.content_security_policy.extension_pages, "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'; connect-src 'self'");
  for (const file of modelFiles) assert(verifyModelFile(file, await readFile(new URL(`models/minilm/${file.name}`, root))), `Pinned model file invalid: ${file.name}`);
  for (const file of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm', 'TRANSFORMERS-LICENSE.txt', 'ONNX-RUNTIME-LICENSE.txt', 'SCOPED-RUNTIME-CHANGES.txt']) assert((await stat(new URL(`runtime/${file}`, root))).size > 0);
  for (const file of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs']) assert(!(await readFile(new URL(`runtime/${file}`, root), 'utf8')).includes('Function("return this")'), 'Legacy eval fallback must be absent');
  assert((await readFile(new URL('runtime/transformers.min.js', root), 'utf8')).includes('import("./ort-wasm-simd-threaded.jsep.mjs")'), 'Factory import must be local/static');
  await stat(new URL('models/MODEL-LICENSE.txt', root));
  await stat(new URL('models/SOURCES.txt', root));
  assert(browser === 'firefox' ? manifest.background.scripts?.[0] === 'background.js' && !manifest.background.service_worker : manifest.background.service_worker === 'background.js' && !manifest.background.scripts);
  assert.equal(manifest.action.default_popup, 'popup.html');
  for (const name of ['background.js', 'content.js', 'popup.html', 'viewer.html', 'posting.html']) assert((await stat(new URL(name, root))).size > 0);
  const cities = JSON.parse(await readFile(new URL('maps/cities.json', root), 'utf8'));
  assert.equal(cities.version, 1); assert(cities.count > 10000);
  let placeCount = 0;
  for (const file of cities.files) {
    assert(/^cities-\d+\.json$/.test(file)); assert((await stat(new URL(`maps/${file}`, root))).size < 5 * 1024 * 1024);
    const chunk = JSON.parse(await readFile(new URL(`maps/${file}`, root), 'utf8')); placeCount += chunk.length;
    assert(chunk.every(city => city.length === 7 && Number.isFinite(city[5]) && Number.isFinite(city[6]) && Math.abs(city[5]) <= 180 && Math.abs(city[6]) <= 90));
  }
  assert.equal(placeCount, cities.count); await stat(new URL('maps/SOURCES.txt', root));
  for (const file of ['countries.json', 'countries-50m.json', 'countries-10m.json']) {
    assert((await stat(new URL(`maps/${file}`, root))).size < 5 * 1024 * 1024);
    const world = JSON.parse(await readFile(new URL(`maps/${file}`, root), 'utf8'));
    assert.equal(world.type, 'Topology'); assert(world.objects.countries);
  }
  for (const icons of [manifest.icons, manifest.action.default_icon]) {
    for (const [size, path] of Object.entries(icons)) {
      const bytes = await readFile(new URL(path, root));
      assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
      assert.equal(bytes.readUInt32BE(16), Number(size));
      assert.equal(bytes.readUInt32BE(20), Number(size));
    }
  }
  for (const name of ['background.js', 'content.js']) {
    const code = await readFile(new URL(name, root), 'utf8');
    assert(!/^import\s/m.test(code), `${name} must be self-contained`);
  }
  for (const page of ['popup', 'viewer', 'posting', 'backup']) {
    const html = await readFile(new URL(`${page}.html`, root), 'utf8');
    assert(/<link\b[^>]*rel="icon"[^>]*href="(?:\.\/)?icons\/scoped-32\.png"/.test(html) || /<link\b[^>]*rel="icon"[^>]*href="\/icons\/scoped-32\.png"/.test(html), `${page}: packaged tab icon is missing`);
    assert(!html.match(/<title>[^<]*—/), `${page}: interface tab title contains an em dash`);
    for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) await stat(new URL(match[1], root));
  }
  const assets = await readdir(new URL('assets/', root));
  assert(assets.some(name => /^semantic-worker-.*\.js$/.test(name)), 'Packaged inference worker is missing');
  assert(assets.some(name => name.endsWith('.css')));
  assert(assets.some(name => name.endsWith('.js')));
  console.log(`${browser}: manifest, bundled scripts, popup/viewer/opener, and icon dimensions validated.`);
}
