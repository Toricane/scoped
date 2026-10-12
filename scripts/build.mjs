import { build } from 'vite';
import { ensureGeography } from './geography.mjs';
import { ensureSemanticAssets } from './semantic-assets.mjs';
import { mkdir, rm, cp, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
await ensureGeography(root);
await ensureSemanticAssets(root);
const staging = resolve(root, 'dist/shared');
await rm(resolve(root, 'dist'), { recursive: true, force: true });
await build({ root, base: './', worker: { format: 'es', rollupOptions: { external: ['@huggingface/transformers'], output: { paths: { '@huggingface/transformers': '../runtime/transformers.min.js' } } } }, build: { outDir: staging, emptyOutDir: true, rollupOptions: { input: ['popup', 'viewer', 'posting', 'backup'].map(page => resolve(root, `${page}.html`)) } } });
for (const entry of ['background', 'content']) {
  await build({ root, build: { outDir: staging, emptyOutDir: false, lib: { entry: resolve(root, `src/${entry}.ts`), name: `scoped_${entry}`, formats: ['iife'], fileName: () => `${entry}.js` } } });
}
for (const browser of ['firefox', 'chrome']) {
  const directory = resolve(root, `dist/${browser}`);
  await mkdir(directory, { recursive: true });
  await cp(staging, directory, { recursive: true });
  const manifest = {
    manifest_version: 3,
    name: 'Scoped: SCOPE posting explorer', version: '0.8.0',
    description: 'Collect your SCOPE search, explore postings with fast local filters, and export CSV or JSON.',
    permissions: ['activeTab', 'scripting', 'storage', 'downloads'],
    host_permissions: ['https://scope.sciencecoop.ubc.ca/*'],
    content_security_policy: { extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'; worker-src 'self'; connect-src 'self'" },
    icons: Object.fromEntries([16, 32, 48, 96, 128].map(size => [size, `icons/scoped-${size}.png`])),
    action: { default_title: 'Scoped: export SCOPE postings', default_popup: 'popup.html', default_icon: { 16: 'icons/scoped-16.png', 32: 'icons/scoped-32.png', 48: 'icons/scoped-48.png' } },
    background: browser === 'firefox' ? { scripts: ['background.js'] } : { service_worker: 'background.js' },
    ...(browser === 'firefox' ? { browser_specific_settings: { gecko: { id: 'scoped@scope-exporter.local', strict_min_version: '142.0', data_collection_permissions: { required: ['none'] } } } } : { minimum_chrome_version: '120' }),
  };
  await writeFile(resolve(directory, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
}
await rm(staging, { recursive: true, force: true });
console.log('Built dist/firefox and dist/chrome.');
