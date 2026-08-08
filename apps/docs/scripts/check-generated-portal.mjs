import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '..', '..');
const tracked = [join(appRoot, 'src', 'pages'), join(appRoot, 'src', 'content', 'index.ts'), join(repositoryRoot, 'docs', 'widgets')];
const before = snapshot(tracked);
const result = spawnSync(process.execPath, [join(appRoot, 'scripts', 'generate-portal.mjs')], { cwd: appRoot, encoding: 'utf8' });
if (result.status !== 0) {
  process.stderr.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  process.exit(result.status ?? 1);
}
const after = snapshot(tracked);
assert.equal(after, before, 'Generated documentation is stale. Run `pnpm docs:generate` and commit the result.');
console.log('VX generated documentation is current.');

function snapshot(paths) {
  const hash = createHash('sha256');
  for (const path of paths.flatMap(expand).sort()) {
    hash.update(relative(appRoot, path).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(path));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function expand(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).flatMap((name) => expand(join(path, name)));
}
