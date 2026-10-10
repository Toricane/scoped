import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { zipSync, unzipSync } from 'fflate';

const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const output = join(root, 'release', pkg.version);
await mkdir(output, { recursive: true });
const checksums = [];
async function archive(name, files) {
  const bytes = zipSync(files, { level: 6 });
  // Verify the generated archive before delivering it.
  const extracted = unzipSync(bytes);
  assert.deepEqual(Object.keys(extracted).sort(), Object.keys(files).sort());
  for (const key of Object.keys(files)) assert.deepEqual(extracted[key], files[key]);
  await writeFile(join(output, name), bytes);
  checksums.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  console.log(`${name}: ${(bytes.length / 1024 / 1024).toFixed(1)} MB; ${Object.keys(files).length} files`);
}
for (const browser of ['firefox', 'chrome']) {
  const directory = join(root, 'dist', browser);
  const files = {};
  async function walk(dir, prefix = '') {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      assert(!entry.isSymbolicLink(), 'Release contents must not include symbolic links');
      const path = join(dir, entry.name), key = prefix + entry.name;
      if (entry.isDirectory()) await walk(path, key + '/');
      else files[key] = new Uint8Array(await readFile(path));
    }
  }
  await walk(directory);
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
  assert.equal(manifest.version, pkg.version, 'Build and package versions must match');
  if (browser === 'firefox') assert.equal(manifest.browser_specific_settings.gecko.id, 'scoped@scope-exporter.local');
  await archive(`scoped-${browser}-${pkg.version}.zip`, files);
}
// Source submission uses explicit project paths and Git's ignore rules. Never
// package user exports, profiles, dependencies, caches, generated data or secrets.
const candidates = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const rootFiles = new Set(['README.md', 'AGENTS.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', '.gitignore', 'popup.html', 'viewer.html', 'posting.html', 'backup.html']);
const source = {};
for (const name of candidates) {
  if (!(rootFiles.has(name) || /^(src|scripts|tests|docs)\//.test(name) || /^public\/icons\//.test(name) || /^public\/(maps|models)\/[A-Z-]+\.txt$/.test(name))) continue;
  if (!/\.(ts|mjs|html|css|md|txt|png|json)$/.test(name) && name !== '.gitignore') continue;
  const absolute = resolve(root, name);
  assert(absolute.startsWith(root), 'Source path must stay within repository');
  try { source[name] = new Uint8Array(await readFile(absolute)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
assert(source['scripts/build.mjs'] && source['package-lock.json'] && source['src/backup.ts']);
await archive(`scoped-source-${pkg.version}.zip`, source);
await writeFile(join(output, 'SHA256SUMS.txt'), checksums.join('\n') + '\n');
console.log(`Release archives ready in ${output}. Firefox ZIP is unsigned: submit it to Mozilla for unlisted signing.`);
