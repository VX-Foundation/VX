import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const canonical = normalizeRemote(manifest.repository?.url);
assert.ok(canonical, 'package.json must declare the canonical Git repository.');
const requestedRemote = argument('--remote') ?? canonical;
const noRemote = process.argv.includes('--no-remote');
const git = process.platform === 'win32' ? 'git.exe' : 'git';

run(['--version']);
if (!existsSync(resolve(root, '.git'))) {
  run(['init', '--initial-branch=main']);
  console.log('Initialized Git repository on branch main.');
} else {
  console.log('Existing Git repository detected; initialization was skipped.');
}

const branch = run(['branch', '--show-current'], true).stdout.trim();
if (!branch) run(['checkout', '-b', 'main']);
if (!noRemote) {
  const remotes = run(['remote'], true).stdout.trim().split(/\s+/u).filter(Boolean);
  if (remotes.includes('origin')) {
    const existing = run(['remote', 'get-url', 'origin'], true).stdout.trim();
    assert.equal(normalizeRemote(existing), normalizeRemote(requestedRemote), `Origin points to '${existing}', not '${requestedRemote}'.`);
  } else {
    run(['remote', 'add', 'origin', requestedRemote]);
    console.log(`Configured origin: ${requestedRemote}`);
  }
}
console.log('Git bootstrap complete. Review the tree, then create a signed initial commit and push it through the protected main-branch process.');

function run(args, capture = false) {
  const result = spawnSync(git, args, { cwd: root, encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
  assert.equal(result.status, 0, result.stderr || `git ${args.join(' ')} failed.`);
  return result;
}
function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
function normalizeRemote(value) {
  return String(value ?? '')
    .replace(/^git\+/u, '')
    .replace(/^git@github\.com:/u, 'https://github.com/')
    .replace(/\.git$/u, '')
    .replace(/\/$/u, '');
}
