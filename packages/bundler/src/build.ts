import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build as viteBuild, type LibraryFormats, type UserConfig } from 'vite';
import { buildApplicationGraph, generateApplicationModules } from '@vx/router';
import { runAssetPipeline } from './assets/pipeline.js';
import { runDeploymentAdapter } from './adapters/registry.js';
import type { DeploymentContext, DeploymentResult } from './adapters/types.js';
import { analyzeBuild, writeBundleAnalysis } from './build/analysis.js';
import { consumeBrowserAssetGraph, type BrowserAssetGraph } from './build/browser-manifest.js';
import { readBuildCache, writeBuildCache, writeBuildMetadata } from './build/cache.js';
import { artifactFingerprint, sourceFingerprint } from './build/fingerprint.js';
import { normalizeBuildOptions } from './build/options.js';
import { normalizeLibraryEntries, normalizeLibraryFileName } from './build/library.js';
import type { BuildMetadata, BuildOptions, BuildResult, NormalizedBuildOptions } from './build/types.js';
import { vitePluginVX } from './plugin.js';

export type { BuildOptions, BuildResult, LibraryBuildOptions } from './build/types.js';

/** Orchestrates deterministic application, edge, static, and library builds. */
export async function build(input: BuildOptions): Promise<BuildResult> {
  const options = normalizeBuildOptions(input);
  const sourceHash = sourceFingerprint(options.root, sourceConfiguration(options), [options.outDir]);
  const cached = options.incremental ? readBuildCache(options.root) : undefined;
  const reused = reuseCachedBuild(options, cached, sourceHash);
  if (reused) return reused;

  const previousSourceMatch = cached?.sourceFingerprint === sourceHash ? cached.artifactFingerprint : undefined;
  fs.rmSync(options.outDir, { recursive: true, force: true });
  fs.mkdirSync(options.outDir, { recursive: true });

  const previousEpoch = process.env['SOURCE_DATE_EPOCH'];
  if (options.deterministic && previousEpoch === undefined) process.env['SOURCE_DATE_EPOCH'] = '1704067200';
  try {
    const result = options.targets.includes('library')
      ? await buildLibrary(options)
      : await buildApplication(options);
    const analysis = options.bundleAnalysis ? analyzeBuild(options) : undefined;
    const analysisPath = analysis ? writeBundleAnalysis(options.outDir, analysis) : undefined;
    const outputHash = artifactFingerprint(options.outDir);
    if (options.reproducible && previousSourceMatch && previousSourceMatch !== outputHash) {
      throw new Error(`Reproducible build violation: identical sources produced ${outputHash} instead of ${previousSourceMatch}.`);
    }
    const metadata: BuildMetadata = Object.freeze({
      version: 1,
      mode: options.mode,
      adapter: options.adapter.name,
      targets: options.targets,
      sourceFingerprint: sourceHash,
      artifactFingerprint: outputHash,
      deterministic: options.deterministic,
      reproducible: options.reproducible
    });
    const metadataPath = writeBuildMetadata(options.outDir, metadata);
    const completed: BuildResult = {
      ...result,
      ...(analysisPath ? { analysis: analysisPath } : {}),
      metadata: metadataPath,
      reused: false
    };
    if (options.incremental) writeBuildCache(options.root, { sourceFingerprint: sourceHash, artifactFingerprint: outputHash, result: serializableResult(completed) });
    return completed;
  } finally {
    if (previousEpoch === undefined) delete process.env['SOURCE_DATE_EPOCH'];
    else process.env['SOURCE_DATE_EPOCH'] = previousEpoch;
  }
}

