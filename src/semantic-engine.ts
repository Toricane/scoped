import { cosine, relevance, validVector, type SemanticRequest } from './semantic-model';
import { vectorKey, type VectorCache } from './semantic-cache';
import { fold, tokens } from './viewer-model';

export type Encoder = (text: string) => Promise<Float32Array>;
export async function searchVectors(request: SemanticRequest, encode: Encoder, cache: VectorCache, current: () => boolean, progress: (message: string) => void): Promise<[string, number][] | undefined> {
  if (/^\d+$/.test(request.query.trim())) return current() ? request.documents.filter(document => document.id === request.query.trim()).map(document => [document.id, 1]) : undefined;
  const vector = async (text: string) => {
    const key = await vectorKey(text), cached = await cache.get(key);
    if (cached && validVector(cached)) return cached;
    const result = await encode(text);
    if (!validVector(result)) throw new Error('The local model returned an invalid embedding.');
    await cache.put(key, result); return result;
  };
  progress('Preparing local search…');
  const query = await vector(request.query);
  if (!current()) return;
  const candidates: { document: SemanticRequest['documents'][number]; embedding: Float32Array }[] = [];
  let bestSimilarity = -1;
  for (let i = 0; i < request.documents.length; i++) {
    if (!current()) return;
    const document = request.documents[i];
    const embedding = await vector(document.text);
    if (!current()) return;
    bestSimilarity = Math.max(bestSimilarity, cosine(query, embedding));
    candidates.push({ document, embedding });
    if (i % 10 === 0 || i === request.documents.length - 1) progress(`Searching locally · ${i + 1} / ${request.documents.length} postings`);
    // Let newer query/snapshot messages interrupt between records, even on a fully warm cache.
    if (i % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  const scores: [string, number][] = [];
  // Keep related alternatives to the strongest hit while reducing generic field overlap.
  // Full lexical matches still bypass the cutoff. This is a relevance heuristic, not confidence.
  const terms = tokens(request.query);
  const hasLiteralMatch = request.documents.some(document => terms.length && terms.every(term => fold(document.text).includes(term)));
  const cutoff = Math.max(0.20, bestSimilarity - (hasLiteralMatch ? 0.20 : 0.25));
  for (const { document, embedding } of candidates) {
    const score = relevance(request.query, document, query, embedding, cutoff);
    if (score !== undefined) scores.push([document.id, score]);
  }
  return current() ? scores : undefined;
}
