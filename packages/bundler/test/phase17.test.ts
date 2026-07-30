import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyAsset,
  contentHash,
  generateResponsiveImageVariants,
  inspectAssetMetadata,
  integrityHash,
  optimizeAsset,
  responsiveSrcSet,
  runAssetPipeline
} from '../src/assets/index.js';
import { analyzeBuild, normalizeBuildOptions } from '../src/build/index.js';
import { normalizeLibraryEntries, normalizeLibraryFileName } from '../src/build/library.js';
import { consumeBrowserAssetGraph } from '../src/build/browser-manifest.js';
import { adapterCapabilities, officialAdapters, runDeploymentAdapter } from '../src/adapters/registry.js';
import { readDeploymentBootstrap } from '../src/adapters/bootstrap.js';

const temporaryDirectories: string[] = [];
function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-phase17-'));
  temporaryDirectories.push(directory);
  return directory;
}
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Phase 17 asset pipeline', () => {
  it('classifies every normative asset family', () => {
    expect(classifyAsset('hero.avif')).toBe('image');
    expect(classifyAsset('brand.woff2')).toBe('font');
    expect(classifyAsset('icon-check.svg')).toBe('icon');
    expect(classifyAsset('movie.webm')).toBe('video');
    expect(classifyAsset('sound.opus')).toBe('audio');
    expect(classifyAsset('theme.css')).toBe('css');
    expect(classifyAsset('search.worker.js')).toBe('worker');
    expect(classifyAsset('engine.wasm')).toBe('wasm');
  });

  it('creates deterministic content hashes and subresource integrity', () => {
    const content = new TextEncoder().encode('VX deterministic asset');
    expect(contentHash(content)).toBe(contentHash(content));
    expect(contentHash(content)).toHaveLength(16);
    expect(integrityHash(content, 'sha384')).toMatch(/^sha384-/);
  });

  it('optimizes SVG and preserves image metadata', () => {
    const source = new TextEncoder().encode('<svg width="64" height="32">\n<!-- comment --><path d="M0 0" />\n</svg>');
    const optimized = optimizeAsset('logo.svg', source);
    expect(new TextDecoder().decode(optimized)).not.toContain('comment');
    expect(inspectAssetMetadata('logo.svg', optimized)).toMatchObject({ width: 64, height: 32, mediaType: 'image/svg+xml' });
  });

  it('emits preserved and hashed public assets with stable manifests', async () => {
    const root = temporaryDirectory();
    const publicDir = path.join(root, 'public');
    const clientDir = path.join(root, 'dist', 'client');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, 'robots.txt'), 'User-agent: *\n');
    fs.writeFileSync(path.join(publicDir, 'brand.svg'), '<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>');
    fs.mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(clientDir, 'assets', 'vx-client-deadbeef.js'), 'export const vx = true;\n');
    fs.writeFileSync(path.join(clientDir, 'assets', 'theme.css'), ':root{color-scheme:light dark}');
    fs.writeFileSync(path.join(clientDir, 'assets', 'route.css'), '.route{display:block}');

    const first = await runAssetPipeline({
      root, clientDir, publicDir, publicAssetMode: 'both', integrity: 'sha384', optimize: true,
      preload: true, prefetch: true, criticalAssets: ['/assets/vx-client-deadbeef.js', '/assets/theme.css', '/assets/app.css'], responsiveImages: []
    });
    const firstManifest = fs.readFileSync(first.manifestPath, 'utf8');
    const second = await runAssetPipeline({
      root, clientDir, publicDir, publicAssetMode: 'both', integrity: 'sha384', optimize: true,
      preload: true, prefetch: true, criticalAssets: ['/assets/vx-client-deadbeef.js', '/assets/theme.css', '/assets/app.css'], responsiveImages: []
    });
    expect(fs.readFileSync(second.manifestPath, 'utf8')).toBe(firstManifest);
    expect(second.manifest.assets.some((asset) => asset.outputPath === 'robots.txt')).toBe(true);
    expect(second.manifest.assets.some((asset) => /^robots\.[a-f0-9]{16}\.txt$/.test(asset.outputPath))).toBe(true);
    expect(second.manifest.assets.every((asset) => asset.integrity?.startsWith('sha384-'))).toBe(true);
    expect(second.hints.entry.some((hint) => hint.href === '/assets/vx-client-deadbeef.js')).toBe(true);
    expect(second.hints.entry.some((hint) => hint.href === '/assets/theme.css')).toBe(true);
    expect(second.hints.entry.some((hint) => hint.href === '/assets/route.css')).toBe(false);
    expect(readDeploymentBootstrap(clientDir, '/assets/vx-client-deadbeef.js').styleAssets).toEqual([expect.objectContaining({ href: '/assets/theme.css' })]);
  });

  it('refuses sensitive public files before copying output', async () => {
    const root = temporaryDirectory();
    const publicDir = path.join(root, 'public');
    const clientDir = path.join(root, 'dist', 'client');
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, '.env.production'), 'SECRET=value');
    await expect(runAssetPipeline({
      root, clientDir, publicDir, publicAssetMode: 'both', integrity: 'sha384', optimize: true,
      preload: true, prefetch: true, criticalAssets: ['/assets/vx-client-deadbeef.js', '/assets/theme.css', '/assets/app.css'], responsiveImages: []
    })).rejects.toThrow(/Sensitive configuration/);
  });

  it('generates responsive variants through a codec-neutral transformer', async () => {
    const output = temporaryDirectory();
    const variants = await generateResponsiveImageVariants(
      { sourcePath: 'hero.png', widths: [800, 320, 800], formats: ['webp'], quality: 80 },
      new Uint8Array([1, 2, 3]), output, '/assets/images',
      async ({ width, format }) => new TextEncoder().encode(`${width}:${format}`),
      'sha256'
    );
    expect(variants.map((variant) => variant.width)).toEqual([320, 800]);
    expect(responsiveSrcSet(variants, 'webp')).toContain('320w');
    expect(variants.every((variant) => variant.integrity?.startsWith('sha256-'))).toBe(true);
  });
});

