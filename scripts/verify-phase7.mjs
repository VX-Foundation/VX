import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parse } from '../packages/language/dist/index.js';
import { analyze, lower } from '../packages/compiler/dist/index.js';
import { buildApplicationGraph, generateApplicationModules } from '../packages/router/dist/index.js';
import { deserializeServerValue, serializeServerValue } from '../packages/runtime/dist/server.js';
import { runNodeAdapter } from '../packages/bundler/dist/adapters/node.js';
import { runStaticAdapter } from '../packages/bundler/dist/adapters/static.js';

const state = Object.assign(Object.create(null), {
  unsafe: '</script><script>alert(1)</script>',
  missing: undefined,
  count: 42n,
  date: new Date('2026-07-28T12:00:00.000Z'),
  url: new URL('https://vx.test/docs'),
  map: new Map([['role', 'admin']]),
  set: new Set(['ssr', 'hydration'])
});
const serialized = serializeServerValue(state);
assert.doesNotMatch(serialized, /<\/script|<script|</);
const restored = deserializeServerValue(serialized);
assert.equal(restored.unsafe, state.unsafe);
assert.equal(restored.missing, undefined);
assert.equal(restored.count, 42n);
assert.equal(restored.date.toISOString(), state.date.toISOString());
assert.equal(restored.url.href, state.url.href);
assert.equal(restored.map.get('role'), 'admin');
assert.deepEqual([...restored.set], ['ssr', 'hydration']);
const cyclic = {}; cyclic.self = cyclic;
assert.throws(() => serializeServerValue(cyclic), /circular references/);
assert.throws(() => deserializeServerValue('{"version":1,"value":{"__proto__":{"polluted":true}}}'), /forbidden key/);

