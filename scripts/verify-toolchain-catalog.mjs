import { readFileSync, readdirSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const managed = new Set(['@types/node', 'eslint', 'typescript', 'vitest']);
const manifests = [resolve(root, 'package.json')];
for (const directory of ['apps', 'packages']) {
  for (const entry of readdirSync(resolve(root, directory), { withFileTypes: true })) {
    if (entry.isDirectory()) manifests.push(resolve(root, directory, entry.name, 'package.json'));
  }
}
manifests.push(resolve(root, 'tests/package.json'));

const violations = [];
for (const file of manifests) {
  let manifest;
  try { manifest = JSON.parse(readFileSync(file, 'utf8')); }
  catch { continue; }
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const [name, version] of Object.entries(manifest[section] ?? {})) {
      if (managed.has(name) && version !== 'catalog:') {
        violations.push(`${relative(root, file).replaceAll('\\', '/')}: ${section}.${name} must use catalog:, received ${version}`);
      }
    }
  }
}

if (violations.length) {
  console.error(`Toolchain catalog verification failed with ${violations.length} violation(s):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
console.log(`Toolchain catalog verified across ${manifests.length} workspace manifests.`);
