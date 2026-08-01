import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const packagesRoot = join(root, 'packages');
const appsRoot = join(root, 'apps');
const outputRoot = join(root, 'docs/api');
mkdirSync(outputRoot, { recursive: true });

const packages = [root, ...listDirectories(packagesRoot), ...listDirectories(appsRoot)]
  .filter((directory) => existsSync(join(directory, 'package.json')))
  .map((directory) => ({ directory, manifest: readJson(join(directory, 'package.json')) }))
  .filter(({ manifest }) => manifest.private !== true && typeof manifest.name === 'string' && manifest.name.startsWith('@vx-foundation/'))
  .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

const index = ['# VX API Reference', '', 'This reference is generated from published package manifests and public TypeScript exports. Undeclared subpaths are not public API.', ''];
for (const item of packages) {
  const file = `${item.manifest.name.replace('@vx-foundation/', '')}.md`;
  index.push(`- [\`${item.manifest.name}\`](${file}) - ${item.manifest.description ?? 'VX package.'}`);
  writePackageReference(item, join(outputRoot, file));
}
index.push('', 'Regenerate with `node scripts/docs/generate-api-reference.mjs`.');
writeFileSync(join(outputRoot, 'README.md'), `${index.join('\n')}\n`);
console.log(`Generated API reference for ${packages.length} packages.`);

function writePackageReference({ directory, manifest }, output) {
  const lines = [`# ${manifest.name}`, '', manifest.description ?? 'VX package.', '', `Current package line: \`${manifest.version}\`.`, '', '## Public entries', ''];
  const entries = normalizeExports(manifest.exports);
  for (const [entry, target] of entries) lines.push(`- \`${entry}\` -> \`${target}\``);
  if (entries.length === 0) lines.push('- Package root only.');

  const symbols = collectSymbols(join(directory, 'src'));
  lines.push('', '## Exported symbols', '');
  if (symbols.length === 0) lines.push('No statically discoverable named TypeScript exports.');
  else for (const symbol of symbols) lines.push(`- \`${symbol.name}\` - ${symbol.kind} in \`${symbol.file}\``);

  lines.push('', '## Stability', '', 'Only entries listed above are public. Imports from `src`, `dist`, or undeclared files are unsupported and rejected by the official-application gate.', '');
  writeFileSync(output, lines.join('\n'));
}

function normalizeExports(value) {
  if (!value) return [];
  if (typeof value === 'string') return [['.', value]];
  const entries = [];
  for (const [entry, target] of Object.entries(value)) {
    if (!entry.startsWith('.')) continue;
    entries.push([entry, resolveTarget(target)]);
  }
  return entries.sort(([left], [right]) => left.localeCompare(right));
}

function resolveTarget(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '(blocked)';
  for (const condition of ['types', 'import', 'default', 'node', 'browser']) {
    if (condition in value) return resolveTarget(value[condition]);
  }
  return '(conditional export)';
}

function collectSymbols(sourceRoot) {
  if (!existsDirectory(sourceRoot)) return [];
  const symbols = [];
  for (const file of walk(sourceRoot)) {
    if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue;
    const text = readFileSync(file, 'utf8');
    const pattern = /^export\s+(?:declare\s+)?(?:abstract\s+)?(class|function|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gm;
    for (const match of text.matchAll(pattern)) symbols.push({ kind: match[1], name: match[2], file: relative(sourceRoot, file).replaceAll('\\', '/') });
  }
  return symbols.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file));
}

function walk(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

function listDirectories(directory) {
  if (!existsDirectory(directory)) return [];
  return readdirSync(directory)
    .map((name) => join(directory, name))
    .filter((candidate) => statSync(candidate).isDirectory());
}

function existsDirectory(path) {
  try { return statSync(path).isDirectory(); } catch { return false; }
}
function readJson(path) { return JSON.parse(readFileSync(path, 'utf8')); }
