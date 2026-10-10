import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import { openVectorCache } from './semantic-cache';
import { searchVectors } from './semantic-engine';
import type { SemanticReply, SemanticRequest } from './semantic-model';

// All URLs resolve inside the extension; never use the library's Hub/CDN defaults.
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
env.localModelPath = new URL(/* @vite-ignore */ '../models/', import.meta.url).href;
env.backends.onnx.wasm!.wasmPaths = new URL(/* @vite-ignore */ '../runtime/', import.meta.url).href;
env.backends.onnx.wasm!.numThreads = 1;
env.backends.onnx.wasm!.proxy = false;
const cache = openVectorCache();
let extractor: Promise<FeatureExtractionPipeline> | undefined;
let latest: SemanticRequest | undefined, running = false;
const send = (reply: SemanticReply) => globalThis.postMessage(reply);
async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (latest) {
      const request = latest; latest = undefined;
      const revision = request.revision;
      const current = () => latest === undefined;
      try {
        const vectors = await cache;
        const scores = await searchVectors(request, async text => {
          if (!extractor) {
            send({ revision, type: 'progress', message: 'Loading the packaged search model…' });
            extractor = pipeline<'feature-extraction'>('feature-extraction', 'minilm', { dtype: 'q8', device: 'wasm', local_files_only: true });
          }
          const pipe = await extractor;
          pipe.tokenizer.model_max_length = 256;
          const result = await pipe(text, { pooling: 'mean', normalize: true });
          return new Float32Array(result.data as Float32Array);
        }, vectors, current, message => { if (current()) send({ revision, type: 'progress', message }); });
        if (scores && current()) send({ revision, type: 'result', scores, cacheAvailable: vectors.available });
      } catch {
        extractor = undefined;
        if (current()) send({ revision, type: 'error', message: 'Local semantic search could not start. Keyword results are shown. Reload the extension after rebuilding, or retry.' });
      }
    }
  } finally { running = false; }
}
globalThis.onmessage = (event: MessageEvent<SemanticRequest>) => { latest = event.data; void drain(); };
