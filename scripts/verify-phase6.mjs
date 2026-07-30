import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildApplicationGraph, generateApplicationModules } from '../packages/router/dist/index.js';

const root = mkdtempSync(path.join(tmpdir(), 'vx-phase6-'));
try {
  const pages = path.join(root, 'src', 'pages');
  write('_layout.vx', `#script
  content route: required
#end script
#view
  View {
    Content(route)
  }
#end view`);
  write('_loading.vx', page('Loading'));
  write('_error.vx', page('Error'));
  write('_not-found.vx', page('Not found'));
  write('index.vx', page('Home'));
  write('users/[id.integer].vx', `#script
  prop id: Int
  query profile from Profile.load { id: id }
  action update() {
    return
  }
#end script
#view
  Text("Profile")
#end view`);
  write('users/[id.integer].route.json', JSON.stringify({ render: 'server', preload: 'visible', metadata: { title: 'Profile' }, preserve: { state: true } }));
  write('api/profile.endpoint.ts', 'export async function GET() {}\nexport const PATCH = async () => {};');

  const graph = buildApplicationGraph({ dir: pages, rootDir: root });
  assert.deepEqual(graph.diagnostics.filter((item) => item.severity === 'error'), []);
  const profile = graph.routes.find((route) => route.path === '/users/:id');
  assert.ok(profile);
  assert.equal(profile.parameters[0]?.kind, 'integer');
  assert.equal(profile.policy.render, 'server');
  assert.equal(profile.queries[0]?.name, 'profile');
  assert.equal(profile.actions[0]?.name, 'update');
  assert.equal(profile.layoutPaths.length, 1);
  assert.deepEqual(graph.endpoints[0]?.methods, ['GET', 'PATCH']);

  const generated = generateApplicationModules(graph);
  assert.match(generated.client, /createApplicationRouter/);
  assert.match(generated.client, /import\("\/src\/pages\/users\/\[id\.integer\]\.vx"\)/);
  assert.equal(JSON.parse(generated.manifest).routes.length, 2);

  write('invalid.route.json', JSON.stringify({ preserve: { state: 'yes' } }));
  const invalidPolicy = buildApplicationGraph({ dir: pages, rootDir: root });
  assert.ok(invalidPolicy.diagnostics.some((item) => item.code === 'VX_ROUTE_CONFIG_INVALID'));
  rmSync(path.join(pages, 'invalid.route.json'));

  write('conflict/[name].vx', `#script
  prop name: String
#end script
#view
  Text(name)
#end view`);
  write('conflict/[slug.slug].vx', `#script
  prop slug: String
#end script
#view
  Text(slug)
#end view`);
  const conflicted = buildApplicationGraph({ dir: pages, rootDir: root });
  assert.ok(conflicted.diagnostics.some((item) => item.code === 'VX_ROUTE_COLLISION'));

  console.log('Phase 6 application graph verification passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}

function write(relativePath, content) {
  const filePath = path.join(root, 'src', 'pages', relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content);
}

function page(label) {
  return `#view
  View {
    Text("${label}")
  }
#end view`;
}
