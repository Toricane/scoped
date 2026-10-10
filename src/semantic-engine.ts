import { relevance, validVector, type SemanticRequest } from './semantic-model';
import { vectorKey, type VectorCache } from './semantic-cache';

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
  const scores: [string, number][] = [];
  for (let i = 0; i < request.documents.length; i++) {
    if (!current()) return;
    const document = request.documents[i];
    const embedding = await vector(document.text);
    if (!current()) return;
    const score = relevance(request.query, document, query, embedding);
    if (score !== undefined) scores.push([document.id, score]);
    if (i % 10 === 0 || i === request.documents.length - 1) progress(`Searching locally · ${i + 1} / ${request.documents.length} postings`);
    // Let newer query/snapshot messages interrupt between records, even on a fully warm cache.
    if (i % 20 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return current() ? scores : undefined;
}
