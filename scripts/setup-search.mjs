import { fileURLToPath } from 'node:url';
import { ensureSemanticAssets } from './semantic-assets.mjs';
await ensureSemanticAssets(fileURLToPath(new URL('../', import.meta.url)));
console.log('Packaged local semantic-search assets prepared.');
