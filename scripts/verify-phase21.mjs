import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileComponentProject } from '../packages/compiler/dist/project.js';
import { buildApplicationGraph } from '../packages/router/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const officialApplications = [
  { directory: 'apps/official-dashboard', name: '@vx-foundation/official-dashboard', features: ['authentication', 'layouts', 'tables', 'charts', 'forms', 'permissions', 'SSR', 'queries', 'mutations'] },
  { directory: 'apps/official-commerce', name: '@vx-foundation/official-commerce', features: ['catalog', 'filters', 'cart', 'checkout', 'uploads', 'SEO', 'static generation', 'incremental rendering'] },
  { directory: 'apps/official-collaboration', name: '@vx-foundation/official-collaboration', features: ['realtime', 'messages', 'presence', 'optimistic updates', 'offline', 'conflicts', 'large collections'] }
];

verifyDocumentation();
const packageContracts = loadPackageContracts();
let componentCount = 0;
let routeCount = 0;
let importCount = 0;
for (const application of officialApplications) {
  const applicationRoot = resolve(root, application.directory);
  assert.ok(existsSync(applicationRoot), `Missing ${application.directory}.`);
  const manifest = readJson(join(applicationRoot, 'package.json'));
  assert.equal(manifest.name, application.name);
  assert.equal(manifest.private, true, `${application.name} must remain private.`);
  assert.equal(manifest.type, 'module');
  for (const script of ['dev', 'build', 'preview', 'check', 'lint', 'typecheck', 'test', 'verify']) assert.equal(typeof manifest.scripts?.[script], 'string', `${application.name} is missing '${script}'.`);

  const typecheck = spawnSync(process.platform === 'win32' ? 'pnpm' : 'tsc', [
    ...(process.platform === 'win32' ? ['tsc'] : []),
    '-p', join(applicationRoot, 'tsconfig.json'), '--pretty', 'false', '--noEmit'
  ], { encoding: 'utf8', shell: true });
  assert.equal(typecheck.status, 0, `${application.name} TypeScript check failed:
${typecheck.stderr || typecheck.stdout}`);

  const files = walk(applicationRoot);
  const vxFiles = files.filter((file) => file.endsWith('.vx'));
  assert.ok(vxFiles.length >= 3, `${application.name} must contain a meaningful routed VX workload.`);
  for (const file of vxFiles) {
    const result = compileComponentProject(file, { rootDir: applicationRoot, frameworkVersion: '0.1.0', failFast: true });
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    assert.equal(errors.length, 0, `${relative(root, file)} failed:\n${errors.map((item) => `[${item.code}] ${item.message}`).join('\n')}`);
    assert.ok(result.artifacts.size > 0, `${relative(root, file)} emitted no artifacts.`);
    componentCount += 1;
  }

  const graph = buildApplicationGraph({ dir: join(applicationRoot, 'src/pages'), rootDir: applicationRoot });
  const graphErrors = graph.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  assert.equal(graphErrors.length, 0, `${application.name} route graph failed:\n${graphErrors.map((item) => `[${item.code}] ${item.message}`).join('\n')}`);
  assert.ok(graph.routes.length >= 3, `${application.name} must expose at least three routes.`);
  verifyLiteralFormTargets(application.name, vxFiles, graph.endpoints);
  routeCount += graph.routes.length;

  for (const file of files.filter((entry) => ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'].includes(extname(entry)))) {
    const source = readFileSync(file, 'utf8');
    for (const specifier of extractImports(source)) {
      if (!specifier.startsWith('@vx-foundation/')) continue;
      verifyPublicImport(specifier, manifest, packageContracts, file);
      importCount += 1;
    }
    assert.equal(source.includes('/src/'), false, `${relative(root, file)} imports a source implementation path.`);
    assert.equal(source.includes('/dist/'), false, `${relative(root, file)} imports a build implementation path.`);
    assert.equal(/export\s+const\s+[A-Z]+\s*=\s*\w+\.handle\b/.test(source), false, `${relative(root, file)} exports DefinedEndpoint.handle directly instead of createRouteEndpointHandler().`);
  }

  const readme = readFileSync(join(applicationRoot, 'README.md'), 'utf8').toLowerCase();
  for (const feature of application.features) assert.ok(readme.includes(feature.toLowerCase()) || featureCoveredByFiles(feature, files), `${application.name} does not document or implement '${feature}'.`);
}

verifyReleaseIntegration();
assert.ok(importCount >= 12, 'Official applications must exercise multiple public package entries.');
console.log(`Phase 21 verification passed (${componentCount} VX components, ${routeCount} routes, ${importCount} public framework imports).`);

function verifyDocumentation() {
  const required = [
    'docs/spec/README.md', 'docs/spec/lexical-structure.md', 'docs/spec/types-and-values.md',
    'docs/spec/modules-and-packages.md', 'docs/spec/reactive-execution.md', 'docs/spec/components.md',
    'docs/spec/view-language.md', 'docs/spec/routing.md', 'docs/spec/server-boundaries.md',
    'docs/spec/javascript-interoperability.md', 'docs/spec/diagnostics.md', 'docs/spec/conformance.md',
    'docs/framework/README.md', 'docs/api/README.md', 'docs/tutorials/README.md', 'docs/cookbook/README.md',
    'docs/migrations/README.md', 'docs/guides/security.md', 'docs/guides/deployment.md',
    'docs/guides/performance.md', 'docs/guides/accessibility.md', 'docs/guides/package-authoring.md',
    'docs/guides/plugin-authoring.md', 'docs/framework/official-applications.md'
  ];
  for (const document of required) {
    const absolute = resolve(root, document);
    assert.ok(existsSync(absolute), `Missing ${document}.`);
    const source = readFileSync(absolute, 'utf8');
    assert.ok(source.startsWith('#'), `${document} must have a top-level heading.`);
    assert.ok(source.length >= 80, `${document} is too small to be useful.`);
  }
  const apiPages = readdirSync(resolve(root, 'docs/api')).filter((name) => name.endsWith('.md'));
  const publicPackages = readdirSync(resolve(root, 'packages')).filter((name) => existsSync(resolve(root, 'packages', name, 'package.json'))).length;
  assert.ok(apiPages.length >= publicPackages, 'API reference does not cover every package manifest.');

  const gettingStarted = resolve(root, 'apps/docs/src/content/getting-started.md');
  assert.equal(existsSync(gettingStarted), false, 'The obsolete Phase 6 getting-started document must not remain in the docs app.');
}

function verifyLiteralFormTargets(applicationName, vxFiles, endpoints) {
  const methodsByPath = new Map(endpoints.map((endpoint) => [endpoint.path, new Set(endpoint.methods)]));
  for (const file of vxFiles) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\baction:\s*["'](\/api\/[^"']+)["']/g)) {
      const target = match[1];
      const methods = methodsByPath.get(target);
      assert.ok(methods, `${applicationName} form target '${target}' from ${relative(root, file)} has no endpoint.`);
      assert.ok(methods.has('POST'), `${applicationName} form target '${target}' does not accept POST.`);
    }
  }
}

