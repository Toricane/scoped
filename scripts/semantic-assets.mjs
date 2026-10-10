import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';

export const modelRevision = '751bff37182d3f1213fa05d7196b954e230abad9';
export const modelFiles = [
  { name: 'config.json', bytes: 650, git: '72147e4ff4426ebedbfa2146c4a0999def51a313' },
  { name: 'tokenizer.json', bytes: 711661, git: 'c17ed520ed8438736732a54957a69306b8822215' },
  { name: 'tokenizer_config.json', bytes: 366, git: '37fca74771bc76a8e01178ce3a6055a0995f8093' },
  { name: 'onnx/model_quantized.onnx', bytes: 22972370, sha256: 'afdb6f1a0e45b715d0bb9b11772f032c399babd23bfc31fed1c170afc848bdb1' },
];
export function verifyModelFile(file, data) {
  if (data.length !== file.bytes) return false;
  return file.sha256
    ? createHash('sha256').update(data).digest('hex') === file.sha256
    : createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex') === file.git;
}
/** Narrow, checked browser-only adaptations of the pinned runtime (Apache-2.0/MIT). */
export function prepareRuntime(name, text) {
  if (!['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs'].includes(name)) return text;
  const fallback = 'Function("return this")()';
  if (text.split(fallback).length !== 2) throw new Error(`Unexpected global fallback in pinned runtime: ${name}`);
  text = text.replace(fallback, 'globalThis');
  if (name === 'transformers.min.js') {
    if (text.split('import(e)').length !== 2) throw new Error('Unexpected factory loader in pinned Transformers runtime');
    text = text.replace('import(e)', 'import("./ort-wasm-simd-threaded.jsep.mjs")');
  }
  return text.replace(/\/\/# sourceMappingURL=.*$/gm, '');
}
/** Fetch only public pinned model data during build, never in the installed extension. */
export async function ensureSemanticAssets(root, { fetcher = globalThis.fetch } = {}) {
  const directory = join(root, 'public/models/minilm');
  const inputs = [];
  for (const file of modelFiles) {
    let bytes;
    try { bytes = await readFile(join(directory, file.name)); } catch { /* First setup. */ }
    if (!bytes || !verifyModelFile(file, bytes)) {
      console.log(`Preparing offline semantic search: ${file.name}…`);
      const url = `https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/${modelRevision}/${file.name}`;
      let response;
      try { response = await fetcher(url, { signal: AbortSignal.timeout(120_000) }); }
      catch (cause) { throw new Error('Semantic model setup needs internet access. Retry npm run setup:search when online.', { cause }); }
      if (!response.ok) throw new Error(`Semantic model setup failed: ${file.name}, HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
      if (!verifyModelFile(file, bytes)) throw new Error(`Pinned model integrity check failed: ${file.name}`);
    }
    inputs.push(bytes);
  }
  // Verify all inputs before replacing assets.
  await mkdir(join(directory, 'onnx'), { recursive: true });
  for (let i = 0; i < modelFiles.length; i++) await writeFile(join(directory, modelFiles[i].name), inputs[i]);
  const runtime = join(root, 'public/runtime'); await mkdir(runtime, { recursive: true });
  const source = join(root, 'node_modules/@huggingface/transformers');
  for (const file of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs']) {
    await writeFile(join(runtime, file), prepareRuntime(file, await readFile(join(source, 'dist', file), 'utf8')));
  }
  await copyFile(join(source, 'dist/ort-wasm-simd-threaded.jsep.wasm'), join(runtime, 'ort-wasm-simd-threaded.jsep.wasm'));
  await writeFile(join(runtime, 'SCOPED-RUNTIME-CHANGES.txt'), 'Scoped browser-only adaptations of Transformers.js 3.8.1 and its matching ONNX Runtime:\nRemoved Function("return this") global fallback; target browsers support globalThis.\nFixed dynamic WASM factory import to the packaged ./ort-wasm-simd-threaded.jsep.mjs.\nRemoved source-map comments for maps not distributed with this package.\nUpstream code is otherwise unchanged; see accompanying Apache-2.0 and MIT licenses.\n');
  await copyFile(join(source, 'LICENSE'), join(runtime, 'TRANSFORMERS-LICENSE.txt'));
  await copyFile(join(root, 'public/models/ONNX-RUNTIME-LICENSE.txt'), join(runtime, 'ONNX-RUNTIME-LICENSE.txt'));
  await copyFile(join(source, 'LICENSE'), join(root, 'public/models/MODEL-LICENSE.txt'));
}
