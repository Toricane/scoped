import { fold, positionTitle, tokens } from './viewer-model';
import type { Posting } from './types';

export const embeddingVersion = 'minilm-l6-v2:751bff3:q8:mean:384:text-v1';
export const dimensions = 384;
export type SearchScope = 'all' | 'title';
export interface SemanticDocument { id: string; text: string }
export interface SemanticRequest { revision: number; documents: SemanticDocument[]; query: string }
export type SemanticReply = { revision: number; type: 'progress'; message: string }
  | { revision: number; type: 'result'; scores: [string, number][]; cacheAvailable: boolean }
  | { revision: number; type: 'error'; message: string };

/** Stable text only: deadlines and local library marks must not invalidate embeddings. */
export function semanticText(posting: Posting, scope: SearchScope): string {
  const title = `Position: ${positionTitle(posting)}`;
  return scope === 'title' ? title : [title, `Organization: ${posting.organization}`, `Division: ${posting.division}`, `Location: ${posting.location}`].join('\n');
}
export function validVector(value: unknown): value is Float32Array {
  return value instanceof Float32Array && value.length === dimensions && value.every(Number.isFinite) && value.some(component => component !== 0);
}
export function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb))) : 0;
}
/** Cosine recalls related text; lexical coverage keeps exact names useful. Scores are not probabilities. */
export function relevance(query: string, document: SemanticDocument, queryVector: Float32Array, vector: Float32Array, minimumSimilarity = 0.20): number | undefined {
  const terms = tokens(query), text = fold(document.text);
  const lexical = terms.length ? terms.filter(term => text.includes(term)).length / terms.length : 0;
  if (/^\d+$/.test(query.trim())) return document.id === query.trim() ? 1 : undefined;
  const similarity = cosine(queryVector, vector);
  // A modest recall threshold, with full lexical matches retained regardless of cosine.
  if (similarity < minimumSimilarity && lexical < 1) return;
  return 0.85 * similarity + 0.15 * lexical;
}