const component = parse(`#script
  prop title: String
  server action save(input: String): String {
    return input
  }
  state visible: Bool = true
#end script
#view
  View {
    Title(title)
    if visible {
      Text("Ready")
    } else {
      Text("Hidden")
    }
  }
#end view`, 'src/pages/index.vx');
assert.deepEqual(component.diagnostics, []);
const semantic = analyze(component.ast);
assert.deepEqual(semantic.diagnostics, []);
const output = lower(component.ast, semantic.graph, semantic.visual, semantic.data);
assert.match(output.serverCode, /export async function renderComponent/);
assert.match(output.serverCode, /renderElement\(/);
assert.match(output.serverCode, /renderComment\("vx:if:/);
assert.match(output.serverCode, /registerServerAction\(\{"id":"[^"]+:save"/);
assert.match(output.serverCode, /context\.onCleanup\(__vxDispose\)/);
assert.doesNotMatch(output.serverCode, /finally \{[\s\S]*__vxCleanup/);
assert.match(output.clientCode, /claimHydrationElement/);
assert.match(output.clientCode, /claimHydrationComment/);

const root = mkdtempSync(path.join(tmpdir(), 'vx-phase7-'));
try {
  const pages = path.join(root, 'src', 'pages');
  write('index.vx', page('Home'));
  write('index.route.json', JSON.stringify({
    render: 'static', hydration: 'full', streaming: 'blocking',
    generation: { mode: 'static' }, metadata: { title: 'SSR Home' }
  }));
  write('products/[id.integer].vx', `#script\n  prop id: Int\n#end script\n#view\n  Text(id)\n#end view`);
  write('products/[id.integer].route.json', JSON.stringify({
    render: 'server', hydration: 'islands', streaming: 'blocking',
    generation: { mode: 'incremental', revalidateSeconds: 60, entries: [{ id: 7 }, { id: 9 }] }
  }));
  const graph = buildApplicationGraph({ dir: pages, rootDir: root });
  assert.deepEqual(graph.diagnostics.filter((item) => item.severity === 'error'), []);
  const generated = generateApplicationModules(graph);
  assert.match(generated.server, /createServerApplication/);
  assert.match(generated.server, /createVXServerApplication/);
  assert.match(generated.server, /loadPage: \(\) => import\(/);
  assert.equal(JSON.parse(generated.manifest).routes.length, 2);

  write('invalid.vx', page('Invalid'));
  write('invalid.route.json', JSON.stringify({ render: 'client', streaming: 'stream', generation: { mode: 'static' } }));
  const invalid = buildApplicationGraph({ dir: pages, rootDir: root });
  assert.ok(invalid.diagnostics.some((item) => item.code === 'VX_ROUTE_GENERATION_CLIENT_ONLY'));
  assert.ok(invalid.diagnostics.some((item) => item.code === 'VX_ROUTE_STREAMING_RENDER'));
  assert.ok(invalid.diagnostics.some((item) => item.code === 'VX_ROUTE_STREAMING_GENERATION'));

  const outDir = path.join(root, 'dist-app');
  mkdirSync(path.join(outDir, 'client'), { recursive: true });
  mkdirSync(path.join(outDir, 'server'), { recursive: true });
  mkdirSync(path.join(outDir, 'server', 'chunks'), { recursive: true });
  writeFileSync(path.join(outDir, 'client', 'assets-placeholder.txt'), 'client');
  writeFileSync(path.join(outDir, 'server', 'chunks', 'render.mjs'), `export const renderPath = (pathname) => '<!doctype html><title>Static ' + pathname + '</title>';\n`);
  writeFileSync(path.join(outDir, 'server', 'vx-server.mjs'), fakeServerModule());
  const written = await runStaticAdapter(outDir);
  assert.equal(written.length, 2);
  assert.match(readFileSync(path.join(outDir, 'client', 'index.html'), 'utf8'), /Static \/</);
  assert.match(readFileSync(path.join(outDir, 'client', 'docs', 'guide', 'index.html'), 'utf8'), /Static \/docs\/guide/);
  const nodeEntry = runNodeAdapter(outDir);
  const nodeSource = readFileSync(nodeEntry, 'utf8');
  assert.match(nodeSource, /(?:createServer|startNodeServer)\(/);
  assert.ok(nodeSource.includes('Readable.fromWeb') || nodeSource.includes('@vx-foundation/server/node'));
  execFileSync(process.execPath, ['--check', nodeEntry], { stdio: 'pipe' });

  console.log('Phase 7 static verification passed (safe serialization, SSR codegen, server policies, virtual server graph, static generation, and Node adapter output).');
} finally {
  rmSync(root, { recursive: true, force: true });
}

function write(relativePath, content) {
  const filePath = path.join(root, 'src', 'pages', relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function page(label) {
  return `#view\n  View {\n    Text("${label}")\n  }\n#end view`;
}

function fakeServerModule() {
  return `import { renderPath } from './chunks/render.mjs';
export const routes = [
  { id: 'root', path: '/', segments: [], parameters: [], pagePath: '/index.vx', layoutPaths: [], boundaries: {}, policy: { render: 'static', preload: 'none', hydration: 'none', streaming: 'blocking', generation: { mode: 'static', entries: [] }, metadata: {}, preserve: { state: false, scroll: true, focus: true } }, queries: [], actions: [], score: 0, loadLayouts: [] },
  { id: 'guide', path: '/docs/:slug', segments: [{ kind: 'static', value: 'docs' }, { kind: 'parameter', value: 'slug', parameter: { name: 'slug', kind: 'slug', catchAll: false, optional: false, source: '[slug.slug]' } }], parameters: [{ name: 'slug', kind: 'slug', catchAll: false, optional: false, source: '[slug.slug]' }], pagePath: '/guide.vx', layoutPaths: [], boundaries: {}, policy: { render: 'static', preload: 'none', hydration: 'none', streaming: 'blocking', generation: { mode: 'static', entries: [{ slug: 'guide' }] }, metadata: {}, preserve: { state: false, scroll: true, focus: true } }, queries: [], actions: [], score: 1, loadLayouts: [] }
];
export function createVXServerApplication() { return { render: async (pathname) => new Response(renderPath(pathname), { status: 200, headers: { 'content-type': 'text/html' } }) }; }
export default createVXServerApplication;
`;
}
