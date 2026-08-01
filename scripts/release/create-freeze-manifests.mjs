import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const rootManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const frameworkVersion = rootManifest.version;
const specDirectory = join(root, 'docs', 'spec');
const specFiles = (await readdir(specDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
  .map((entry) => join(specDirectory, entry.name))
  .sort();
const files = [];
for (const path of specFiles) {
  const content = await readFile(path);
  files.push({
    path: relative(root, path).replaceAll('\\', '/'),
    size: content.byteLength,
    sha256: hash(content)
  });
}
const spec = {
  schema: 'https://vx.dev/schemas/spec-freeze/v1',
  version: 1,
  frameworkVersion,
  specificationVersion: '0.1',
  frozenAt: '2026-07-30',
  files,
  integrity: hash(Buffer.from(JSON.stringify(files)))
};
await writeFile(join(root, 'release', 'spec-freeze.json'), `${JSON.stringify(spec, null, 2)}\n`);

const apiPath = join(root, 'release', 'api-baseline.json');
const apiContent = await readFile(apiPath);
const api = JSON.parse(apiContent.toString('utf8'));
const entrypoints = Array.isArray(api.packages)
  ? api.packages.reduce((total, pkg) => total + (Array.isArray(pkg.entrypoints) ? pkg.entrypoints.length : 0), 0)
  : 0;
const apiFreeze = {
  schema: 'https://vx.dev/schemas/api-freeze/v1',
  version: 1,
  frameworkVersion,
  frozenAt: '2026-07-30',
  path: 'release/api-baseline.json',
  packages: Array.isArray(api.packages) ? api.packages.length : 0,
  entrypoints,
  sha256: hash(apiContent)
};
await writeFile(join(root, 'release', 'api-freeze.json'), `${JSON.stringify(apiFreeze, null, 2)}\n`);
console.log(`VX freeze manifests generated (${files.length} specification files, ${apiFreeze.packages} API packages).`);

function hash(content) {
  return createHash('sha256').update(content).digest('hex');
}
