import { fileURLToPath } from 'node:url';
import { ensureGeography } from './geography.mjs';
await ensureGeography(fileURLToPath(new URL('../', import.meta.url)), { refresh: process.argv.includes('--refresh') });
