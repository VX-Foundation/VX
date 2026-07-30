import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = '0.1.0';
const NODE_RANGE = '>=22.11.0 <23 || >=24.11.0 <25';
const PNPM = '11.17.0';
const REPOSITORY = 'git+https://github.com/VX-Foundation/vx.git';
const rootManifest = readJson('package.json');
assert.equal(rootManifest.version, VERSION);
assert.equal(rootManifest.packageManager, `pnpm@${PNPM}`);
assert.equal(rootManifest.engines?.node, NODE_RANGE);
assert.equal(rootManifest.engines?.pnpm, `>=${PNPM} <12`);
assert.equal(rootManifest.repository?.url, REPOSITORY);
assert.equal(rootManifest.license, 'MIT');
assert.match(readFileSync(join(root, 'LICENSE'), 'utf8'), /Permission is hereby granted/u);

const publicPackages = discoverWorkspaceManifests().filter(({ manifest }) => manifest.private !== true);
assert.equal(publicPackages.length, 24, 'VX 0.1 must publish 23 scoped packages plus create-vx.');
for (const { path, manifest } of publicPackages) {
  assert.equal(manifest.version, VERSION, `${manifest.name} is not synchronized at ${VERSION}.`);
  assert.equal(manifest.license, 'MIT', `${manifest.name} has no MIT license declaration.`);
  assert.ok(typeof manifest.description === 'string' && manifest.description.trim().length > 0, `${manifest.name} has no market-facing description.`);
  assert.equal(manifest.type, 'module', `${manifest.name} must publish as ESM.`);
  assert.equal(manifest.engines?.node, NODE_RANGE, `${manifest.name} has an unsupported Node range.`);
  assert.equal(manifest.repository?.url, REPOSITORY, `${manifest.name} has no canonical repository.`);
  assert.equal(manifest.publishConfig?.access, 'public', `${manifest.name} is not configured for public npm access.`);
  assert.equal(manifest.publishConfig?.registry, 'https://registry.npmjs.org/', `${manifest.name} uses a non-canonical registry.`);
  assert.ok(Array.isArray(manifest.files) && manifest.files.includes('README.md') && manifest.files.includes('LICENSE'), `${manifest.name} package allowlist is incomplete.`);
  assert.ok(existsSync(join(dirname(path), 'README.md')), `${manifest.name} has no package README.`);
  assert.ok(existsSync(join(dirname(path), 'LICENSE')), `${manifest.name} has no package license file.`);
  for (const forbidden of ['preinstall', 'install', 'postinstall']) assert.equal(typeof manifest.scripts?.[forbidden], 'undefined', `${manifest.name} contains forbidden '${forbidden}' lifecycle script.`);
}

verifyFreeze('release/spec-freeze.json', (freeze) => {
  for (const file of freeze.files) {
    const content = readFileSync(join(root, file.path));
    assert.equal(hash(content), file.sha256, `Frozen specification changed: ${file.path}`);
    assert.equal(content.byteLength, file.size, `Frozen specification size changed: ${file.path}`);
  }
  assert.equal(hash(Buffer.from(JSON.stringify(freeze.files))), freeze.integrity);
});
verifyFreeze('release/api-freeze.json', (freeze) => {
  const content = readFileSync(join(root, freeze.path));
  assert.equal(hash(content), freeze.sha256, 'Frozen public API baseline changed.');
  const api = JSON.parse(content.toString('utf8'));
  assert.equal(api.packages.length, freeze.packages);
});

for (const required of [
  'CODE_OF_CONDUCT.md', 'CONTRIBUTING.md', 'GOVERNANCE.md', 'MAINTENANCE.md', 'SUPPORT.md',
  'docs/RFC-PROCESS.md', 'docs/STABILIZATION.md', 'docs/VERSIONING.md', 'docs/PUBLISHING.md', 'docs/NPM-BOOTSTRAP.md', 'docs/GIT-PUBLISHING.md',
  'rfcs/README.md', 'rfcs/0000-template.md', 'release/v1-readiness.json', 'release/stabilization-policy.json',
  'scripts/release/initialize-git.mjs', 'scripts/release/verify-source-tree.mjs'
]) assert.ok(existsSync(join(root, required)), `Missing market-readiness file '${required}'.`);

