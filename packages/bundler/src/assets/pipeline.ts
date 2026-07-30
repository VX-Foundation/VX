import fs from 'node:fs';
import path from 'node:path';
import { classifyAsset } from './classify.js';
import { contentHash, integrityHash, stableId } from './hash.js';
import { createResourceHints } from './hints.js';
import { inspectAssetMetadata } from './metadata.js';
import { createSharpImageTransformer } from './image-transformer.js';
import { generateResponsiveImageVariants } from './responsive.js';
import { optimizeAsset } from './optimize.js';
import type { AssetManifest, AssetPipelineOptions, AssetRecord, ResourceHintManifest, ResponsiveImageManifestEntry } from './types.js';

export interface AssetPipelineResult {
  manifestPath: string;
  hintsPath: string;
  manifest: AssetManifest;
  hints: ResourceHintManifest;
}

export async function runAssetPipeline(options: AssetPipelineOptions): Promise<AssetPipelineResult> {
  fs.mkdirSync(options.clientDir, { recursive: true });
  copyPublicAssets(options);
  const responsiveImages = await buildResponsiveImages(options);
  const records = collectOutputAssets(options);
  const bySourceEntries: Array<[string, string]> = [];
  const preferred = new Map<string, AssetRecord>();
  for (const record of records) {
    const current = preferred.get(record.sourcePath);
    if (!current || (!current.immutable && record.immutable)) preferred.set(record.sourcePath, record);
  }
  for (const [sourcePath, record] of [...preferred.entries()].sort(([a], [b]) => a.localeCompare(b))) bySourceEntries.push([sourcePath, record.publicPath]);
  const bySource = Object.fromEntries(bySourceEntries);
  const manifest: AssetManifest = Object.freeze({
    version: 1,
    algorithm: options.integrity,
    assets: Object.freeze(records),
    bySource: Object.freeze(bySource),
    ...(responsiveImages.length ? { responsiveImages: Object.freeze(responsiveImages) } : {})
  });
  const hints = createResourceHints(manifest, options);
  const manifestPath = path.join(options.clientDir, 'vx.assets.json');
  const hintsPath = path.join(options.clientDir, 'vx.hints.json');
  fs.writeFileSync(manifestPath, stableJson(manifest));
  fs.writeFileSync(hintsPath, stableJson(hints));
  return { manifestPath, hintsPath, manifest, hints };
}


async function buildResponsiveImages(options: AssetPipelineOptions): Promise<ResponsiveImageManifestEntry[]> {
  if (options.responsiveImages.length === 0) return [];
  const transformer = await createSharpImageTransformer();
  const outputDirectory = path.join(options.clientDir, 'assets', 'images');
  const entries: ResponsiveImageManifestEntry[] = [];
  for (const request of [...options.responsiveImages].sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))) {
    const sourcePath = path.resolve(options.root, request.sourcePath);
    const root = path.resolve(options.root);
    if (sourcePath !== root && !sourcePath.startsWith(`${root}${path.sep}`)) throw new Error(`Responsive image source escapes the project root: '${request.sourcePath}'.`);
    if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) throw new Error(`Responsive image source was not found: '${request.sourcePath}'.`);
    const source = fs.readFileSync(sourcePath);
    const variants = await generateResponsiveImageVariants(request, source, outputDirectory, '/assets/images', transformer, options.integrity);
    entries.push(Object.freeze({ sourcePath: path.relative(options.root, sourcePath).split(path.sep).join('/'), variants }));
  }
  return entries;
}

function copyPublicAssets(options: AssetPipelineOptions): void {
  if (!fs.existsSync(options.publicDir)) return;
  for (const sourcePath of walkFiles(options.publicDir)) {
    const relative = safeRelative(options.publicDir, sourcePath);
    assertPublishableAsset(relative);
    const original = fs.readFileSync(sourcePath);
    const optimized = options.optimize ? optimizeAsset(sourcePath, original) : original;
    const extension = path.extname(relative);
    const basename = relative.slice(0, Math.max(0, relative.length - extension.length));
    const hashed = `${basename}.${contentHash(optimized)}${extension}`;
    if (options.publicAssetMode !== 'hashed') writeFile(path.join(options.clientDir, relative), optimized);
    if (options.publicAssetMode !== 'preserve') writeFile(path.join(options.clientDir, hashed), optimized);
  }
}

