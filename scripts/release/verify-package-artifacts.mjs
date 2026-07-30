import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validatePackagePolicy } from '../../packages/release/dist/index.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packages = await discoverPackages(root);
const temporary = await mkdtemp(join(tmpdir(), 'vx-packages-'));
try {
  for (const directory of packages) {
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    if (manifest.private) continue;
    const policy = validatePackagePolicy(manifest, { expectedRegistry: 'https://registry.npmjs.org/' });
    assert.equal(policy.valid, true, policy.issues.map((issue) => `${issue.packageName}: ${issue.message}`).join('\n'));
    for (const target of exportTargets(manifest.exports)) await assertArtifact(directory, target);
    if (typeof manifest.types === 'string') await assertArtifact(directory, manifest.types);
    if (typeof manifest.main === 'string') await assertArtifact(directory, manifest.main);
    for (const target of Object.values(manifest.bin ?? {})) if (typeof target === 'string') await assertArtifact(directory, target);

    const packed = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], { cwd: directory, encoding: 'utf8', shell: true });
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const result = JSON.parse(packed.stdout);
    const filename = result[0]?.filename;
    assert.equal(typeof filename, 'string');
    const archive = join(temporary, filename);
    const listing = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8', shell: true });
    assert.equal(listing.status, 0, listing.stderr);
    const entries = listing.stdout.trim().split('\n').map((item) => item.trim()).filter(Boolean);
    assert.ok(entries.some((entry) => entry === 'package/package.json'));
    assert.ok(entries.includes('package/README.md'), `${manifest.name} package is missing README.md.`);
    assert.ok(entries.includes('package/LICENSE'), `${manifest.name} package is missing LICENSE.`);
    assert.ok(entries.some((entry) => entry.startsWith('package/dist/')) || entries.some((entry) => entry.startsWith('package/bin/')));
    const leaked = entries.filter((entry) => isPrivateArtifactEntry(entry, manifest.name));
    assert.deepEqual(leaked, [], `${manifest.name} leaked source/test/private files: ${leaked.join(', ')}`);
    if (manifest.name === '@vx/cli') {
      for (const template of ['basic', 'starter', 'fullstack', 'library']) {
        assert.ok(entries.includes(`package/templates/${template}/package.json`), `@vx/cli package is missing template '${template}'.`);
      }
    }
  }
  console.log(`VX package artifact verification passed (${packages.length} workspace packages inspected).`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function discoverPackages(rootDirectory) {
  const roots = ['packages', 'apps'];
  const output = [];
  for (const parent of roots) {
    for (const entry of await readdir(join(rootDirectory, parent), { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const directory = join(rootDirectory, parent, entry.name);
        try { if ((await stat(join(directory, 'package.json'))).isFile()) output.push(directory); } catch {}
      }
    }
  }
  return output.sort();
}
function exportTargets(value) {
  if (typeof value === 'string') return value.startsWith('./dist/') ? [value] : [];
  if (!value || typeof value !== 'object') return [];
  return [...new Set(Object.values(value).flatMap(exportTargets))];
}
async function assertArtifact(directory, target) {
  if (!target.startsWith('./')) return;
  const path = join(directory, target);
  assert.equal((await stat(path)).isFile(), true, `Missing package artifact ${relative(directory, path)} in ${basename(directory)}.`);
}

function isPrivateArtifactEntry(entry, packageName) {
  const normalized = entry.replaceAll('\\', '/');
  if (/(?:^|\/)(?:node_modules|test|tests|\.env)(?:\/|$)/.test(normalized)) return true;
  if (!/(?:^|\/)src(?:\/|$)/.test(normalized)) return false;
  return !(packageName === '@vx/cli' && normalized.startsWith('package/templates/'));
}
