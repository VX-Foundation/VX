import fs from 'node:fs';
import path from 'node:path';

interface ViteManifestRecord {
  file: string;
  isEntry?: boolean;
  imports?: readonly string[];
  css?: readonly string[];
  assets?: readonly string[];
}

export interface BrowserAssetGraph {
  clientEntry: string;
  criticalAssets: readonly string[];
}

/** Reads the private Vite manifest and removes it before public asset discovery. */
export function consumeBrowserAssetGraph(clientDir: string): BrowserAssetGraph {
  const internalDirectory = path.join(clientDir, '.vx');
  const manifestPath = path.join(internalDirectory, 'manifest.json');
  try {
    if (!fs.existsSync(manifestPath)) return fallbackGraph(clientDir);
    const manifest = parseManifest(fs.readFileSync(manifestPath, 'utf8'));
    const entryKey = Object.keys(manifest).sort().find((key) => manifest[key]?.isEntry === true);
    if (!entryKey) throw new Error('VX browser build manifest does not contain an entry module.');
    const critical = new Set<string>();
    const visited = new Set<string>();
    collectStaticGraph(entryKey, manifest, visited, critical);
    const entry = manifest[entryKey];
    if (!entry) throw new Error(`VX browser entry '${entryKey}' is missing from the manifest.`);
    return Object.freeze({
      clientEntry: publicPath(entry.file),
      criticalAssets: Object.freeze([...critical].sort())
    });
  } finally {
    fs.rmSync(internalDirectory, { recursive: true, force: true });
  }
}

function collectStaticGraph(
  key: string,
  manifest: Readonly<Record<string, ViteManifestRecord>>,
  visited: Set<string>,
  output: Set<string>
): void {
  if (visited.has(key)) return;
  visited.add(key);
  const record = manifest[key];
  if (!record) throw new Error(`VX browser manifest references missing static import '${key}'.`);
  output.add(publicPath(record.file));
  for (const file of record.css ?? []) output.add(publicPath(file));
  for (const file of record.assets ?? []) output.add(publicPath(file));
  for (const dependency of [...(record.imports ?? [])].sort()) collectStaticGraph(dependency, manifest, visited, output);
}

function parseManifest(source: string): Readonly<Record<string, ViteManifestRecord>> {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (error) { throw new Error('VX browser build emitted an invalid Vite manifest.', { cause: error }); }
  if (!isRecord(value)) throw new TypeError('VX browser build manifest must be an object.');
  const records: Record<string, ViteManifestRecord> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isRecord(candidate) || typeof candidate['file'] !== 'string') throw new TypeError(`VX browser manifest record '${key}' is invalid.`);
    records[key] = Object.freeze({
      file: safeOutputPath(candidate['file']),
      ...(candidate['isEntry'] === true ? { isEntry: true } : {}),
      ...(candidate['imports'] !== undefined ? { imports: readStringArray(candidate['imports'], `${key}.imports`) } : {}),
      ...(candidate['css'] !== undefined ? { css: readStringArray(candidate['css'], `${key}.css`).map(safeOutputPath) } : {}),
      ...(candidate['assets'] !== undefined ? { assets: readStringArray(candidate['assets'], `${key}.assets`).map(safeOutputPath) } : {})
    });
  }
  return Object.freeze(records);
}

function fallbackGraph(clientDir: string): BrowserAssetGraph {
  const assetsDirectory = path.join(clientDir, 'assets');
  const matches = fs.existsSync(assetsDirectory)
    ? fs.readdirSync(assetsDirectory).filter((name) => /^vx-client-[A-Za-z0-9_-]+\.js$/.test(name)).sort()
    : [];
  if (matches.length !== 1) throw new Error(`VX browser build expected exactly one hashed client entry, found ${matches.length}.`);
  const clientEntry = `/assets/${matches[0]}`;
  return Object.freeze({ clientEntry, criticalAssets: Object.freeze([clientEntry]) });
}

function publicPath(file: string): string { return `/${safeOutputPath(file)}`; }
function safeOutputPath(file: string): string {
  const normalized = file.replaceAll('\\', '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..')) throw new TypeError(`Unsafe browser output path '${file}'.`);
  return normalized;
}
function readStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) throw new TypeError(`VX browser manifest field '${field}' must be a string array.`);
  return Object.freeze([...new Set(value)].sort());
}
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
