import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const verifierPath = path.join(scriptDirectory, 'verify-package-manager-config.mjs');

const validWorkspace = `packages:\n  - packages/*\n\npmOnFail: download\nengineStrict: true\nstrictDepBuilds: true\nminimumReleaseAge: 1440\n\nallowBuilds:\n  esbuild: true\n`;

async function createFixture({
  packageManager = 'pnpm@11.19.0',
  engine = '>=11.19.0 <12',
  workspace = validWorkspace,
  workflow = 'steps:\n  - uses: pnpm/action-setup@v6\n',
  npmrc = 'registry=https://registry.npmjs.org/\n',
} = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'vx-package-manager-'));
  await mkdir(path.join(root, '.github', 'workflows'), { recursive: true });
  await writeFile(path.join(root, 'package.json'), `${JSON.stringify({
    packageManager,
    engines: { pnpm: engine },
  }, null, 2)}\n`);
  await writeFile(path.join(root, 'pnpm-workspace.yaml'), workspace);
  await writeFile(path.join(root, '.npmrc'), npmrc);
  await writeFile(path.join(root, '.github', 'workflows', 'ci.yml'), workflow);
  return root;
}

function verify(root) {
  return spawnSync(process.execPath, [verifierPath], {
    encoding: 'utf8',
    env: { ...process.env, VX_REPOSITORY_ROOT: root },
  });
}

async function runCase(name, fixture, expectedStatus, expectedMessage) {
  const root = await createFixture(fixture);
  try {
    const result = verify(root);
    assert.equal(result.status, expectedStatus, `${name}: ${result.stderr || result.stdout}`);
    assert.match(`${result.stdout}\n${result.stderr}`, expectedMessage, name);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

await runCase('accepts pnpm 11.19 policy', {}, 0, /policy passed/u);
await runCase('rejects legacy onlyBuiltDependencies on modern pnpm', {
  workspace: validWorkspace.replace('allowBuilds:\n  esbuild: true', 'onlyBuiltDependencies:\n  - esbuild'),
}, 1, /must not be combined with allowBuilds|must use allowBuilds/u);
await runCase('rejects unresolved placeholders', {
  workspace: validWorkspace.replace('esbuild: true', 'set this to true or false'),
}, 1, /unresolved placeholder/u);
await runCase('rejects duplicated workflow versions', {
  workflow: 'steps:\n  - uses: pnpm/action-setup@v6\n    with:\n      version: 11.19.0\n',
}, 1, /duplicates the pnpm version/u);
await runCase('rejects global ignore-scripts', {
  npmrc: 'ignore-scripts=true\n',
}, 1, /must not disable all lifecycle scripts/u);
await runCase('rejects engine drift', { engine: '>=10.0.0' }, 1, /engines\.pnpm must equal/u);
await runCase('rejects removed pnpm 10 strictness setting', {
  workspace: validWorkspace.replace('pmOnFail: download', 'packageManagerStrictVersion: true'),
}, 1, /pmOnFail|removed in pnpm 11/u);
await runCase('rejects pnpm 10', {
  packageManager: 'pnpm@10.34.0',
  engine: '>=10.34.0 <11',
}, 1, /requires pnpm 11/u);

console.log('Package-manager policy tests passed.');
