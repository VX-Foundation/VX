import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '..', '..');
const pagesRoot = join(appRoot, 'src', 'pages');
const layoutPath = join(pagesRoot, 'layout.vx');
const manifestPath = join(appRoot, 'src', 'content', 'index.ts');

assert.ok(existsSync(layoutPath), 'The documentation application must provide a root layout.vx.');
assert.ok(existsSync(manifestPath), 'The documentation application must provide its source-driven content manifest.');
assert.ok(existsSync(join(appRoot, 'scripts', 'generate-portal.mjs')), 'The documentation generator is required.');
assert.ok(!existsSync(join(pagesRoot, 'docs', '[slug]')), 'Generic placeholder documentation routes are forbidden.');

const routes = discoverRoutes(pagesRoot);
const files = collectFiles(pagesRoot, '.vx');
assert.ok(routes.has('/'), 'The documentation application must provide the overview route.');
assert.ok(routes.size >= 400, `Expected at least 400 documentation routes, found ${routes.size}.`);

const routeLinks = new Map();
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const lineCount = source.split('\n').length;
  assert.ok(lineCount <= 1000, `${relative(repositoryRoot, file)} exceeds the 1,000-line policy (${lineCount}).`);
  assert.ok(!source.includes('vx.dev'), `${relative(repositoryRoot, file)} still references vx.dev.`);
  if (file !== layoutPath) {
    assert.match(source, /\bTitle\s*\(/, `${relative(repositoryRoot, file)} must provide a visible page title.`);
    assert.match(source, /@page\s*\{/, `${relative(repositoryRoot, file)} must provide a local @page visual contract.`);
  }
  const route = routeForFile(file);
  const links = extractInternalHrefs(source).map(normalizeRoute);
  routeLinks.set(route, links);
  for (const href of links) assert.ok(routes.has(href), `${relative(repositoryRoot, file)} links to missing route ${href}.`);
}

const layoutLinks = extractInternalHrefs(readFileSync(layoutPath, 'utf8')).map(normalizeRoute);
routeLinks.set('/', [...new Set([...(routeLinks.get('/') ?? []), ...layoutLinks])]);
const reachable = walkLinks('/', routeLinks);
const unreachable = [...routes].filter((route) => !reachable.has(route));
assert.deepEqual(unreachable, [], `Documentation routes must be reachable from the root indexes: ${unreachable.join(', ')}`);

const manifest = readFileSync(manifestPath, 'utf8');
for (const route of routes) {
  assert.ok(manifest.includes(`"route":"${route}"`), `The content manifest does not include ${route}.`);
}

assert.equal(countRoutes(routes, /^\/widgets\/[^/]+$/), 43, 'Expected one reference page for each of the 43 widgets.');
assert.equal(countRoutes(routes, /^\/visual\/properties\/[^/]+$/), 167, 'Expected one page for each of the 167 visual properties.');
assert.equal(countRoutes(routes, /^\/visual\/roles\/[^/]+$/), 52, 'Expected one page for each of the 52 built-in roles.');
assert.equal(countCanonicalWidgets(), 43, 'Canonical widget registry must still contain 43 widgets.');
assert.equal(countVisualProperties(), 167, 'Compiler visual property registry must still contain 167 properties.');
assert.equal(countVisualRoles(), 52, 'Compiler role catalog must still contain 52 roles.');
assert.ok(countRoutes(routes, /^\/packages\/[^/]+$/) >= 25, 'Expected package reference pages for all public packages.');
assert.ok(routes.has('/visual/conditions'), 'Visual conditions reference is required.');
assert.ok(routes.has('/reference/language'), 'Frozen language specification index is required.');
assert.ok(routes.has('/guides') && routes.has('/cookbook') && routes.has('/tutorials'), 'Guides, cookbook, and tutorials are required.');
assert.ok(routes.has('/internals') && routes.has('/project') && routes.has('/security'), 'Internals, project policy, and security sections are required.');

for (const script of collectFiles(join(appRoot, 'scripts'), '.mjs')) {
  const lines = readFileSync(script, 'utf8').split('\n').length;
  assert.ok(lines <= 1000, `${relative(repositoryRoot, script)} exceeds the 1,000-line policy (${lines}).`);
}

console.log(`VX documentation verified: ${routes.size} routes, ${files.length} VX modules, 43 widgets, 167 visual properties, 52 roles, and complete link reachability.`);

function discoverRoutes(directory) {
  const result = new Set();
  for (const file of collectFiles(directory, '.vx')) {
    const route = routeForFile(file);
    if (route !== null) result.add(route);
  }
  return result;
}

function routeForFile(file) {
  const rel = relative(pagesRoot, file).replaceAll('\\', '/');
  if (rel === 'layout.vx') return null;
  if (rel === 'index.vx') return '/';
  if (rel.endsWith('/page.vx')) return `/${rel.slice(0, -'/page.vx'.length)}`;
  return null;
}

function collectFiles(directory, extension) {
  if (!existsSync(directory)) return [];
  const result = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) result.push(...collectFiles(path, extension));
    else if (path.endsWith(extension)) result.push(path);
  }
  return result.sort();
}

function extractInternalHrefs(source) {
  return [...source.matchAll(/href:\s*"(\/[^"#?]*)/g)].map((match) => match[1]);
}

function normalizeRoute(route) {
  if (route === '/') return route;
  return route.replace(/\/+$/, '');
}

function walkLinks(start, graph) {
  const visited = new Set();
  const queue = [start];
  while (queue.length) {
    const route = queue.shift();
    if (route === undefined || visited.has(route)) continue;
    visited.add(route);
    for (const next of graph.get(route) ?? []) if (!visited.has(next)) queue.push(next);
  }
  return visited;
}

function countRoutes(routes, pattern) {
  return [...routes].filter((route) => pattern.test(route)).length;
}

function countCanonicalWidgets() {
  const source = readFileSync(join(repositoryRoot, 'packages', 'widgets', 'registry', 'widgets.mjs'), 'utf8');
  return [...source.matchAll(/^\s{2}[A-Z][A-Za-z0-9]+:\s+widget\(/gm)].length;
}

function countVisualProperties() {
  const source = readFileSync(join(repositoryRoot, 'packages', 'compiler', 'src', 'visual', 'properties.ts'), 'utf8');
  const body = source.split('export const SUPPORTED_VISUAL_PROPERTIES = new Set([', 2)[1]?.split(']);', 1)[0] ?? '';
  return [...body.matchAll(/'([^']+)'/g)].length;
}

function countVisualRoles() {
  const source = readFileSync(join(repositoryRoot, 'packages', 'compiler', 'src', 'visual', 'catalog.ts'), 'utf8');
  const body = source.split('export const BUILTIN_ROLES:', 2)[1]?.split('export function getBuiltinRole', 1)[0] ?? '';
  return [...body.matchAll(/^\s{2}[A-Za-z][A-Za-z0-9]*:\s+(?:structural|semantic)\(/gm)].length;
}
