import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { readVersionManifest, root, sha256 } from './versioning.mjs';

const { framework, specification, freezeDate } = readVersionManifest();
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
    sha256: sha256(content)
  });
}
const spec = {
  schema: 'https://vx.veelv.site/schemas/spec-freeze/v1',
  version: 1,
  frameworkVersion: framework,
  specificationVersion: specification,
  frozenAt: freezeDate,
  files,
  integrity: sha256(Buffer.from(JSON.stringify(files)))
};
await writeFile(join(root, 'release/spec-freeze.json'), `${JSON.stringify(spec, null, 2)}\n`);

const apiPath = join(root, 'release/api-baseline.json');
const apiContent = await readFile(apiPath);
const api = JSON.parse(apiContent.toString('utf8'));
const entrypoints = Array.isArray(api.packages)
  ? api.packages.reduce((total, pkg) => total + (Array.isArray(pkg.entrypoints) ? pkg.entrypoints.length : 0), 0)
  : 0;
const apiFreeze = {
  schema: 'https://vx.veelv.site/schemas/api-freeze/v1',
  version: 1,
  frameworkVersion: framework,
  frozenAt: freezeDate,
  path: 'release/api-baseline.json',
  packages: Array.isArray(api.packages) ? api.packages.length : 0,
  entrypoints,
  sha256: sha256(apiContent)
};
await writeFile(join(root, 'release/api-freeze.json'), `${JSON.stringify(apiFreeze, null, 2)}\n`);
console.log(`VX freeze manifests generated (${files.length} specification files, ${apiFreeze.packages} API packages).`);