function verifyReleaseIntegration() {
  const lockfile = readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8');
  for (const application of ['apps/docs', ...officialApplications.map((item) => item.directory)]) {
    assert.ok(lockfile.includes(`  ${application}:\n`), `pnpm-lock.yaml is missing importer '${application}'.`);
  }
  const workflow = resolve(root, '.github/workflows/official-applications.yml');
  assert.ok(existsSync(workflow), 'Missing official application CI workflow.');
  const source = readFileSync(workflow, 'utf8');
  for (const command of ['pnpm install --frozen-lockfile', 'pnpm verify:official-apps', 'pnpm verify:official-apps:ci']) {
    assert.ok(source.includes(command), `Official application workflow is missing '${command}'.`);
  }
  for (const application of ['official-dashboard', 'official-commerce']) {
    assert.ok(existsSync(resolve(root, 'apps', application, '.env.example')), `${application} must document required secret configuration.`);
  }
}

function loadPackageContracts() {
  const contracts = new Map();
  for (const directoryName of readdirSync(resolve(root, 'packages'))) {
    const path = resolve(root, 'packages', directoryName, 'package.json');
    if (!existsSync(path)) continue;
    const manifest = readJson(path);
    if (!manifest.name?.startsWith('@vx-foundation/')) continue;
    const exports = new Set(Object.keys(manifest.exports ?? { '.': manifest.main ?? './dist/index.js' }));
    contracts.set(manifest.name, exports);
  }
  return contracts;
}

function verifyPublicImport(specifier, applicationManifest, contracts, file) {
  const parts = specifier.split('/');
  const packageName = parts.slice(0, 2).join('/');
  const contract = contracts.get(packageName);
  assert.ok(contract, `${relative(root, file)} imports unknown VX package '${packageName}'.`);
  const declared = applicationManifest.dependencies?.[packageName] ?? applicationManifest.devDependencies?.[packageName];
  assert.equal(typeof declared, 'string', `${relative(root, file)} imports undeclared dependency '${packageName}'.`);
  const subpath = parts.length === 2 ? '.' : `./${parts.slice(2).join('/')}`;
  assert.ok(contract.has(subpath), `${relative(root, file)} imports private or undeclared entry '${specifier}'.`);
  assert.equal(/\/(?:src|dist|internal|private)(?:\/|$)/.test(specifier), false, `${relative(root, file)} imports implementation entry '${specifier}'.`);
}

function extractImports(source) {
  const output = [];
  const pattern = /(?:import|export)\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const match of source.matchAll(pattern)) output.push(match[1] ?? match[2]);
  return output.filter(Boolean);
}

function featureCoveredByFiles(feature, files) {
  const needles = {
    authentication: ['auth.ts'], tables: ['users/page.vx'], charts: ['page.vx'], permissions: ['permissions.ts'],
    queries: ['platform/data.ts'], mutations: ['platform/data.ts'], catalog: ['domain/catalog.ts'], filters: ['domain/catalog.ts'],
    cart: ['platform/cart.ts'], checkout: ['checkout/page.vx'], uploads: ['listings/endpoint.ts'], SEO: ['route.json'],
    realtime: ['platform/realtime.ts'], messages: ['messages/page.vx'], presence: ['page.vx'],
    'optimistic updates': ['platform/realtime.ts'], offline: ['platform/realtime.ts'], conflicts: ['domain/collaboration.ts'],
    'large collections': ['platform/realtime.ts'], 'static generation': ['route.json'], 'incremental rendering': ['route.json'],
    layouts: ['layout.vx'], forms: ['reports/page.vx'], SSR: ['route.json']
  };
  return (needles[feature] ?? []).some((needle) => files.some((file) => file.replaceAll('\\', '/').endsWith(needle)));
}

function walk(directory) {
  const output = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.vx', '.git'].includes(entry.name)) continue;
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && statSync(absolute).isFile()) output.push(absolute);
    }
  }
  return output.sort();
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
