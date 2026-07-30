import path from 'node:path';
import type { AdapterConfig, AdapterName, BuildTarget } from '@vx/types';
import type { BuildOptions, NormalizedBuildOptions } from './types.js';
import { adapterCapabilities, normalizeAdapterName } from '../adapters/registry.js';
import { validateBuildOptionsInput } from './validation.js';

const DEFAULT_TARGETS: Readonly<Record<string, readonly BuildTarget[]>> = Object.freeze({
  node: ['browser', 'server'],
  'node-standalone': ['browser', 'server'],
  docker: ['browser', 'server'],
  static: ['browser', 'server', 'static'],
  'cloudflare-workers': ['browser', 'edge'],
  'cloudflare-pages': ['browser', 'edge'],
  vercel: ['browser', 'server'],
  netlify: ['browser', 'server'],
  'aws-lambda': ['browser', 'server'],
  serverless: ['browser', 'server'],
  'generic-serverless': ['browser', 'server'],
  bun: ['browser', 'server'],
  deno: ['browser', 'edge'],
  edge: ['browser', 'edge'],
  'edge-runtime': ['browser', 'edge']
});

export function normalizeBuildOptions(options: BuildOptions): NormalizedBuildOptions {
  validateBuildOptionsInput(options);
  const root = path.resolve(options.root);
  const outDir = options.outDir ? path.resolve(root, options.outDir) : path.join(root, 'dist');
  assertContainedDirectory(root, outDir, 'outDir', false);
  const srcDir = options.srcDir ?? 'src';
  const adapter = normalizeAdapter(options.adapter ?? 'node');
  const adapterName = normalizeAdapterName(adapter.name);
  const targetDefaults: readonly BuildTarget[] = DEFAULT_TARGETS[adapterName] ?? (['browser', 'server'] as const);
  const targets: readonly BuildTarget[] = Object.freeze(deduplicate<BuildTarget>(options.targets ?? targetDefaults));
  const mode = options.mode ?? 'production';
  validateTargets(targets, adapterName, typeof adapter.options?.['module'] === 'string');
  const assets = options.assets ?? {};
  const publicDir = path.resolve(root, assets.publicDir ?? 'public');
  assertContainedDirectory(root, publicDir, 'assets.publicDir', false);
  if (publicDir === outDir || publicDir.startsWith(`${outDir}${path.sep}`)) throw new TypeError('VX public assets directory cannot be inside the build output directory.');
  const dependency = options.dependencyOptimization ?? {};
  const chunk = options.chunkPolicy ?? {};
  return {
    root,
    outDir,
    srcDir,
    pagesDir: path.join(srcDir, 'pages'),
    publicDir,
    adapter: Object.freeze({ ...adapter, name: adapterName }),
    mode,
    targets,
    sourceMaps: options.sourceMaps ?? (mode === 'production' ? 'hidden' : 'linked'),
    incremental: options.incremental ?? true,
    deterministic: options.deterministic ?? true,
    reproducible: options.reproducible ?? true,
    bundleAnalysis: options.bundleAnalysis ?? true,
    chunkPolicy: Object.freeze({
      maxInitialBytes: chunk.maxInitialBytes ?? 350_000,
      maxAsyncBytes: chunk.maxAsyncBytes ?? 500_000,
      maxChunkBytes: chunk.maxChunkBytes ?? 750_000,
      maxChunkCount: chunk.maxChunkCount ?? 120,
      minimumSharedBytes: chunk.minimumSharedBytes ?? 20_000,
      enforce: chunk.enforce ?? false
    }),
    dependencyOptimization: Object.freeze({
      enabled: dependency.enabled ?? true,
      include: Object.freeze([...(dependency.include ?? [])]),
      exclude: Object.freeze([...(dependency.exclude ?? [])]),
      force: dependency.force ?? false
    }),
    assets: Object.freeze({
      publicDir: assets.publicDir ?? 'public',
      publicAssetMode: assets.publicAssetMode ?? 'both',
      inlineLimitBytes: assets.inlineLimitBytes ?? 4_096,
      integrity: assets.integrity ?? 'sha384',
      preload: assets.preload ?? true,
      prefetch: assets.prefetch ?? false,
      optimize: assets.optimize ?? true,
      responsiveImages: Object.freeze([...(assets.responsiveImages ?? [])])
    }),
    ...(options.library ? { library: options.library } : {})
  };
}

function normalizeAdapter(value: AdapterName | AdapterConfig): AdapterConfig {
  return typeof value === 'string' ? { name: value } : { name: value.name, ...(value.options ? { options: Object.freeze({ ...value.options }) } : {}) };
}

function validateTargets(targets: readonly BuildTarget[], adapter: string, customAdapter: boolean): void {
  if (targets.length === 0) throw new TypeError('VX build requires at least one target.');
  if (!targets.includes('library') && !customAdapter) {
    const supported = adapterCapabilities(adapter).targets;
    for (const target of targets) if (!supported.includes(target)) throw new TypeError(`Adapter '${adapter}' does not support build target '${target}'.`);
  }
  if (targets.includes('static') && !targets.includes('browser')) throw new TypeError('Static generation requires the browser target.');
  if (targets.includes('static') && !targets.includes('server')) throw new TypeError('Static generation requires the server renderer target.');
  if (targets.includes('library') && targets.length > 1) throw new TypeError('Library builds cannot be combined with application targets.');
}

function deduplicate<T>(values: readonly T[]): T[] { return [...new Set(values)]; }

function assertContainedDirectory(root: string, directory: string, name: string, allowRoot: boolean): void {
  const relative = path.relative(root, directory);
  if (path.isAbsolute(relative) || relative.startsWith('..')) throw new TypeError(`VX ${name} must remain inside the project root.`);
  if (!allowRoot && relative === '') throw new TypeError(`VX ${name} cannot be the project root.`);
}
