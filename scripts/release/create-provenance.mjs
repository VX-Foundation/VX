import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const revision = process.env.GITHUB_SHA ?? process.env.SOURCE_REVISION ?? 'local-uncommitted';
const rootManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const inputs = [];

await collect(root);
const result = createProvenanceManifest(rootManifest.name, rootManifest.version, revision, inputs);
const output = join(root, 'release', 'provenance.json');
await mkdir(join(root, 'release'), { recursive: true });
await writeFile(output, `${JSON.stringify(result)}\n`);
console.log(`Wrote ${output} (${inputs.length} files).`);

async function collect(path) {
  const relativePath = relative(root, path).replaceAll('\\', '/');
  if (relativePath && excluded(relativePath)) return;

  const details = await lstat(path);
  if (details.isSymbolicLink()) {
    throw new Error(`Refusing to include symbolic link in provenance: ${relativePath}`);
  }
  if (details.isDirectory()) {
    for (const item of (await readdir(path)).sort()) await collect(join(path, item));
    return;
  }
  if (!details.isFile()) return;
  inputs.push({ path: relativePath, content: await readFile(path) });
}

function createProvenanceManifest(packageName, packageVersion, sourceRevision, inputFiles) {
  if (!packageName || !packageVersion || !sourceRevision) {
    throw new TypeError('VX provenance requires package, version, and source revision.');
  }
  const files = inputFiles.map(toFile).sort((left, right) => left.path.localeCompare(right.path));
  const payload = JSON.stringify({ packageName, packageVersion, sourceRevision, files });
  return {
    schema: 'https://vx.veelv.site/schemas/release-provenance/v1',
    version: 1,
    packageName,
    packageVersion,
    sourceRevision,
    files,
    integrity: integrity(payload)
  };
}

function toFile(file) {
  if (!file.path || file.path.startsWith('/') || file.path.split(/[\\/]+/).includes('..')) {
    throw new TypeError(`Invalid provenance path '${file.path}'.`);
  }
  const bytes = typeof file.content === 'string' ? new TextEncoder().encode(file.content) : file.content;
  return {
    path: file.path.replaceAll('\\', '/'),
    size: bytes.byteLength,
    integrity: integrity(bytes)
  };
}

function integrity(value) {
  return `sha256-${createHash('sha256').update(value).digest('base64')}`;
}

function excluded(path) {
  const segments = path.split('/');
  if (segments.some((segment) => ['.git', 'node_modules', 'dist', '.turbo', 'coverage', 'playwright-report', 'test-results'].includes(segment))) {
    return true;
  }
  return path === 'release/provenance.json'
    || path.endsWith('.tsbuildinfo')
    || path.endsWith('.zip')
    || path.endsWith('.tgz');
}