async function buildApplication(options: NormalizedBuildOptions): Promise<Omit<BuildResult, 'metadata' | 'reused' | 'analysis'>> {
  const graph = buildApplicationGraph({ dir: path.join(options.root, options.pagesDir), rootDir: options.root });
  const routeError = graph.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (routeError) throw new Error(`[${routeError.code}] ${routeError.message}`);
  const plugin = () => vitePluginVX({ root: options.root, pagesDir: options.pagesDir });

  let browserGraph: BrowserAssetGraph | undefined;
  if (options.targets.includes('browser')) {
    const clientOutput = path.join(options.outDir, 'client');
    await viteBuild(browserConfig(options, plugin()));
    if (options.sourceMaps === 'hidden') relocateHiddenBrowserSourceMaps(clientOutput, path.join(options.outDir, 'maps', 'browser'));
    browserGraph = consumeBrowserAssetGraph(clientOutput);
  }
  if (options.targets.includes('server')) await viteBuild(serverConfig(options, plugin()));
  if (options.targets.includes('edge')) await viteBuild(edgeConfig(options, plugin()));

  const routeManifest = path.join(options.outDir, 'vx.routes.json');
  fs.writeFileSync(routeManifest, `${generateApplicationModules(graph).manifest}\n`);
  const clientDir = path.join(options.outDir, 'client');
  const clientEntry = browserGraph?.clientEntry;
  const serverEntry = options.targets.includes('server') ? path.join(options.outDir, 'server', 'vx-server.mjs') : undefined;
  const edgeEntry = options.targets.includes('edge') ? path.join(options.outDir, 'edge', 'vx-edge.mjs') : undefined;
  if (options.targets.includes('browser')) runClientSecurityReport(clientDir);
  if (edgeEntry) runEdgeCompatibilityReport(path.dirname(edgeEntry));

  let assetResult: Awaited<ReturnType<typeof runAssetPipeline>> | undefined;
  if (options.targets.includes('browser')) {
    assetResult = await runAssetPipeline({
      root: options.root,
      clientDir,
      publicDir: options.publicDir,
      publicAssetMode: options.assets.publicAssetMode,
      integrity: options.assets.integrity,
      optimize: options.assets.optimize,
      preload: options.assets.preload,
      prefetch: options.assets.prefetch,
      criticalAssets: browserGraph?.criticalAssets ?? Object.freeze([]),
      responsiveImages: options.assets.responsiveImages.map((request) => ({
        sourcePath: request.source,
        widths: request.widths,
        ...(request.formats ? { formats: request.formats } : {}),
        ...(request.quality !== undefined ? { quality: request.quality } : {})
      }))
    });
  }

  let deployment: DeploymentResult | undefined;
  if (!options.targets.includes('library')) {
    deployment = await runConfiguredAdapter(options, {
      outDir: options.outDir,
      clientDir,
      ...(serverEntry ? { serverEntry } : {}),
      ...(edgeEntry ? { edgeEntry } : {}),
      clientEntry: clientEntry ?? '/assets/vx-client.js',
      options: options.adapter.options ?? Object.freeze({})
    });
  }

  return {
    outDir: options.outDir,
    adapter: deployment?.name ?? options.adapter.name,
    targets: options.targets,
    routeManifest,
    ...(serverEntry ? { serverEntry } : {}),
    ...(edgeEntry ? { edgeEntry } : {}),
    ...(clientEntry ? { clientEntry } : {}),
    ...(assetResult ? { assetManifest: assetResult.manifestPath, resourceHints: assetResult.hintsPath, assets: assetResult.manifest, hints: assetResult.hints } : {})
  };
}

async function buildLibrary(options: NormalizedBuildOptions): Promise<Omit<BuildResult, 'metadata' | 'reused' | 'analysis'>> {
  const library = options.library ?? {};
  const entry = normalizeLibraryEntries(options.root, library.entry ?? path.join(options.srcDir, 'index.ts'));
  const formats = (library.formats?.length ? [...library.formats] : ['es']) as LibraryFormats[];
  await viteBuild({
    root: options.root,
    publicDir: false,
    mode: options.mode,
    plugins: [vitePluginVX({ root: options.root })],
    build: {
      outDir: path.join(options.outDir, 'library'),
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: viteSourceMap(options.sourceMaps),
      minify: options.mode === 'production' ? 'esbuild' : false,
      lib: {
        entry,
        ...(library.name ? { name: library.name } : {}),
        formats,
        fileName: normalizeLibraryFileName(entry, library.fileName)
      },
      rollupOptions: { external: [...(library.external ?? [])] }
    }
  });
  return { outDir: options.outDir, adapter: 'library', targets: options.targets };
}

function browserConfig(options: NormalizedBuildOptions, plugin: ReturnType<typeof vitePluginVX>): UserConfig {
  return {
    root: options.root,
    publicDir: false,
    mode: options.mode,
    plugins: [plugin],
    optimizeDeps: dependencyOptimization(options),
    build: {
      outDir: path.join(options.outDir, 'client'),
      manifest: '.vx/manifest.json',
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: viteSourceMap(options.sourceMaps),
      minify: options.mode === 'production' ? 'esbuild' : false,
      cssCodeSplit: true,
      assetsInlineLimit: options.assets.inlineLimitBytes,
      rollupOptions: {
        input: 'virtual:vx-browser-app',
        output: {
          entryFileNames: 'assets/vx-client-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
          manualChunks: stableManualChunks,
          experimentalMinChunkSize: options.chunkPolicy.minimumSharedBytes
        }
      }
    }
  };
}

function serverConfig(options: NormalizedBuildOptions, plugin: ReturnType<typeof vitePluginVX>): UserConfig {
  return {
    root: options.root,
    publicDir: false,
    mode: options.mode,
    plugins: [plugin],
    ssr: { noExternal: true },
    build: {
      outDir: path.join(options.outDir, 'server'),
      ssr: true,
      emptyOutDir: true,
      target: 'node20',
      sourcemap: viteSourceMap(options.sourceMaps),
      minify: options.mode === 'production' ? 'esbuild' : false,
      rollupOptions: {
        input: { 'vx-server': 'virtual:vx-server-app', server: 'virtual:vx-node-app' },
        output: { format: 'es', entryFileNames: '[name].mjs', chunkFileNames: 'chunks/[name]-[hash].mjs', assetFileNames: 'assets/[name]-[hash][extname]' }
      }
    }
  };
}

