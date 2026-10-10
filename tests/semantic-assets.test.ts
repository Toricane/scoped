// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
// @ts-expect-error Build helper is JavaScript, exercised directly.
import { prepareRuntime, verifyModelFile } from '../scripts/semantic-assets.mjs';
it('verifies both pinned model SHA-256 and tokenizer Git blob identity', () => {
  const bytes = Buffer.from('synthetic public model');
  const file = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  expect(verifyModelFile(file, bytes)).toBe(true);
  expect(verifyModelFile(file, Buffer.from('tampered'))).toBe(false);
  const git = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  expect(verifyModelFile({ bytes: bytes.length, git }, bytes)).toBe(true);
  expect(verifyModelFile({ bytes: bytes.length, git: '0'.repeat(40) }, bytes)).toBe(false);
});
it('fixes only the pinned global fallback and factory loader, failing closed on upstream changes', () => {
  const source = 'const global=Function("return this")(); const factory=()=>import(e);\n//# sourceMappingURL=missing.map';
  const result = prepareRuntime('transformers.min.js', source);
  expect(result).toContain('const global=globalThis'); expect(result).toContain('import("./ort-wasm-simd-threaded.jsep.mjs")');
  expect(result).not.toContain('sourceMappingURL'); expect(result).not.toContain('Function(');
  expect(() => prepareRuntime('transformers.min.js', 'changed runtime')).toThrow('Unexpected global fallback');
  expect(() => prepareRuntime('transformers.min.js', 'Function("return this")()')).toThrow('Unexpected factory loader');
});
