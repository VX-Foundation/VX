import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  addPackage,
  comparePublicContracts,
  compareSemver,
  createIntegrity,
  createPublicationManifest,
  createPublicContractSnapshot,
  createWorkspaceGraph,
  emptyLockfile,
  readLockfile,
  satisfiesSemver,
  signPackagePayload,
  topologicalWorkspaceOrder,
  validSemverRange,
  verifyLockfileGraph,
  verifyPackageSignature,
  verifyPublicationManifest,
  writeLockfile
} from '../packages/package-system/dist/index.js';
import {
  assertInteropBoundary,
  callback,
  defineInteropModule,
  defineJSClass,
  promiseFrom,
  resolveNpmInteropPackage,
  treeShakeInterop
} from '../packages/interop/dist/index.js';
import {
  loadIsolatedIntegration,
  PluginHost,
  signPluginManifest,
  snapshotPluginSource
} from '../packages/plugins/dist/index.js';

const root = mkdtempSync(join(tmpdir(), 'vx-phase19-'));
writeFileSync(join(root, 'package.json'), '{"name":"demo","version":"1.0.0"}');

// Package mutation, lockfile, integrity, signatures and semantic versions.
addPackage(root, '@scope/example@1.2.3');
assert.match(readFileSync(join(root, 'package.json'), 'utf8'), /@scope\/example/);
writeLockfile(root, emptyLockfile(root));
const lockfile = readLockfile(root);
assert.equal(lockfile.lockfileVersion, 1);
assert.deepEqual(verifyLockfileGraph(lockfile), { valid: true, issues: [] });
assert.match(createIntegrity('vx'), /^sha512-/);
const packageKeys = generateKeyPairSync('ed25519');
const packageSignature = signPackagePayload('vx', packageKeys.privateKey, 'vx.dev');
assert.equal(verifyPackageSignature('vx', packageSignature, packageKeys.publicKey), true);
assert.equal(compareSemver('1.0.0-beta.2', '1.0.0'), -1);
assert.equal(validSemverRange('^1.2.3 || ~2.0'), true);
assert.equal(satisfiesSemver('1.8.0', '^1.2.3'), true);
assert.equal(satisfiesSemver('2.0.0', '^1.2.3'), false);
assert.equal(satisfiesSemver('1.2.3-beta.2', '>=1.2.3-beta.1 <1.2.3'), true);

// Public contracts classify compatibility and required semantic-version movement.
const baseMetadata = {
  schema: 'https://vx.dev/schemas/package/v1', version: 1, name: '@vx/demo', packageVersion: '1.0.0',
  exports: { '.': './dist/index.js', './feature': './dist/feature.js' }, privateModules: ['./internal/*'],
  publicContracts: { '.': { integrity: 'sha512-base', declarationsIntegrity: 'sha512-types', symbols: ['main'] }, './feature': 'sha512-feature' }
};
const previousContract = createPublicContractSnapshot(baseMetadata);
const nextContract = createPublicContractSnapshot({ ...baseMetadata, packageVersion: '2.0.0', publicContracts: { '.': baseMetadata.publicContracts['.'] } });
const contractComparison = comparePublicContracts(previousContract, nextContract);
assert.equal(contractComparison.compatible, false);
assert.equal(contractComparison.recommendedBump, 'major');
assert.match(contractComparison.changes[0].message, /removed/);

