import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
assert.equal(spawnSync(pnpm, ['--version'], { encoding: 'utf8', shell: true }).status, 0, 'VX clean-room project verification requires pnpm.');

const temporary = mkdtempSync(join(tmpdir(), 'vx-clean-room-projects-'));
const archives = join(temporary, 'archives');
const factory = join(temporary, 'factory');
mkdirSync(archives, { recursive: true });
mkdirSync(factory, { recursive: true });

try {
  const packages = packWorkspacePackages();
  const dependencies = Object.fromEntries([...packages].map(([name, archive]) => [name, `file:${archive}`]));
  const pnpmfile = `const deps = ${JSON.stringify(dependencies, null, 2)};
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
`;
  writeFileSync(join(factory, 'package.json'), `${JSON.stringify({ name: 'vx-project-factory', private: true, type: 'module', dependencies }, null, 2)}\n`);
  writeFileSync(join(factory, '.pnpmfile.cjs'), pnpmfile);
  run(pnpm, ['install', '--ignore-scripts', '--no-frozen-lockfile'], factory);

  for (const template of ['basic', 'starter', 'fullstack', 'library']) {
    const projectName = `generated-${template}`;
    run(pnpm, ['exec', 'create-vx', projectName, '--template', template], factory);
    const project = join(factory, projectName);
    writeFileSync(join(project, '.pnpmfile.cjs'), pnpmfile);
    rewriteFrameworkDependencies(project, packages);
    run(pnpm, ['install', '--ignore-scripts', '--no-frozen-lockfile'], project);
    for (const script of ['doctor', 'check', 'lint', 'test', 'build']) run(pnpm, ['run', script], project);
    if (template === 'library') run(pnpm, ['run', 'package'], project);
    else await verifyPreview(project);
  }
  console.log('VX clean-room project creation passed for basic, starter, fullstack, and library templates.');
} finally {
  rmSync(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

function packWorkspacePackages() {
  const packages = new Map();
  packPackage(root, packages);
  for (const parent of ['packages', 'apps']) {
    const directory = join(root, parent);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const packageRoot = join(directory, entry.name);
      let manifest;
      try { manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')); } catch { continue; }
      if (manifest.private) continue;
      packPackage(packageRoot, packages);
    }
  }
  assert.ok(packages.has('@vx-foundation/vx') && packages.has('@vx-foundation/cli') && packages.has('@vx-foundation/create-vx'), 'Clean-room artifacts must include the VX facade, CLI, and project initializer.');
  return packages;
}

function packPackage(packageRoot, packages) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  if (manifest.private) return;
  const before = new Set(readdirSync(archives));
  run(pnpm, ['pack', '--pack-destination', archives], packageRoot);
  const archiveName = readdirSync(archives).find((name) => name.endsWith('.tgz') && !before.has(name));
  assert.ok(archiveName, `No archive was emitted for ${manifest.name}.`);
  const unique = `${manifest.name.replace(/[@/]/g, '-')}-${archiveName}`;
  const target = join(archives, unique);
  renameSync(join(archives, archiveName), target);
  packages.set(manifest.name, target);
}

function rewriteFrameworkDependencies(project, packages) {
  const path = join(project, 'package.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8'));
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      const archive = packages.get(name);
      if (archive) manifest[field][name] = `file:${archive}`;
    }
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function verifyPreview(project) {
  const port = await freePort();
  const child = spawn(pnpm, ['run', 'preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: project,
    shell: true,
    env: { ...process.env, CI: 'true' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += String(chunk); });
  child.stderr.on('data', (chunk) => { output += String(chunk); });
  try {
    try {
      await waitFor(async () => {
        try { const response = await fetch(`http://127.0.0.1:${port}/`); return response.status < 500; }
        catch { return false; }
      }, 15_000);
    } catch (err) {
      throw new Error(`Preview server startup timed out after 15s. Process output:\n${output}`);
    }
    const response = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(response.ok, true, `Preview returned ${response.status}.\n${output}`);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      if (process.platform === 'win32' && child.pid) {
        spawnSync('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        child.kill('SIGTERM');
      }
      await new Promise((resolveClose) => child.once('exit', resolveClose));
    }
  }
}

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', shell: true, env: { ...process.env, CI: 'true' } });
  assert.equal(result.status, 0, `${executable} ${args.join(' ')} failed in ${basename(cwd)}:\n${result.stdout}\n${result.stderr}`);
}

function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close((error) => error ? reject(error) : resolvePort(port));
    });
  });
}

async function waitFor(predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error(`Timed out after ${timeoutMs} ms.`);
}
