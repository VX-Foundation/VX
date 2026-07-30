import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  classifyAsset,
  contentHash,
  generateResponsiveImageVariants,
  inspectAssetMetadata,
  integrityHash,
  responsiveSrcSet,
  runAssetPipeline
} from '../packages/bundler/dist/assets/index.js';
import { analyzeBuild, normalizeBuildOptions } from '../packages/bundler/dist/build/index.js';
import { consumeBrowserAssetGraph } from '../packages/bundler/dist/build/browser-manifest.js';
import { officialAdapters, runDeploymentAdapter } from '../packages/bundler/dist/adapters/registry.js';
import { readDeploymentBootstrap } from '../packages/bundler/dist/adapters/bootstrap.js';
import { createRequestRuntime } from '../packages/runtime/dist/request-runtime.js';
import { createServerRenderContext, renderDocument } from '../packages/runtime/dist/server.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-phase17-runtime-'));
try {
  assert.equal(classifyAsset('engine.wasm'), 'wasm');
  assert.equal(classifyAsset('thumbnail.webp'), 'image');
  const content = new TextEncoder().encode('phase-17');
  assert.equal(contentHash(content), contentHash(content));
  assert.match(integrityHash(content, 'sha384'), /^sha384-/);
  assert.deepEqual(inspectAssetMetadata('logo.svg', new TextEncoder().encode('<svg viewBox="0 0 40 20"></svg>')), { width: 40, height: 20, format: 'svg', mediaType: 'image/svg+xml' });

  const variants = await generateResponsiveImageVariants(
    { sourcePath: 'hero.png', widths: [640, 320], formats: ['webp'] },
    content,
    path.join(root, 'variants'),
    '/assets/images',
    async ({ width }) => new TextEncoder().encode(`width:${width}`),
    'sha256'
  );
  assert.equal(variants.length, 2);
  assert.match(responsiveSrcSet(variants), /320w.*640w/);

  const graphDirectory = path.join(root, 'browser-graph');
  fs.mkdirSync(path.join(graphDirectory, '.vx'), { recursive: true });
  fs.writeFileSync(path.join(graphDirectory, '.vx', 'manifest.json'), JSON.stringify({
    entry: { file: 'assets/vx-client-deadbeef.js', isEntry: true, imports: ['runtime'], css: ['assets/app.css'] },
    runtime: { file: 'assets/runtime-deadbeef.js', dynamicImports: ['route'] },
    route: { file: 'assets/route-deadbeef.js', css: ['assets/route.css'] }
  }));
  const browserGraph = consumeBrowserAssetGraph(graphDirectory);
  assert.equal(browserGraph.clientEntry, '/assets/vx-client-deadbeef.js');
  assert.ok(browserGraph.criticalAssets.includes('/assets/runtime-deadbeef.js'));
  assert.ok(!browserGraph.criticalAssets.includes('/assets/route-deadbeef.js'));
  assert.equal(fs.existsSync(path.join(graphDirectory, '.vx')), false);

  const publicDir = path.join(root, 'public');
  const clientDir = path.join(root, 'dist', 'client');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(path.join(clientDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicDir, 'icon.svg'), '<svg width="16" height="16"></svg>');
  fs.writeFileSync(path.join(clientDir, 'assets', 'vx-client-deadbeef.js'), 'export{}');
  fs.writeFileSync(path.join(clientDir, 'assets', 'app.css'), 'body{margin:0}');
  fs.writeFileSync(path.join(clientDir, 'assets', 'route-deadbeef.js'), 'export{}');
  fs.writeFileSync(path.join(clientDir, 'assets', 'route.css'), '.route{display:block}');
  const assets = await runAssetPipeline({ root, clientDir, publicDir, publicAssetMode: 'both', integrity: 'sha384', optimize: true, preload: true, prefetch: true, criticalAssets: ['/assets/vx-client-deadbeef.js', '/assets/theme.css', '/assets/app.css'], responsiveImages: [] });
  assert.ok(assets.manifest.assets.length >= 4);
  assert.ok(assets.hints.entry.some((hint) => hint.href === '/assets/vx-client-deadbeef.js'));
  assert.ok(assets.hints.entry.some((hint) => hint.href === '/assets/app.css'));
  assert.ok(!assets.hints.entry.some((hint) => hint.href === '/assets/route.css'));
  assert.ok(assets.hints.deferred.some((hint) => hint.href === '/assets/route-deadbeef.js'));
  const bootstrap = readDeploymentBootstrap(clientDir, '/assets/vx-client-deadbeef.js');
  assert.deepEqual(bootstrap.styleAssets?.map((style) => style.href), ['/assets/app.css']);
  const withoutPreload = await runAssetPipeline({ root, clientDir, publicDir, publicAssetMode: 'both', integrity: 'sha384', optimize: true, preload: false, prefetch: false, criticalAssets: ['/assets/vx-client-deadbeef.js', '/assets/app.css'], responsiveImages: [] });
  assert.equal(withoutPreload.hints.entry.length, 0);
  assert.deepEqual(readDeploymentBootstrap(clientDir, '/assets/vx-client-deadbeef.js').styleAssets?.map((style) => style.href), ['/assets/app.css']);

  const runtime = createRequestRuntime({ requestId: 'phase17', applicationId: 'vx' });
  const context = createServerRenderContext({ runtime, routeId: 'home', requestURL: new URL('https://vx.test/'), hydration: 'full' });
  const rendered = renderDocument({
    context,
    html: '<h1>VX</h1>',
    clientEntry: '/assets/vx-client-deadbeef.js',
    clientEntryIntegrity: 'sha384-client',
    styleAssets: [{ href: '/assets/app.css', integrity: 'sha384-style', crossOrigin: 'anonymous' }],
    resourceHints: [{ relation: 'preload', href: '/assets/brand.woff2', as: 'font', crossOrigin: 'anonymous', integrity: 'sha384-font' }]
  });
  assert.match(rendered.html, /integrity="sha384-client" crossorigin="anonymous"/);
  assert.match(rendered.html, /rel="preload"/);
  assert.match(rendered.html, /href="\/assets\/app\.css"/);
  context.dispose();
  runtime.dispose();

  const buildOptions = normalizeBuildOptions({ root, outDir: 'analysis', adapter: 'node', chunkPolicy: { maxChunkBytes: 4 } });
  fs.mkdirSync(path.join(buildOptions.outDir, 'client', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(buildOptions.outDir, 'client', 'assets', 'vx-client-deadbeef.js'), '0123456789');
  assert.ok(analyzeBuild(buildOptions).violations.length > 0);
  assert.equal(officialAdapters().length, 12);

  const adapterOut = path.join(root, 'adapter');
  const adapterClient = path.join(adapterOut, 'client');
  const adapterServer = path.join(adapterOut, 'server');
  const adapterEdge = path.join(adapterOut, 'edge');
  fs.mkdirSync(path.join(adapterClient, 'assets'), { recursive: true });
  fs.mkdirSync(adapterServer, { recursive: true });
  fs.mkdirSync(adapterEdge, { recursive: true });
  fs.writeFileSync(path.join(adapterClient, 'vx.assets.json'), JSON.stringify({ version: 1, assets: [] }));
  fs.writeFileSync(path.join(adapterClient, 'vx.hints.json'), JSON.stringify({ version: 1, entry: [], deferred: [] }));
  fs.writeFileSync(path.join(adapterClient, 'assets', 'vx-client-deadbeef.js'), 'export{}');
  const serverEntry = path.join(adapterServer, 'vx-server.mjs');
  const edgeEntry = path.join(adapterEdge, 'vx-edge.mjs');
  fs.writeFileSync(serverEntry, `export const routes = []; export function createVXServerApplication(){ return { render: async () => new Response('<h1>VX</h1>') }; } export default createVXServerApplication;`);
  fs.writeFileSync(path.join(adapterServer, 'server.mjs'), 'export{}');
  fs.writeFileSync(edgeEntry, 'export default () => ({ handle: fetch });');
  const deploymentContext = { outDir: adapterOut, clientDir: adapterClient, serverEntry, edgeEntry, clientEntry: '/assets/vx-client-deadbeef.js', options: {} };
  for (const name of ['node', 'docker', 'static', 'cloudflare-workers', 'cloudflare-pages', 'vercel', 'netlify', 'aws-lambda', 'serverless', 'bun', 'deno', 'edge']) {
    const result = await runDeploymentAdapter(name, deploymentContext);
    assert.ok(result.files.length > 0, `${name} emitted no files.`);
    for (const file of result.files.filter((entry) => /\.(?:mjs|js)$/.test(entry))) {
      const checked = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      assert.equal(checked.status, 0, `${name} emitted invalid JavaScript at ${file}: ${checked.stderr}`);
    }
  }

  console.log('Phase 17 runtime verification passed (entry graph, assets, SRI, SSR hints, analysis, and 12 deployment emitters).');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
