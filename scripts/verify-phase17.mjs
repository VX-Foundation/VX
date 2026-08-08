import assert from 'node:assert/strict';
import { contentHash, integrityHash } from '../packages/bundler/dist/assets/index.js';
import { normalizeBuildOptions } from '../packages/bundler/dist/build/index.js';
import { officialAdapters } from '../packages/bundler/dist/adapters/registry.js';
import { createRequestRuntime } from '../packages/runtime/dist/request-runtime.js';
import { createServerRenderContext, renderDocument } from '../packages/runtime/dist/server.js';

const bytes = new TextEncoder().encode('vx-phase-17');
assert.equal(contentHash(bytes), contentHash(bytes));
assert.match(integrityHash(bytes, 'sha384'), /^sha384-/);
const options = normalizeBuildOptions({
  root: process.cwd(),
  targets: ['browser', 'server'],
  sourceMaps: 'hidden',
  incremental: true,
  bundleAnalysis: true,
  chunkPolicy: { maxInitialBytes: 1024 }
});
assert.deepEqual(options.targets, ['browser', 'server']);
const staticOptions = normalizeBuildOptions({ root: process.cwd(), adapter: 'static', targets: ['browser', 'server', 'static'] });
assert.deepEqual(staticOptions.targets, ['browser', 'server', 'static']);
const edgeOptions = normalizeBuildOptions({ root: process.cwd(), adapter: 'edge', targets: ['browser', 'edge'] });
assert.deepEqual(edgeOptions.targets, ['browser', 'edge']);
const libraryOptions = normalizeBuildOptions({ root: process.cwd(), targets: ['library'], library: { entry: 'src/index.ts' } });
assert.deepEqual(libraryOptions.targets, ['library']);
assert.equal(options.sourceMaps, 'hidden');
assert.equal(options.chunkPolicy.maxInitialBytes, 1024);
assert.deepEqual(officialAdapters().map((adapter) => adapter.name).sort(), [
  'aws-lambda', 'bun', 'cloudflare-pages', 'cloudflare-workers', 'deno', 'docker',
  'edge', 'netlify', 'node', 'serverless', 'static', 'vercel'
]);

const runtime = createRequestRuntime({ requestId: 'phase17-contract', applicationId: 'vx' });
const context = createServerRenderContext({ runtime, routeId: 'home', requestURL: new URL('https://vx.veelv.site/'), hydration: 'full' });
const result = renderDocument({
  context,
  html: '<main>VX</main>',
  clientEntry: '/assets/client.js',
  clientEntryIntegrity: 'sha384-client',
  styleAssets: [{ href: '/assets/app.css', integrity: 'sha384-style', crossOrigin: 'anonymous' }],
  resourceHints: [{ relation: 'preload', href: '/assets/font.woff2', as: 'font', crossOrigin: 'anonymous' }]
});
assert.match(result.html, /integrity="sha384-client"/);
assert.match(result.html, /rel="preload"/);
assert.match(result.html, /app\.css/);
context.dispose();
runtime.dispose();
console.log('Phase 17 behavioral verification passed (hashing, target normalization, adapters, SRI, SSR, and resource hints).');
