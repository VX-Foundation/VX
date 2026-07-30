import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildApplicationGraph, generateApplicationModules } from '../packages/router/dist/index.js';

const root = mkdtempSync(join(tmpdir(), 'vx-phase10-'));
const pages = join(root, 'src', 'pages');
const PAGE = `#view\n  View {\n    Text("Page")\n  }\n#end view`;
const PARAM_PAGE = `#script\n  prop id: Int\n#end script\n#view\n  Text(id)\n#end view`;
const LAYOUT = `#script\n  content route: required\n#end script\n#view\n  View {\n    Content(route)\n  }\n#end view`;

try {
  write('layout.vx', LAYOUT);
  write('loading.vx', PAGE);
  write('error.vx', PAGE);
  write('not-found.vx', PAGE);
  write('middleware.ts', 'export async function middleware(_context, next) { return next(); }');
  write('loader.ts', 'export async function load() { return { shell: true }; }');
  write('page.vx', PAGE);
  write('route.json', JSON.stringify({
    name: 'home',
    metadata: { title: 'VX', titleTemplate: '%s · Framework', language: 'pt-BR' },
    navigation: { trailingSlash: 'never', caseSensitive: true, announce: true, viewTransition: true }
  }));
  write(join('users', '[id.integer]', 'page.vx'), PARAM_PAGE);
  write(join('users', '[id.integer]', 'route.json'), JSON.stringify({
    name: 'user.details',
    render: 'server',
    navigation: { trailingSlash: 'always', caseSensitive: false },
    search: [
      { name: 'tab', kind: 'slug', required: false, repeat: false, defaultValue: 'profile' },
      { name: 'tag', kind: 'slug', required: false, repeat: true }
    ],
    metadata: {
      title: 'User', canonical: 'https://vx.test/users',
      alternates: [{ language: 'en', href: 'https://vx.test/en/users' }],
      openGraph: { type: 'profile', images: ['/profile.png'] },
      twitter: { card: 'summary_large_image', images: ['/profile.png'] },
      structuredData: { '@context': 'https://schema.org', '@type': 'ProfilePage' }
    }
  }));
  write(join('users', '[id.integer]', 'loader.ts'), 'export async function load({ parentData }) { return { user: parentData.shell }; }');
  write(join('users', '[id.integer]', 'middleware.ts'), 'export default async function routeMiddleware(_context, next) { return next(); }');
  write(join('users', '[id.integer]', 'endpoint.ts'), 'export async function GET() { return { ok: true }; }');

  const graph = buildApplicationGraph({ dir: pages, rootDir: root });
  assert.deepEqual(graph.diagnostics.filter((entry) => entry.severity === 'error'), []);
  assert.equal(graph.routes.length, 2);
  const home = graph.routes.find((route) => route.path === '/');
  const user = graph.routes.find((route) => route.path === '/users/:id');
  assert.equal(home?.name, 'home');
  assert.equal(user?.name, 'user.details');
  assert.equal(user?.parameters[0]?.kind, 'integer');
  assert.equal(user?.layoutPaths.length, 1);
  assert.equal(user?.loaderPaths?.length, 2);
  assert.equal(user?.middlewarePaths?.length, 2);
  assert.equal(user?.policy.navigation?.trailingSlash, 'always');
  assert.equal(user?.policy.navigation?.caseSensitive, false);
  assert.equal(user?.policy.search?.length, 2);
  assert.equal(graph.endpoints[0]?.path, '/users/:id');
  assert.deepEqual(graph.endpoints[0]?.methods, ['GET']);

  const generated = generateApplicationModules(graph);
  assert.match(generated.client, /createRouteCatalog/);
  assert.match(generated.client, /export const route = routeCatalog\.byName/);
  assert.match(generated.client, /loadLoaders/);
  assert.match(generated.client, /loadMiddleware/);
  assert.match(generated.server, /createServerApplication/);
  const manifest = JSON.parse(generated.manifest);
  assert.equal(manifest.routes.find((route) => route.name === 'user.details').loaderPaths.length, 2);

  const collisionRoot = join(root, 'collision', 'src', 'pages');
  writeAbsolute(join(collisionRoot, 'page.vx'), PAGE);
  writeAbsolute(join(collisionRoot, 'index.vx'), PAGE);
  writeAbsolute(join(collisionRoot, 'loader.ts'), 'export const wrong = true;');
  const collision = buildApplicationGraph({ dir: collisionRoot, rootDir: join(root, 'collision') });
  const codes = collision.diagnostics.map((entry) => entry.code);
  assert(codes.includes('VX_ROUTE_PAGE_COLLISION'));
  assert(codes.includes('VX_ROUTE_LOADER_EXPORT'));

  const invalidSearchRoot = join(root, 'invalid-search', 'src', 'pages');
  writeAbsolute(join(invalidSearchRoot, 'page.vx'), PAGE);
  writeAbsolute(join(invalidSearchRoot, 'route.json'), JSON.stringify({
    search: [
      { name: 'page', kind: 'integer', required: false, repeat: false, defaultValue: 'one' },
      { name: 'tag', kind: 'slug', required: false, repeat: true, defaultValue: 'vx' }
    ]
  }));
  const invalidSearch = buildApplicationGraph({ dir: invalidSearchRoot, rootDir: join(root, 'invalid-search') });
  assert(invalidSearch.diagnostics.some((entry) => entry.code === 'VX_ROUTE_CONFIG_INVALID' && /defaultValue/.test(entry.message)));

  const redirectRoot = join(root, 'redirect', 'src', 'pages');
  writeAbsolute(join(redirectRoot, 'page.route.json'), JSON.stringify({ name: 'old.home', redirect: { to: '/new' } }));
  const redirect = buildApplicationGraph({ dir: redirectRoot, rootDir: join(root, 'redirect') });
  assert.equal(redirect.routes[0]?.path, '/');
  assert.equal(redirect.routes[0]?.name, 'old.home');

  console.log('Phase 10 router graph verification passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}

function write(relative, source) {
  writeAbsolute(join(pages, relative), source);
}

function writeAbsolute(filePath, source) {
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, source);
}