// Recursive workspace globs, exclusions, ordering and cycle detection.
const workspace = join(root, 'workspace');
mkdirSync(join(workspace, 'packages', 'a'), { recursive: true });
mkdirSync(join(workspace, 'packages', 'nested', 'b'), { recursive: true });
mkdirSync(join(workspace, 'packages', 'excluded', 'c'), { recursive: true });
writeFileSync(join(workspace, 'package.json'), JSON.stringify({ name: 'workspace-root', version: '1.0.0', private: true }));
writeFileSync(join(workspace, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/**'\n  - '!packages/excluded/**'\n");
writeFileSync(join(workspace, 'packages', 'a', 'package.json'), JSON.stringify({ name: '@demo/a', version: '1.0.0', dependencies: { '@demo/b': 'workspace:*' } }));
writeFileSync(join(workspace, 'packages', 'nested', 'b', 'package.json'), JSON.stringify({ name: '@demo/b', version: '1.0.0' }));
writeFileSync(join(workspace, 'packages', 'excluded', 'c', 'package.json'), JSON.stringify({ name: '@demo/c', version: '1.0.0' }));
let graph = createWorkspaceGraph(workspace);
assert.deepEqual(graph.packages.map((item) => item.name), ['@demo/a', '@demo/b', 'workspace-root']);
assert.deepEqual(topologicalWorkspaceOrder(graph).map((item) => item.name), ['@demo/b', '@demo/a', 'workspace-root']);
writeFileSync(join(workspace, 'packages', 'nested', 'b', 'package.json'), JSON.stringify({ name: '@demo/b', version: '1.0.0', dependencies: { '@demo/a': 'workspace:*' } }));
graph = createWorkspaceGraph(workspace);
assert.equal(graph.cycles.length, 1);
assert.throws(() => topologicalWorkspaceOrder(graph), /cycles/);

// Reproducible publication manifest detects any staged-file modification.
const publicationRoot = join(root, 'publication');
mkdirSync(publicationRoot, { recursive: true });
writeFileSync(join(publicationRoot, 'package.json'), '{"name":"publication","version":"1.0.0"}');
writeFileSync(join(publicationRoot, 'index.js'), 'export const answer = 42;');
const publication = createPublicationManifest(publicationRoot, 'publication', '1.0.0', { ignore: ['vx.publication.json', 'vx.signature.json'] });
writeFileSync(join(publicationRoot, 'vx.publication.json'), JSON.stringify(publication));
assert.equal(verifyPublicationManifest(publicationRoot, publication), true);
writeFileSync(join(publicationRoot, 'index.js'), 'export const answer = 43;');
assert.equal(verifyPublicationManifest(publicationRoot, publication), false);

// JavaScript/TypeScript FFI, cancellation, tree shaking and environment boundaries.
assert.throws(() => assertInteropBoundary('client', 'node', 'node:fs'), /server-only/);
const contract = defineInteropModule({ module: 'demo', environment: 'universal', sideEffects: false, exports: [
  { module: 'demo', exportName: 'used', kind: 'function', environment: 'universal', pure: true },
  { module: 'demo', exportName: 'unused', kind: 'function', environment: 'universal', pure: true }
] });
assert.deepEqual(treeShakeInterop(contract, new Set(['used'])).exports.map((entry) => entry.exportName), ['used']);
class Counter { constructor(value) { this.value = value; } }
assert.equal(defineJSClass('demo', 'Counter', Counter).construct(7).value, 7);
const once = callback((value) => value * 2, { once: true });
assert.equal(once(4), 8);
assert.throws(() => once(4), /after disposal/);
const aborted = new AbortController();
aborted.abort('cancelled');
await assert.rejects(() => promiseFrom(Promise.resolve(1), aborted.signal), /cancelled/);

// npm resolver honors browser/import conditions, never silently selecting require.
const interopPackage = join(root, 'node_modules', 'demo-interop');
mkdirSync(join(interopPackage, 'dist', 'features'), { recursive: true });
writeFileSync(join(interopPackage, 'package.json'), JSON.stringify({
  name: 'demo-interop', version: '1.2.3', type: 'module', sideEffects: ['./dist/side-effect.js'],
  exports: {
    '.': { types: './dist/index.d.ts', browser: './dist/browser.js', import: './dist/import.js', require: './dist/require.cjs' },
    './features/*': { types: './dist/features/*.d.ts', import: './dist/features/*.js' }
  },
  vx: { interop: { environment: 'universal' } }
}));
for (const [name, source] of Object.entries({
  'browser.js': 'export const target = "browser";', 'import.js': 'export const target = "import";', 'require.cjs': 'module.exports = { target: "require" };',
  'index.d.ts': 'export declare const target: string;', 'side-effect.js': 'globalThis.__sideEffect = true;'
})) writeFileSync(join(interopPackage, 'dist', name), source);
writeFileSync(join(interopPackage, 'dist', 'features', 'one.js'), 'export const one = 1;');
writeFileSync(join(interopPackage, 'dist', 'features', 'one.d.ts'), 'export declare const one: 1;');
const npmInterop = resolveNpmInteropPackage('demo-interop', { importerRoot: root, importerEnvironment: 'client' });
assert.equal(basename(npmInterop.entry), 'browser.js');
assert.match(npmInterop.declarations ?? '', /target: string/);
assert.equal(npmInterop.sideEffects, false);
const featureInterop = resolveNpmInteropPackage('demo-interop/features/one', { importerRoot: root, importerEnvironment: 'server' });
assert.equal(basename(featureInterop.entry), 'one.js');
assert.match(featureInterop.declarations ?? '', /one: 1/);

// Real isolated official and installed plugins.
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'vx.routes.json'), JSON.stringify({ version: 1, routes: [{ pathname: '/' }, { pathname: '/docs' }, { pathname: '/users/:id' }] }));
const pluginPackage = join(root, 'node_modules', 'demo-vx-plugin');
mkdirSync(join(pluginPackage, 'dist'), { recursive: true });
writeFileSync(join(pluginPackage, 'package.json'), JSON.stringify({ name: 'demo-vx-plugin', version: '1.0.0', type: 'module', exports: { '.': { import: './dist/index.js' } } }));
writeFileSync(join(pluginPackage, 'dist', 'index.js'), `export default function plugin() { return { name: 'demo-vx-plugin', manifest: { name: 'demo-vx-plugin', version: '1.0.0', apiVersion: '1', capabilities: ['build', 'emit-file'], permissions: ['write-output'], deterministic: true }, setup(context) { context.registerHook('buildEnd', () => context.emitFile('plugin.txt', 'isolated')); } }; }`);
const host = new PluginHost(root);
const isolated = await loadIsolatedIntegration('@vx/plugins/sitemap', { site: 'https://example.com' }, { root, timeoutMs: 5_000 });
const installedPlugin = await loadIsolatedIntegration('demo-vx-plugin', undefined, { root, timeoutMs: 5_000 });
await host.install(isolated);
await host.install(installedPlugin);
await host.runHook('buildEnd', { root, outDir: 'dist' });
assert.equal(readFileSync(join(root, 'dist', 'plugin.txt'), 'utf8'), 'isolated');
const xml = readFileSync(join(root, 'dist', 'sitemap.xml'), 'utf8');
assert.match(xml, /https:\/\/example.com\/docs/);
assert.doesNotMatch(xml, /:id/);
await host.runHook('close', { root, outDir: 'dist' });

// Detached signed manifest binds Ed25519 identity to the executable source hash.
const signedPackage = join(root, 'node_modules', 'signed-vx-plugin');
mkdirSync(signedPackage, { recursive: true });
writeFileSync(join(signedPackage, 'package.json'), JSON.stringify({ name: 'signed-vx-plugin', version: '1.0.0', type: 'module', exports: './index.js' }));
const signedRuntimeManifest = { name: 'signed-vx-plugin', version: '1.0.0', apiVersion: '1', capabilities: ['build', 'emit-file'], permissions: ['write-output'], deterministic: true, cacheVersion: '1' };
writeFileSync(join(signedPackage, 'index.js'), `export default { name: 'signed-vx-plugin', manifest: ${JSON.stringify(signedRuntimeManifest)}, setup(context) { context.registerHook('buildEnd', () => context.emitFile('signed.txt', 'verified')); } };`);
const unsignedSnapshot = snapshotPluginSource(pathToFileURL(join(signedPackage, 'index.js')).href, root);
const pluginKeys = generateKeyPairSync('ed25519');
const detachedManifest = signPluginManifest({ ...signedRuntimeManifest, integrity: unsignedSnapshot.integrity }, pluginKeys.privateKey, 'vx-test');
writeFileSync(join(signedPackage, 'vx.plugin.json'), JSON.stringify(detachedManifest));
const rejectedSignedIntegration = await loadIsolatedIntegration('signed-vx-plugin', undefined, { root, timeoutMs: 5_000 });
let rejectedWorkerDisposed = false;
const rejectedDispose = rejectedSignedIntegration.dispose?.bind(rejectedSignedIntegration);
rejectedSignedIntegration.dispose = async () => { rejectedWorkerDisposed = true; await rejectedDispose?.(); };
await assert.rejects(() => new PluginHost(root, { requireSignatures: true, publicKeys: {} }).install(rejectedSignedIntegration), /not trusted/);
assert.equal(rejectedWorkerDisposed, true);
const signedIntegration = await loadIsolatedIntegration('signed-vx-plugin', undefined, { root, timeoutMs: 5_000 });
const signedHost = new PluginHost(root, { requireSignatures: true, publicKeys: { 'vx-test': pluginKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString() } });
await signedHost.install(signedIntegration);
await signedHost.runHook('buildEnd', { root, outDir: 'dist' });
assert.equal(readFileSync(join(root, 'dist', 'signed.txt'), 'utf8'), 'verified');
await signedHost.runHook('close', { root, outDir: 'dist' });
writeFileSync(join(signedPackage, 'index.js'), `${readFileSync(join(signedPackage, 'index.js'), 'utf8')}\n// tampered`);
await assert.rejects(() => loadIsolatedIntegration('signed-vx-plugin', undefined, { root, timeoutMs: 3_000 }), /integrity mismatch/);

// Deterministic cache survives a new host/worker and is invalidated by source identity.
const cachePackage = join(root, 'node_modules', 'cache-vx-plugin');
mkdirSync(cachePackage, { recursive: true });
writeFileSync(join(cachePackage, 'package.json'), JSON.stringify({ name: 'cache-vx-plugin', version: '1.0.0', type: 'module', exports: './index.js' }));
writeFileSync(join(root, 'counter.txt'), 'one');
writeFileSync(join(cachePackage, 'index.js'), `export default { name: 'cache-vx-plugin', manifest: { name: 'cache-vx-plugin', version: '1.0.0', apiVersion: '1', capabilities: ['build', 'emit-file'], permissions: ['read-project', 'write-output'], deterministic: true, cacheVersion: '1' }, setup(context) { context.registerHook('buildEnd', async () => { const value = await context.cache('value', () => context.readProjectFile('counter.txt')); context.emitFile('cached.txt', value); }); } };`);
for (const expected of ['one', 'one']) {
  const cacheHost = new PluginHost(root);
  const cacheIntegration = await loadIsolatedIntegration('cache-vx-plugin', undefined, { root, timeoutMs: 5_000 });
  await cacheHost.install(cacheIntegration);
  await cacheHost.runHook('buildEnd', { root, outDir: 'dist' });
  assert.equal(readFileSync(join(root, 'dist', 'cached.txt'), 'utf8'), expected);
  await cacheHost.runHook('close', { root, outDir: 'dist' });
  writeFileSync(join(root, 'counter.txt'), 'two');
}

// Sandbox blocks sensitive modules, graph escapes and protected project data.
const blockedPath = join(root, 'blocked-plugin.mjs');
writeFileSync(blockedPath, `import 'node:fs'; export default { name: 'blocked', manifest: { name: 'blocked', version: '1.0.0', apiVersion: '1', capabilities: ['config'], permissions: ['read-project'], deterministic: true }, setup() {} };`);
await assert.rejects(() => loadIsolatedIntegration('./blocked-plugin.mjs', undefined, { root, timeoutMs: 3_000 }), /blocked sensitive module/);

const cryptoPackage = join(root, 'node_modules', 'crypto-vx-plugin');
mkdirSync(cryptoPackage, { recursive: true });
writeFileSync(join(cryptoPackage, 'package.json'), JSON.stringify({ name: 'crypto-vx-plugin', version: '1.0.0', type: 'module', exports: './index.js' }));
writeFileSync(join(cryptoPackage, 'index.js'), `import { randomBytes } from 'node:crypto'; export default { name: 'crypto-vx-plugin', manifest: { name: 'crypto-vx-plugin', version: '1.0.0', apiVersion: '1', capabilities: ['config'], permissions: [], deterministic: true }, setup() { randomBytes(4); } };`);
await assert.rejects(() => loadIsolatedIntegration('crypto-vx-plugin', undefined, { root, timeoutMs: 3_000 }), /blocked sensitive module/);
const blockedExportPackage = join(root, 'node_modules', 'blocked-export-plugin');
mkdirSync(blockedExportPackage, { recursive: true });
writeFileSync(join(blockedExportPackage, 'package.json'), JSON.stringify({ name: 'blocked-export-plugin', version: '1.0.0', type: 'module', exports: { '.': null }, main: './index.js' }));
writeFileSync(join(blockedExportPackage, 'index.js'), `export default { name: 'blocked-export-plugin', manifest: { name: 'blocked-export-plugin', version: '1.0.0', apiVersion: '1', capabilities: ['config'], permissions: [], deterministic: true }, setup() {} };`);
await assert.rejects(() => loadIsolatedIntegration('blocked-export-plugin', undefined, { root, timeoutMs: 3_000 }), /explicitly blocks/);

const outsideModule = join(tmpdir(), `vx-plugin-outside-${process.pid}.mjs`);
writeFileSync(outsideModule, 'export default 42;');
const escapePackage = join(root, 'node_modules', 'escape-vx-plugin');
mkdirSync(escapePackage, { recursive: true });
writeFileSync(join(escapePackage, 'package.json'), JSON.stringify({ name: 'escape-vx-plugin', version: '1.0.0', type: 'module', exports: './index.js' }));
writeFileSync(join(escapePackage, 'index.js'), `import ${JSON.stringify(pathToFileURL(outsideModule).href)}; export default { name: 'escape-vx-plugin', manifest: { name: 'escape-vx-plugin', version: '1.0.0', apiVersion: '1', capabilities: ['config'], permissions: [], deterministic: true }, setup() {} };`);
await assert.rejects(() => loadIsolatedIntegration('escape-vx-plugin', undefined, { root, timeoutMs: 3_000 }), /outside the plugin dependency graph/);

const dynamicSibling = join(root, 'local-private-module.mjs');
writeFileSync(dynamicSibling, 'export const secret = 42;');
const dynamicLocalPlugin = join(root, 'local-dynamic-plugin.mjs');
writeFileSync(dynamicLocalPlugin, `const target = './local-private-module.mjs'; await import(target); export default { name: 'local-dynamic-plugin', manifest: { name: 'local-dynamic-plugin', version: '1.0.0', apiVersion: '1', capabilities: ['config'], permissions: [], deterministic: true }, setup() {} };`);
await assert.rejects(() => loadIsolatedIntegration('./local-dynamic-plugin.mjs', undefined, { root, timeoutMs: 3_000 }), /outside the plugin dependency graph/);
writeFileSync(join(root, '.env'), 'SECRET=never-read');
const secretPackage = join(root, 'node_modules', 'secret-vx-plugin');
mkdirSync(secretPackage, { recursive: true });
writeFileSync(join(secretPackage, 'package.json'), JSON.stringify({ name: 'secret-vx-plugin', version: '1.0.0', type: 'module', exports: './index.js' }));
writeFileSync(join(secretPackage, 'index.js'), `export default { name: 'secret-vx-plugin', manifest: { name: 'secret-vx-plugin', version: '1.0.0', apiVersion: '1', capabilities: ['config'], permissions: ['read-project'], deterministic: true }, async setup(context) { await context.readProjectFile('.env'); } };`);
const secretIntegration = await loadIsolatedIntegration('secret-vx-plugin', undefined, { root, timeoutMs: 3_000 });
await assert.rejects(() => new PluginHost(root).install(secretIntegration), /protected project data/);


const symlinkRoot = mkdtempSync(join(tmpdir(), 'vx-plugin-cache-link-'));
const externalCache = mkdtempSync(join(tmpdir(), 'vx-plugin-cache-outside-'));
mkdirSync(join(symlinkRoot, 'node_modules', 'symlink-cache-plugin'), { recursive: true });
mkdirSync(join(symlinkRoot, 'dist'), { recursive: true });
writeFileSync(join(symlinkRoot, 'package.json'), '{"name":"cache-link","version":"1.0.0"}');
writeFileSync(join(symlinkRoot, 'node_modules', 'symlink-cache-plugin', 'package.json'), JSON.stringify({ name: 'symlink-cache-plugin', version: '1.0.0', type: 'module', exports: './index.js' }));
writeFileSync(join(symlinkRoot, 'node_modules', 'symlink-cache-plugin', 'index.js'), `export default { name: 'symlink-cache-plugin', manifest: { name: 'symlink-cache-plugin', version: '1.0.0', apiVersion: '1', capabilities: ['build'], permissions: [], deterministic: true }, setup(context) { context.registerHook('buildEnd', () => context.cache('value', () => 'safe')); } };`);
symlinkSync(externalCache, join(symlinkRoot, '.vx'), 'dir');
const symlinkIntegration = await loadIsolatedIntegration('symlink-cache-plugin', undefined, { root: symlinkRoot, timeoutMs: 3_000 });
const symlinkHost = new PluginHost(symlinkRoot);
await symlinkHost.install(symlinkIntegration);
await assert.rejects(() => symlinkHost.runHook('buildEnd', { root: symlinkRoot, outDir: 'dist' }), /symbolic link/);
await symlinkHost.runHook('close', { root: symlinkRoot, outDir: 'dist' }).catch(() => undefined);

console.log('Phase 19 runtime verification passed.');
