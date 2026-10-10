import assert from 'node:assert/strict';
import { readFile, stat, readdir } from 'node:fs/promises';

for (const browser of ['firefox', 'chrome']) {
  const root = new URL(`../dist/${browser}/`, import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage', 'downloads']);
  assert.deepEqual(manifest.host_permissions, ['https://scope.sciencecoop.ubc.ca/*']);
  assert(browser === 'firefox' ? manifest.background.scripts?.[0] === 'background.js' && !manifest.background.service_worker : manifest.background.service_worker === 'background.js' && !manifest.background.scripts);
  assert.equal(manifest.action.default_popup, 'popup.html');
  for (const name of ['background.js', 'content.js', 'popup.html', 'viewer.html', 'posting.html']) assert((await stat(new URL(name, root))).size > 0);
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
  for (const page of ['popup', 'viewer', 'posting']) {
    const html = await readFile(new URL(`${page}.html`, root), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) await stat(new URL(match[1], root));
  }
  const assets = await readdir(new URL('assets/', root));
  assert(assets.some(name => name.endsWith('.css')));
  assert(assets.some(name => name.endsWith('.js')));
  console.log(`${browser}: manifest, bundled scripts, popup/viewer/opener, and icon dimensions validated.`);
}