describe('Phase 17 build graph and adapters', () => {
  it('derives critical assets from the static browser entry graph', () => {
    const clientDir = temporaryDirectory();
    fs.mkdirSync(path.join(clientDir, '.vx'), { recursive: true });
    fs.writeFileSync(path.join(clientDir, '.vx', 'manifest.json'), JSON.stringify({
      'virtual:vx-browser-app': { file: 'assets/vx-client-deadbeef.js', isEntry: true, imports: ['runtime.js'], css: ['assets/app-deadbeef.css'] },
      'runtime.js': { file: 'assets/runtime-deadbeef.js', css: ['assets/runtime-deadbeef.css'], dynamicImports: ['route.js'] },
      'route.js': { file: 'assets/route-deadbeef.js', css: ['assets/route-deadbeef.css'] }
    }));
    const graph = consumeBrowserAssetGraph(clientDir);
    expect(graph.clientEntry).toBe('/assets/vx-client-deadbeef.js');
    expect(graph.criticalAssets).toEqual([
      '/assets/app-deadbeef.css', '/assets/runtime-deadbeef.css', '/assets/runtime-deadbeef.js', '/assets/vx-client-deadbeef.js'
    ]);
    expect(graph.criticalAssets).not.toContain('/assets/route-deadbeef.js');
    expect(fs.existsSync(path.join(clientDir, '.vx'))).toBe(false);
  });

  it('normalizes production builds and adapter-owned targets', () => {
    const root = temporaryDirectory();
    const node = normalizeBuildOptions({ root, adapter: 'node' });
    const workers = normalizeBuildOptions({ root, adapter: 'cloudflare-workers' });
    expect(node.targets).toEqual(['browser', 'server']);
    expect(workers.targets).toEqual(['browser', 'edge']);
    expect(node.deterministic).toBe(true);
    expect(node.reproducible).toBe(true);
    expect(node.sourceMaps).toBe('hidden');
    expect(node.assets.integrity).toBe('sha384');
    expect(node.assets.prefetch).toBe(false);
    expect(() => normalizeBuildOptions({ root, adapter: 'cloudflare-workers', targets: ['server'] })).toThrow(/does not support/);
    expect(() => normalizeBuildOptions({ root, outDir: '..', adapter: 'node' })).toThrow(/project-relative|inside the project root/);
    expect(() => normalizeBuildOptions({ root, adapter: 'node', assets: { publicDir: '.' } })).toThrow(/cannot be the project root/);
    expect(() => normalizeBuildOptions({ root, adapter: 'node', chunkPolicy: { maxChunkBytes: -1 } })).toThrow(/positive safe integer/);
  });

  it('creates collision-free multi-entry library outputs', () => {
    const root = temporaryDirectory();
    const entries = normalizeLibraryEntries(root, [
      'src/components/Card.vx',
      'src/modules/labels.vx',
      'src/legacy/Card.vx'
    ]);
    expect(typeof entries).toBe('object');
    expect(Object.keys(entries as Record<string, string>)).toEqual(['Card', 'labels', 'legacy-Card']);
    const fileName = normalizeLibraryFileName(entries, 'vx-ui.js');
    expect(typeof fileName).toBe('function');
    const resolveName = fileName as (format: string, entryName: string) => string;
    expect(resolveName('es', 'Card')).toBe('vx-ui-Card.js');
    expect(resolveName('cjs', 'legacy-Card')).toBe('vx-ui-legacy-Card.cjs');
  });

  it('registers all official deployment platforms and aliases', () => {
    const names = officialAdapters().map((adapter) => adapter.name);
    expect(names).toEqual(expect.arrayContaining([
      'node', 'docker', 'static', 'cloudflare-workers', 'cloudflare-pages', 'vercel',
      'netlify', 'aws-lambda', 'serverless', 'bun', 'deno', 'edge'
    ]));
    expect(adapterCapabilities('node-standalone').name).toBe('node');
    expect(adapterCapabilities('generic-serverless').name).toBe('serverless');
    expect(adapterCapabilities('edge-runtime').name).toBe('edge');
  });

  it('emits portable deployment contracts', async () => {
    const outDir = temporaryDirectory();
    const clientDir = path.join(outDir, 'client');
    const serverDir = path.join(outDir, 'server');
    const edgeDir = path.join(outDir, 'edge');
    fs.mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
    fs.mkdirSync(serverDir, { recursive: true });
    fs.mkdirSync(edgeDir, { recursive: true });
    fs.writeFileSync(path.join(clientDir, 'assets', 'vx-client-deadbeef.js'), 'export{}');
    fs.writeFileSync(path.join(clientDir, 'vx.assets.json'), JSON.stringify({ version: 1, assets: [] }));
    fs.writeFileSync(path.join(clientDir, 'vx.hints.json'), JSON.stringify({ version: 1, entry: [], deferred: [] }));
    const serverEntry = path.join(serverDir, 'vx-server.mjs');
    const launcher = path.join(serverDir, 'server.mjs');
    const edgeEntry = path.join(edgeDir, 'vx-edge.mjs');
    fs.writeFileSync(serverEntry, `export const routes = []; export function createVXServerApplication(){ return { render: async () => new Response('<h1>VX</h1>') }; } export default createVXServerApplication;`);
    fs.writeFileSync(launcher, 'export{}');
    fs.writeFileSync(edgeEntry, 'export default () => ({ handle: fetch });');
    const context = { outDir, clientDir, serverEntry, edgeEntry, clientEntry: '/assets/vx-client-deadbeef.js', options: {} };
    for (const name of ['node', 'docker', 'static', 'cloudflare-workers', 'cloudflare-pages', 'vercel', 'netlify', 'aws-lambda', 'serverless', 'bun', 'deno', 'edge']) {
      const result = await runDeploymentAdapter(name, context);
      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files.every((file) => fs.existsSync(file))).toBe(true);
    }
  });

  it('analyzes output and reports chunk-policy violations', () => {
    const root = temporaryDirectory();
    const options = normalizeBuildOptions({
      root,
      outDir: 'dist',
      adapter: 'node',
      chunkPolicy: { maxChunkBytes: 8, maxInitialBytes: 8, maxAsyncBytes: 8, maxChunkCount: 1 }
    });
    fs.mkdirSync(path.join(options.outDir, 'client', 'assets'), { recursive: true });
    fs.writeFileSync(path.join(options.outDir, 'client', 'assets', 'vx-client-deadbeef.js'), '0123456789abcdef');
    fs.writeFileSync(path.join(options.outDir, 'client', 'assets', 'extra-deadbeef.js'), '0123456789abcdef');
    const analysis = analyzeBuild(options);
    expect(analysis.artifacts).toHaveLength(2);
    expect(analysis.violations.length).toBeGreaterThan(0);
    expect(analysis.totals['browser']?.files).toBe(2);
  });
});
