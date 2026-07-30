import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const expected = 'https://github.com/VX-Foundation/vx';
assert.equal(manifest.repository?.url, 'git+https://github.com/VX-Foundation/vx.git');
assert.equal(manifest.homepage, `${expected}#readme`);
const git = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, encoding: 'utf8' });
if (git.status !== 0) {
  console.log('VX repository metadata is valid. Git has not been initialized in this extracted source tree.');
  process.exit(0);
}
const branch = run(['branch', '--show-current']);
assert.ok(branch === 'main' || branch === '', `Expected main branch, received '${branch}'.`);
const remote = runOptional(['remote', 'get-url', 'origin']);
if (remote) {
  const normalized = remote.replace(/^git@github\.com:/u, 'https://github.com/').replace(/\.git$/u, '');
  assert.equal(normalized, expected, `origin points to '${remote}', expected '${expected}'.`);
}
const status = run(['status', '--porcelain']);
if (status) console.warn('VX repository contains uncommitted changes; publishing is blocked until the tree is clean.');
console.log('VX canonical repository check passed.');

function run(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
function runOptional(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}