const markers = /(?:\/\/|\/\*|^\s*\*)\s*(?:TODO|FIXME|XXX|STUB|PLACEHOLDER)\b|not implemented|expect\(true\)\.toBe\(true\)|throw new Error\([^\n)]*(?:stub|placeholder)/imu;
const markerFailures = [];
for (const rawPath of sourceFiles()) {
  const path = rawPath.replaceAll('\\', '/');
  if (path.endsWith('scripts/verify-package-manager-config.mjs') || path.endsWith('scripts/verify-phase22.mjs')) continue;
  const source = readFileSync(rawPath, 'utf8');
  if (markers.test(source)) markerFailures.push(relative(root, rawPath).replaceAll('\\', '/'));
}
assert.deepEqual(markerFailures, [], `Stub/placeholder markers remain: ${markerFailures.join(', ')}`);

const readiness = readJson('release/v1-readiness.json');
assert.equal(readiness.frameworkVersion, VERSION);
assert.ok(readiness.criteria.some((criterion) => criterion.id === 'external-audit' && criterion.status === 'pending'), 'External audit must remain an honest stable blocker until evidence exists.');
assert.ok(readiness.criteria.some((criterion) => criterion.id === 'official-applications-in-production' && criterion.status === 'pending'), 'Production application evidence must remain an honest stable blocker.');
const workflow = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8');
assert.match(workflow, /node:\s*\[22, 24\]/u);
assert.match(workflow, /os:\s*\[ubuntu-latest, windows-latest, macos-latest\]/u);
assert.match(workflow, /chromium firefox webkit/u);
const workflows = readdirSync(join(root, '.github/workflows'))
  .filter((name) => /\.ya?ml$/u.test(name))
  .map((name) => readFileSync(join(root, '.github/workflows', name), 'utf8'))
  .join('\n');
for (const legacy of ['actions/checkout@v4', 'actions/setup-node@v4', 'pnpm/action-setup@v4', 'github/codeql-action/init@v3', 'github/codeql-action/analyze@v3']) {
  assert.ok(!workflows.includes(legacy), `Legacy GitHub Action remains: ${legacy}`);
}
const releaseWorkflow = readFileSync(join(root, '.github/workflows/release.yml'), 'utf8');
assert.match(releaseWorkflow, /id-token:\s*write/u);
assert.match(releaseWorkflow, /npm@11\.5\.1/u);
assert.match(releaseWorkflow, /NPM_CONFIG_PROVENANCE:\s*'true'/u);
assert.match(releaseWorkflow, /inputs\.channel == 'stable' && 'latest' \|\| inputs\.channel/u);
console.log(`VX Phase 22 verification passed (${publicPackages.length} publishable packages, frozen specification/API, zero source placeholders).`);

function discoverWorkspaceManifests() {
  const output = [];
  for (const group of ['packages', 'apps']) {
    for (const entry of readdirSync(join(root, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(root, group, entry.name, 'package.json');
      if (existsSync(path)) output.push({ path, manifest: JSON.parse(readFileSync(path, 'utf8')) });
    }
  }
  return output;
}
function sourceFiles() {
  const output = [];
  const roots = ['packages', 'apps', 'tests', 'scripts'];
  const allowed = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vx']);
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['dist', 'node_modules', '.git'].includes(entry.name)) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && allowed.has(extname(entry.name))) output.push(path);
    }
  };
  for (const part of roots) visit(join(root, part));
  return output;
}
function verifyFreeze(path, verify) {
  const freeze = readJson(path);
  assert.equal(freeze.frameworkVersion, VERSION);
  verify(freeze);
}
function readJson(path) {
  return JSON.parse(readFileSync(join(root, path), 'utf8'));
}
function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}
