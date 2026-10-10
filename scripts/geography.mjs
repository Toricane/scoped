import { unzipSync, strFromU8 } from 'fflate';
import { mkdir, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const sourceBase = 'https://download.geonames.org/export/dump/';
const sourceFiles = ['cities1000.zip', 'admin1CodesASCII.txt', 'countryInfo.txt'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function hasGeography(root) {
  try {
    const directory = join(root, 'public/maps');
    const index = JSON.parse(await readFile(join(directory, 'cities.json'), 'utf8'));
    if (index.version !== 1 || !Number.isSafeInteger(index.count) || index.count < 1 || !Array.isArray(index.files) || !index.files.length || !index.files.every(file => /^cities-\d+\.json$/.test(file))) return false;
    const files = [...index.files, 'countries.json', 'countries-50m.json', 'countries-10m.json', 'SOURCES.txt'];
    return (await Promise.all(files.map(async file => (await stat(join(directory, file))).size > 0))).every(Boolean);
  } catch { return false; }
}

/** Build-time public data only; the installed extension never downloads geography. */
export async function ensureGeography(root, { refresh = false, fetcher = globalThis.fetch } = {}) {
  if (!refresh && await hasGeography(root)) return { cached: true };
  const cache = join(root, '.cache/geography'), directory = join(root, 'public/maps');
  let inputs, provenance;
  if (!refresh) {
    try { provenance = JSON.parse(await readFile(join(cache, 'sources.json'), 'utf8')); } catch { /* First setup has no source cache. */ }
    if (provenance) {
      inputs = await Promise.all(sourceFiles.map(async name => {
        const bytes = new Uint8Array(await readFile(join(cache, name)));
        if (provenance.files?.[name]?.sha256 !== digest(bytes)) throw new Error('Cached geography failed verification. Run npm run update:maps to replace it.');
        return bytes;
      }));
    }
  }
  if (!inputs) {
    console.log('Preparing offline maps: downloading public GeoNames data once…');
    try {
      inputs = await Promise.all(sourceFiles.map(async name => {
        const response = await fetcher(sourceBase + name, { signal: AbortSignal.timeout(120_000) });
        if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
        return new Uint8Array(await response.arrayBuffer());
      }));
    } catch (cause) { throw new Error('Map setup needs internet access to GeoNames. Retry npm run setup:maps when online; existing assets have not been replaced.', { cause }); }
    provenance = { retrievedAt: new Date().toISOString(), files: Object.fromEntries(sourceFiles.map((name, i) => [name, { url: sourceBase + name, sha256: digest(inputs[i]) }])) };
  }
  const [zip, admins, countries] = inputs;
  const unpacked = unzipSync(zip)['cities1000.txt'];
  if (!unpacked) throw new Error('GeoNames archive is missing cities1000.txt. Existing maps have not been replaced.');
  const regions = new Map(strFromU8(admins).split('\n').filter(Boolean).map(line => { const f = line.split('\t'); return [f[0], f[1]]; }));
  const countryNames = Object.fromEntries(strFromU8(countries).split('\n').filter(line => line && !line.startsWith('#')).map(line => { const f = line.split('\t'); return [f[0], f[4]]; }));
  const cities = strFromU8(unpacked).split('\n').filter(Boolean).map(line => { const f = line.split('\t'); return [f[1], f[2], f[8], f[10], regions.get(`${f[8]}.${f[10]}`) ?? '', Number(f[5]), Number(f[4])]; });
  if (!cities.length || cities.some(city => typeof city[0] !== 'string' || !city[2] || !Number.isFinite(city[5]) || !Number.isFinite(city[6]) || Math.abs(city[5]) > 180 || Math.abs(city[6]) > 90)) throw new Error('GeoNames city data is invalid. Existing maps have not been replaced.');
  // Verify dependencies/notices before writing outputs; SOURCES.txt is kept in Git.
  const world = join(root, 'node_modules/world-atlas');
  await Promise.all(['countries-110m.json', 'countries-50m.json', 'countries-10m.json'].map(file => stat(join(world, file))));
  await stat(join(directory, 'SOURCES.txt'));
  await mkdir(cache, { recursive: true });
  await Promise.all(sourceFiles.map((name, i) => writeFile(join(cache, name), inputs[i])));
  await writeFile(join(cache, 'sources.json'), JSON.stringify(provenance, null, 2));
  const files = [];
  for (let offset = 0; offset < cities.length; offset += 40000) {
    const name = `cities-${files.length}.json`; files.push(name);
    await writeFile(join(directory, name), JSON.stringify(cities.slice(offset, offset + 40000)));
  }
  await copyFile(join(world, 'countries-110m.json'), join(directory, 'countries.json'));
  for (const level of ['50m', '10m']) await copyFile(join(world, `countries-${level}.json`), join(directory, `countries-${level}.json`));
  // Index is the last file: an incomplete first setup won't look ready.
  await writeFile(join(directory, 'cities.json'), JSON.stringify({ version: 1, generatedAt: provenance.retrievedAt, countryNames, files, count: cities.length, sources: provenance.files }));
  console.log(`Prepared ${cities.length} public places and three offline boundary levels.`);
  return { cached: false, count: cities.length };
}