function edgeConfig(options: NormalizedBuildOptions, plugin: ReturnType<typeof vitePluginVX>): UserConfig {
  return {
    root: options.root,
    publicDir: false,
    mode: options.mode,
    plugins: [plugin],
    ssr: { noExternal: true },
    define: { 'process.env.NODE_ENV': JSON.stringify(options.mode) },
    build: {
      outDir: path.join(options.outDir, 'edge'),
      ssr: 'virtual:vx-edge-app',
      emptyOutDir: true,
      target: 'es2022',
      sourcemap: viteSourceMap(options.sourceMaps),
      minify: options.mode === 'production' ? 'esbuild' : false,
      rollupOptions: {
        input: 'virtual:vx-edge-app',
        output: { format: 'es', entryFileNames: 'vx-edge.mjs', chunkFileNames: 'chunks/[name]-[hash].mjs', assetFileNames: 'assets/[name]-[hash][extname]' }
      }
    }
  };
}

async function runConfiguredAdapter(options: NormalizedBuildOptions, context: DeploymentContext): Promise<DeploymentResult> {
  const moduleReference = options.adapter.options?.['module'];
  let result: DeploymentResult;
  if (typeof moduleReference !== 'string') result = await runDeploymentAdapter(options.adapter.name, context);
  else {
    const specifier = moduleReference.startsWith('.') || path.isAbsolute(moduleReference)
      ? pathToFileURL(path.resolve(options.root, moduleReference)).href
      : moduleReference;
    const loaded: unknown = await import(specifier);
    const candidate = (loaded as Record<string, unknown>)['default'] ?? loaded;
    if (typeof candidate === 'function') result = await candidate(context) as DeploymentResult;
    else if (candidate && typeof candidate === 'object' && typeof (candidate as Record<string, unknown>)['deploy'] === 'function') {
      result = await ((candidate as { deploy(context: DeploymentContext): Promise<DeploymentResult> | DeploymentResult }).deploy(context));
    } else throw new TypeError(`Custom adapter '${moduleReference}' must export a deployment function or an object with deploy().`);
  }
  return validateDeploymentResult(result, options.outDir);
}

function validateDeploymentResult(result: DeploymentResult, outDir: string): DeploymentResult {
  if (!result || typeof result !== 'object' || typeof result.name !== 'string' || result.name.trim().length === 0 || !Array.isArray(result.files)) {
    throw new TypeError('VX deployment adapter returned an invalid result.');
  }
  const root = path.resolve(outDir);
  const files = result.files.map((entry) => {
    if (typeof entry !== 'string' || entry.length === 0) throw new TypeError(`Adapter '${result.name}' returned an invalid file path.`);
    const filePath = path.resolve(root, entry);
    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) throw new Error(`Adapter '${result.name}' emitted outside the build output: '${entry}'.`);
    if (!fs.existsSync(filePath) || fs.lstatSync(filePath).isSymbolicLink()) throw new Error(`Adapter '${result.name}' did not emit a regular artifact: '${entry}'.`);
    return filePath;
  });
  const primaryEntry = result.primaryEntry === undefined ? undefined : path.resolve(root, result.primaryEntry);
  if (primaryEntry && primaryEntry !== root && !primaryEntry.startsWith(`${root}${path.sep}`)) throw new Error(`Adapter '${result.name}' primary entry escapes the build output.`);
  return Object.freeze({ name: result.name, ...(primaryEntry ? { primaryEntry } : {}), files: Object.freeze(files) });
}

function dependencyOptimization(options: NormalizedBuildOptions): NonNullable<UserConfig['optimizeDeps']> {
  if (!options.dependencyOptimization.enabled) return { noDiscovery: true, include: [] } as NonNullable<UserConfig['optimizeDeps']>;
  return {
    include: [...options.dependencyOptimization.include],
    exclude: [...options.dependencyOptimization.exclude],
    force: options.dependencyOptimization.force
  };
}

function stableManualChunks(id: string): string | undefined {
  const normalized = id.replaceAll('\\', '/');
  if (normalized.includes('/@vx/runtime/')) return 'vx-runtime';
  if (normalized.includes('/@vx/router/')) return 'vx-router';
  const marker = normalized.lastIndexOf('/node_modules/');
  if (marker < 0) return undefined;
  const dependency = normalized.slice(marker + '/node_modules/'.length).split('/');
  const name = dependency[0]?.startsWith('@') ? `${dependency[0]}-${dependency[1] ?? 'package'}` : dependency[0] ?? 'vendor';
  return `vendor-${name.replace(/[^A-Za-z0-9_-]+/g, '-')}`;
}

