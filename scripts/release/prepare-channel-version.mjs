import assert from 'node:assert/strict';
import { appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const channel = argument('--channel');
assert.ok(['canary', 'next'].includes(channel), 'Channel must be canary or next. Stable versions are prepared through reviewed Changesets.');
const sequence = Number(argument('--sequence') ?? process.env['GITHUB_RUN_NUMBER'] ?? 0);
assert.ok(Number.isSafeInteger(sequence) && sequence >= 0, 'Sequence must be a non-negative integer.');
const revision = String(argument('--revision') ?? process.env['GITHUB_SHA'] ?? 'local').toLowerCase().replace(/[^a-z0-9]/gu, '').slice(0, 12) || 'local';
const rootManifestPath = join(root, 'package.json');
const rootManifest = JSON.parse(await readFile(rootManifestPath, 'utf8'));
const base = String(rootManifest.version ?? '0.1.0').split('-', 1)[0];
assert.match(base, /^\d+\.\d+\.\d+$/u, `Root version '${base}' is not a stable semantic version core.`);
const version = channel === 'next' ? `${base}-next.${sequence}` : `${base}-canary.${revision}.${sequence}`;
rootManifest.version = version;
await writeFile(rootManifestPath, `${JSON.stringify(rootManifest, null, 2)}\n`);
for (const directory of await workspacePackageDirectories()) {
  const path = join(directory, 'package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  if (manifest.private === true) continue;
  manifest.version = version;
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`);
}
if (process.env['GITHUB_OUTPUT']) await appendFile(process.env['GITHUB_OUTPUT'], `version=${version}\ntag=vx-v${version}\n`);
console.log(`VX public packages prepared at ${version}.`);

async function workspacePackageDirectories() {
  const output = [];
  for (const group of ['packages', 'apps']) {
    for (const entry of await readdir(join(root, group), { withFileTypes: true })) {
      if (entry.isDirectory()) output.push(join(root, group, entry.name));
    }
  }
  return output;
}
function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
