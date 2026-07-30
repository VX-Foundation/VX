import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const required = [
  'packages/release/src/index.ts',
  'packages/compiler/src/analyze/accessibility.ts',
  'packages/runtime/src/security/url.ts',
  'scripts/security/phase9-security.mjs',
  'scripts/fuzz/phase9-fuzz.mjs',
  'scripts/benchmark/phase9-benchmark.mjs',
  'scripts/release/verify-package-artifacts.mjs',
  'scripts/release/clean-room-install.mjs',
  'benchmarks/phase9-baseline.json',
  'release/release-policy.json',
  'SECURITY.md',
  'docs/THREAT-MODEL.md',
  'docs/COMPATIBILITY.md',
  'docs/RELEASE.md',
  '.github/workflows/release.yml',
  '.github/workflows/codeql.yml'
];
for (const file of required) assert.equal((await stat(join(root, file))).isFile(), true, `Missing Phase 9 artifact ${file}.`);

const testFiles = await files(join(root, 'tests'));
for (const file of testFiles.filter((item) => item.endsWith('.ts'))) {
  const source = await readFile(file, 'utf8');
  assert.ok(!/placeholder passing test|eventually test|expect\(true\)\.toBe\(true\)/i.test(source), `Placeholder remains in ${file}.`);
}

const workspace = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const script of ['verify:conformance', 'test:browser', 'security:verify', 'bench:quality', 'release:check', 'release:provenance']) {
  assert.equal(typeof workspace.scripts?.[script], 'string', `Missing root script ${script}.`);
}
const policy = JSON.parse(await readFile(join(root, 'release/release-policy.json'), 'utf8'));
assert.equal(policy.channels.stable.provenance, true);
assert.equal(policy.channels.stable.compatibility, 'required');
assert.equal(policy.registry, 'https://registry.npmjs.org/');

const packages = await packageDirectories(root);
let publicCount = 0;
for (const directory of packages) {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (manifest.private) continue;
  publicCount += 1;
  assert.equal(manifest.license, 'MIT', `${manifest.name} must declare MIT.`);
  const expectedFiles = manifest.name === '@vx/cli'
    ? ['dist', 'bin', 'templates', 'README.md', 'LICENSE']
    : manifest.name === 'create-vx'
      ? ['dist', 'bin', 'README.md', 'LICENSE']
      : ['dist', 'README.md', 'LICENSE'];
  assert.deepEqual(manifest.files, expectedFiles, `${manifest.name} must publish the expected artifacts.`);
  assert.equal(manifest.publishConfig?.registry, 'https://registry.npmjs.org/');
  assert.equal(manifest.publishConfig?.access, 'public');
  assert.equal(manifest.engines?.node, '>=22.11.0 <23 || >=24.11.0 <25');
  assert.equal(typeof manifest.sideEffects, 'boolean');
  for (const lifecycle of ['preinstall', 'install', 'postinstall']) assert.equal(manifest.scripts?.[lifecycle], undefined, `${manifest.name} has forbidden lifecycle script ${lifecycle}.`);
}
assert.ok(publicCount >= 15);
console.log(`Phase 9 structural verification passed (${publicCount} public packages).`);

async function files(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await files(path)); else output.push(path);
  }
  return output;
}
async function packageDirectories(rootDirectory) {
  const output = [];
  for (const parent of ['packages', 'apps']) {
    for (const entry of await readdir(join(rootDirectory, parent), { withFileTypes: true })) {
      const directory = join(rootDirectory, parent, entry.name);
      if (entry.isDirectory()) {
        try { if ((await stat(join(directory, 'package.json'))).isFile()) output.push(directory); } catch {}
      }
    }
  }
  return output;
}