function collectOutputAssets(options: AssetPipelineOptions): AssetRecord[] {
  const records: AssetRecord[] = [];
  const criticalAssets = new Set(options.criticalAssets.map(normalizePublicPath));
  for (const outputPath of walkFiles(options.clientDir)) {
    const relative = safeRelative(options.clientDir, outputPath);
    if (relative === 'vx.assets.json' || relative === 'vx.hints.json') continue;
    const optimized = fs.readFileSync(outputPath);
    const hash = contentHash(optimized);
    const kind = classifyAsset(relative);
    const immutable = hasContentHash(relative, hash) || relative.startsWith('assets/');
    const metadata = inspectAssetMetadata(relative, optimized);
    const record: AssetRecord = {
      id: stableId(relative),
      sourcePath: inferSourcePath(options, relative, hash),
      outputPath: relative,
      publicPath: `/${relative}`,
      kind,
      bytes: optimized.byteLength,
      contentHash: hash,
      ...(options.integrity ? { integrity: integrityHash(optimized, options.integrity) } : {}),
      immutable,
      ...(criticalAssets.has(`/${relative}`) ? { critical: true } : {}),
      ...(metadata ? { metadata } : {})
    };
    records.push(Object.freeze(record));
  }
  return records.sort((a, b) => a.outputPath.localeCompare(b.outputPath));
}

function inferSourcePath(options: AssetPipelineOptions, relative: string, hash: string): string {
  if (!fs.existsSync(options.publicDir)) return relative;
  const direct = path.join(options.publicDir, relative);
  if (fs.existsSync(direct)) return path.relative(options.root, direct).split(path.sep).join('/');
  const extension = path.extname(relative);
  const suffix = `.${hash}${extension}`;
  if (relative.endsWith(suffix)) {
    const unhashed = `${relative.slice(0, -suffix.length)}${extension}`;
    const source = path.join(options.publicDir, unhashed);
    if (fs.existsSync(source)) return path.relative(options.root, source).split(path.sep).join('/');
  }
  return relative;
}

function normalizePublicPath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function hasContentHash(relative: string, hash: string): boolean {
  return relative.includes(`-${hash}`) || relative.includes(`.${hash}`) || /[.-][a-f0-9]{8,64}(?=\.)/i.test(relative);
}

function walkFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const output: string[] = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Asset pipeline refuses symbolic link '${full}'.`);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) output.push(full);
    }
  }
  return output.sort();
}

function safeRelative(root: string, filePath: string): string {
  const relative = path.relative(root, filePath);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Unsafe asset path '${filePath}'.`);
  return relative.split(path.sep).join('/');
}
function assertPublishableAsset(relative: string): void {
  const segments = relative.split('/');
  const name = segments.at(-1)?.toLowerCase() ?? '';
  if (segments.some((segment) => ['.git', '.vx', 'node_modules'].includes(segment))) throw new Error(`Sensitive directory cannot be published as an asset: '${relative}'.`);
  if (name === '.env' || name.startsWith('.env.') || /(?:^|[._-])(?:credentials|service-account|private-key)(?:[._-]|$)/i.test(name)) throw new Error(`Sensitive configuration cannot be published as an asset: '${relative}'.`);
  if (/\.(?:key|pem|p12|pfx|jks|keystore)$/i.test(name) || /^(?:id_rsa|id_ed25519)(?:\.pub)?$/i.test(name)) throw new Error(`Private key material cannot be published as an asset: '${relative}'.`);
}

function writeFile(filePath: string, content: Uint8Array): void { fs.mkdirSync(path.dirname(filePath), { recursive: true }); fs.writeFileSync(filePath, content); }
function stableJson(value: unknown): string { return `${JSON.stringify(sortValue(value), null, 2)}\n`; }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortValue(child)]));
}