function viteSourceMap(value: NormalizedBuildOptions['sourceMaps']): boolean | 'inline' | 'hidden' {
  if (value === false) return false;
  if (value === 'inline') return 'inline';
  if (value === 'hidden') return 'hidden';
  return true;
}

function relocateHiddenBrowserSourceMaps(clientDir: string, mapsDir: string): void {
  for (const filePath of walkFiles(clientDir)) {
    if (!filePath.endsWith('.map')) continue;
    const relative = path.relative(clientDir, filePath);
    const target = path.join(mapsDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(filePath, target);
  }
}

function runClientSecurityReport(clientDir: string): void {
  for (const filePath of walkFiles(clientDir)) {
    if (!/\.(?:m?js)$/.test(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (content.includes('process.env.')) throw new Error(`SECURITY VIOLATION: process.env leaked into client chunk -> ${path.relative(clientDir, filePath)}`);
  }
}

function runEdgeCompatibilityReport(edgeDir: string): void {
  const violations: string[] = [];
  for (const filePath of walkFiles(edgeDir)) {
    if (!/\.(?:m?js)$/.test(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    const match = content.match(/(?:from\s*|import\s*\()(['"])node:[^'"]+\1/);
    if (match) violations.push(`${path.relative(edgeDir, filePath)} imports ${match[0]}.`);
    if (/\b(?:Buffer|process\.env|__dirname|require\s*\()/.test(content)) violations.push(`${path.relative(edgeDir, filePath)} contains a Node-only global.`);
  }
  if (violations.length) throw new AggregateError(violations.map((message) => new Error(message)), 'VX edge compatibility verification failed.');
}

function reuseCachedBuild(options: NormalizedBuildOptions, cached: ReturnType<typeof readBuildCache>, sourceHash: string): BuildResult | undefined {
  if (!cached || cached.sourceFingerprint !== sourceHash || !fs.existsSync(options.outDir)) return undefined;
  if (artifactFingerprint(options.outDir) !== cached.artifactFingerprint) return undefined;
  const result = cached.result;
  const metadata = path.join(options.outDir, 'vx.build.json');
  if (!fs.existsSync(metadata)) return undefined;
  const assetManifest = stringField(result, 'assetManifest');
  const resourceHints = stringField(result, 'resourceHints');
  const assets = assetManifest ? readJsonFile(assetManifest) : undefined;
  const hints = resourceHints ? readJsonFile(resourceHints) : undefined;
  return {
    outDir: String(result['outDir'] ?? options.outDir),
    adapter: String(result['adapter'] ?? options.adapter.name),
    targets: options.targets,
    ...(stringField(result, 'routeManifest') ? { routeManifest: stringField(result, 'routeManifest')! } : {}),
    ...(stringField(result, 'serverEntry') ? { serverEntry: stringField(result, 'serverEntry')! } : {}),
    ...(stringField(result, 'edgeEntry') ? { edgeEntry: stringField(result, 'edgeEntry')! } : {}),
    ...(stringField(result, 'clientEntry') ? { clientEntry: stringField(result, 'clientEntry')! } : {}),
    ...(assetManifest ? { assetManifest } : {}),
    ...(resourceHints ? { resourceHints } : {}),
    ...(stringField(result, 'analysis') ? { analysis: stringField(result, 'analysis')! } : {}),
    metadata,
    reused: true,
    ...(assets && assets['version'] === 1 ? { assets: assets as unknown as NonNullable<BuildResult['assets']> } : {}),
    ...(hints && hints['version'] === 1 ? { hints: hints as unknown as NonNullable<BuildResult['hints']> } : {})
  };
}

function readJsonFile(filePath: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch { return undefined; }
}

function serializableResult(result: BuildResult): Readonly<Record<string, unknown>> {
  const { assets: _assets, hints: _hints, reused: _reused, ...serializable } = result;
  return Object.freeze(serializable);
}
function stringField(value: Readonly<Record<string, unknown>>, key: string): string | undefined { return typeof value[key] === 'string' ? value[key] : undefined; }
function sourceConfiguration(options: NormalizedBuildOptions): unknown {
  return { adapter: options.adapter, mode: options.mode, targets: options.targets, sourceMaps: options.sourceMaps, deterministic: options.deterministic, reproducible: options.reproducible, chunkPolicy: options.chunkPolicy, dependencyOptimization: options.dependencyOptimization, assets: options.assets, library: options.library };
}
function walkFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  const output: string[] = [], stack = [directory];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full); else if (entry.isFile()) output.push(full);
    }
  }
  return output.sort();
}
