import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const nextVersion = argument('--version');
assert.ok(nextVersion, 'Use --version <x.y.z> to sync the workspace release line.');
assert.match(nextVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, `Version '${nextVersion}' is not valid semver.`);

const rootManifestPath = join(root, 'package.json');
const rootManifest = await readJson(rootManifestPath);
const currentVersion = String(rootManifest.version ?? '');
assert.match(currentVersion, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u, `Current root version '${currentVersion}' is not valid semver.`);

await updateJson(rootManifestPath, (manifest) => {
  manifest.version = nextVersion;
});

for (const manifestPath of await workspaceManifestPaths()) {
  await updateJson(manifestPath, (manifest) => {
    manifest.version = nextVersion;
  });
}

await writeText(join(root, 'VERSION'), `${nextVersion}\n`);
await updateJson(join(root, 'release', 'release-policy.json'), (manifest) => {
  manifest.frameworkVersion = nextVersion;
});
await updateJson(join(root, 'release', 'v1-readiness.json'), (manifest) => {
  manifest.frameworkVersion = nextVersion;
});
await updateJson(join(root, 'apps', 'browser-devtools', 'manifest.json'), (manifest) => {
  manifest.version = nextVersion;
});

await replaceInFile(
  join(root, 'packages', 'plugins', 'src', 'sitemap', 'index.ts'),
  /version:\s*'[^']+'/u,
  `version: '${nextVersion}'`
);
await replaceInFile(
  join(root, 'README.md'),
  /((?:`Current release line:\s*`|\*\*Current release line:\*\*)\s*`)([^`]+)(`\s+unstable\.)/u,
  `$1${nextVersion}$3`
);
await replaceInFile(
  join(root, 'docs', 'RELEASE.md'),
  /\b\d+\.\d+\.\d+-canary\.<revision>\.<sequence>\b/u,
  `${nextVersion}-canary.<revision>.<sequence>`
);
await replaceInFile(
  join(root, 'docs', 'RELEASE.md'),
  /\b\d+\.\d+\.\d+-next\.<sequence>\b/u,
  `${nextVersion}-next.<sequence>`
);
await replaceInFile(
  join(root, '.github', 'ISSUE_TEMPLATE', 'bug-report.yml'),
  /placeholder:\s+\d+\.\d+\.\d+-next\.0/u,
  `placeholder: ${nextVersion}-next.0`
);

runNodeScript(join(root, 'packages', 'cli', 'dist', 'cli.js'), ['release:snapshot', root, '--out', join(root, 'release', 'api-baseline.json')]);
runNodeScript(join(root, 'scripts', 'release', 'create-freeze-manifests.mjs'));
runNodeScript(join(root, 'scripts', 'docs', 'generate-api-reference.mjs'));

console.log(`VX workspace synced from ${currentVersion} to ${nextVersion}.`);

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function workspaceManifestPaths() {
  const output = [];
  for (const group of ['packages', 'apps']) {
    for (const directory of await childDirectories(join(root, group))) {
      output.push(join(directory, 'package.json'));
    }
  }
  output.push(join(root, 'tests', 'package.json'));
  return output;
}

async function childDirectories(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const absolute = join(directory, entry.name);
    if ((await stat(absolute)).isDirectory()) output.push(absolute);
  }
  return output;
}

async function updateJson(path, mutator) {
  const value = JSON.parse(await readFile(path, 'utf8'));
  mutator(value);
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function writeText(path, content) {
  await writeFile(path, content, 'utf8');
}

async function replaceInFile(path, pattern, replacement) {
  const source = await readFile(path, 'utf8');
  const next = source.replace(pattern, replacement);
  assert.notEqual(next, source, `Expected '${path}' to match ${pattern}.`);
  await writeFile(path, next, 'utf8');
}

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    throw new Error(`Command failed: ${[process.execPath, scriptPath, ...args].join(' ')}`);
  }
}
