import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const spawnOptions = { encoding: 'utf8', shell: process.platform === 'win32', timeout: 60_000 };
const version = spawnSync(npm, ['--version'], spawnOptions);
assert.equal(version.status, 0, 'npm CLI is required.');
const npmVersion = version.stdout.trim();
assert.ok(atLeast(npmVersion, [11, 5, 1]), `npm 11.5.1 or newer is required for trusted publishing; found ${npmVersion}.`);
const whoami = spawnSync(npm, ['whoami', '--registry', 'https://registry.npmjs.org/'], spawnOptions);
if (whoami.status !== 0) {
  const details = [whoami.stderr, whoami.stdout].filter(Boolean).join('\n').trim();
  throw new Error([
    'npm authentication failed. The configured credential may be missing, expired, or revoked.',
    details,
    'Run `npm logout --registry https://registry.npmjs.org/`, then `npm login --auth-type=web --registry https://registry.npmjs.org/`.',
    'Confirm the new session with `npm whoami --registry https://registry.npmjs.org/` before retrying this preflight.',
    'Trusted publishing uses GitHub OIDC after the one-time package bootstrap, but this manual ownership check requires an authenticated maintainer.'
  ].filter(Boolean).join('\n'));
}
const identity = whoami.stdout.trim();
const packages = await publicPackages();
for (const manifest of packages) {
  assert.equal(manifest.publishConfig?.registry, 'https://registry.npmjs.org/');
  assert.equal(manifest.publishConfig?.access, 'public');
  const view = spawnSync(npm, ['view', manifest.name, 'name', '--json', '--registry', 'https://registry.npmjs.org/'], spawnOptions);
  if (view.status === 0) {
    console.log(`${manifest.name}: existing package found; confirm ${identity} or its organization has publish permission.`);
  } else if (!/E404|404 Not Found/iu.test(`${view.stderr}\n${view.stdout}`)) {
    throw new Error(`Unable to verify '${manifest.name}': ${view.stderr || view.stdout}`);
  } else {
    console.log(`${manifest.name}: package name is currently unpublished.`);
  }
}
console.log(`VX npm preflight completed for ${packages.length} packages as '${identity}'. Unpublished packages require the documented one-time bootstrap before trusted publishing can be configured.`);

async function publicPackages() {
  const output = [JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))];
  for (const group of ['packages', 'apps']) {
    for (const entry of await readdir(join(root, group), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(root, group, entry.name, 'package.json');
      try {
        const manifest = JSON.parse(await readFile(path, 'utf8'));
        if (manifest.private !== true) output.push(manifest);
      } catch {
        continue;
      }
    }
  }
  return output.sort((a, b) => a.name.localeCompare(b.name));
}

function atLeast(value, minimum) {
  const parts = value.split(/[.-]/u).slice(0, 3).map((part) => Number(part));
  if (parts.some((part) => !Number.isSafeInteger(part) || part < 0)) return false;
  while (parts.length < 3) parts.push(0);
  for (let index = 0; index < minimum.length; index += 1) {
    if (parts[index] > minimum[index]) return true;
    if (parts[index] < minimum[index]) return false;
  }
  return true;
}
