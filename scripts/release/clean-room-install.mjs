import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const available = spawnSync(pnpm, ['--version'], { encoding: 'utf8', shell: true });
assert.equal(available.status, 0, 'Clean-room installation requires the pinned pnpm executable.');
const temporary = await mkdtemp(join(tmpdir(), 'vx-clean-room-'));
const archives = join(temporary, 'archives');
const consumer = join(temporary, 'consumer');
try {
  await import('node:fs/promises').then(({ mkdir }) => Promise.all([mkdir(archives), mkdir(consumer)]));
  const dependencies = {};
  const smoke = [];
  for (const directory of await publicPackageDirectories(root)) {
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const before = new Set(await readdir(archives));
    const packed = spawnSync(pnpm, ['pack', '--pack-destination', archives], { cwd: directory, encoding: 'utf8', shell: true });
    assert.equal(packed.status, 0, packed.stderr || packed.stdout);
    const archive = (await readdir(archives)).find((name) => name.endsWith('.tgz') && !before.has(name));
    assert.ok(archive, `No archive produced for ${manifest.name}.`);
    const unique = `${manifest.name.replace(/[@/]/g, '-')}-${archive}`;
    const source = join(archives, archive);
    const target = join(archives, unique);
    await import('node:fs/promises').then(({ rename }) => rename(source, target));
    dependencies[manifest.name] = `file:${target}`;
    if (manifest.exports?.['.'] || typeof manifest.exports === 'string') smoke.push(`await import(${JSON.stringify(manifest.name)});`);
  }
  await writeFile(join(consumer, 'package.json'), `${JSON.stringify({ name: 'vx-clean-room-consumer', private: true, type: 'module', dependencies }, null, 2)}\n`);
  await writeFile(join(consumer, 'smoke.mjs'), `${smoke.join('\n')}\nconsole.log('VX clean-room imports passed.');\n`);
  await writeFile(join(consumer, '.pnpmfile.cjs'), `const deps = ${JSON.stringify(dependencies, null, 2)};
module.exports = {
  hooks: {
    readPackage(pkg) {
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        if (!pkg[field]) continue;
        for (const name of Object.keys(pkg[field])) {
          if (deps[name]) pkg[field][name] = deps[name];
        }
      }
      return pkg;
    }
  }
};
`);
  const install = spawnSync(pnpm, ['install', '--ignore-scripts', '--no-frozen-lockfile'], { cwd: consumer, encoding: 'utf8', shell: true, env: { ...process.env, CI: 'true' } });
  assert.equal(install.status, 0, install.stderr || install.stdout);
  const run = spawnSync(process.execPath, ['smoke.mjs'], { cwd: consumer, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
  console.log(`VX clean-room installation passed (${Object.keys(dependencies).length} published packages).`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function publicPackageDirectories(workspace) {
  const result = [];
  for (const parent of ['packages', 'apps']) {
    for (const entry of await readdir(join(workspace, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(workspace, parent, entry.name);
      try {
        if (!(await stat(join(directory, 'package.json'))).isFile()) continue;
        const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
        if (!manifest.private) result.push(directory);
      } catch {}
    }
  }
  return result.sort((left, right) => basename(left).localeCompare(basename(right)));
}
