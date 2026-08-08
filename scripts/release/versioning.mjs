import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const versionManifestPath = join(root, 'release', 'version.json');

const STABLE_SEMVER = /^\d+\.\d+\.\d+$/u;
const SPECIFICATION_VERSION = /^\d+\.\d+$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/u;
const CHANNELS = new Set(['canary', 'next', 'stable']);

export function readVersionManifest() {
  const manifest = readJson(versionManifestPath);
  assert.equal(manifest.version, 1, 'release/version.json uses an unsupported schema version.');
  assert.match(String(manifest.framework ?? ''), STABLE_SEMVER, 'release/version.json framework must be a stable x.y.z version.');
  assert.match(String(manifest.specification ?? ''), SPECIFICATION_VERSION, 'release/version.json specification must be an x.y line.');
  assert.ok(CHANNELS.has(manifest.channel), `release/version.json channel '${manifest.channel}' is not supported.`);
  assert.match(String(manifest.freezeDate ?? ''), ISO_DATE, 'release/version.json freezeDate must use YYYY-MM-DD.');
  return {
    framework: String(manifest.framework),
    specification: String(manifest.specification),
    channel: String(manifest.channel),
    freezeDate: String(manifest.freezeDate)
  };
}

export function writeVersionManifest(next) {
  const current = readJson(versionManifestPath);
  writeJson(versionManifestPath, {
    ...current,
    framework: next.framework,
    specification: next.specification,
    channel: next.channel,
    freezeDate: next.freezeDate
  });
  return readVersionManifest();
}

export function workspaceManifestPaths({ includeRoot = true } = {}) {
  const paths = includeRoot ? [join(root, 'package.json')] : [];
  for (const group of ['packages', 'apps']) {
    const directory = join(root, group);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = join(directory, entry.name, 'package.json');
      if (existsSync(manifest) && statSync(manifest).isFile()) paths.push(manifest);
    }
  }
  const tests = join(root, 'tests', 'package.json');
  if (existsSync(tests)) paths.push(tests);
  return paths.sort();
}

export function publicPackageManifests() {
  return workspaceManifestPaths().flatMap((path) => {
    const manifest = readJson(path);
    return manifest.private !== true && typeof manifest.name === 'string' && manifest.name.startsWith('@vx-foundation/')
      ? [{ path, manifest }]
      : [];
  }).sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeJson(path, value, compact = false) {
  const content = compact ? JSON.stringify(value) : JSON.stringify(value, null, 2);
  writeFileSync(path, `${content}\n`, 'utf8');
}

export function writeText(path, content) {
  writeFileSync(path, content, 'utf8');
}

export function replaceRequired(path, pattern, replacement) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, pattern, `Expected '${path}' to match ${pattern}.`);
  const next = source.replace(pattern, replacement);
  if (next !== source) writeFileSync(path, next, 'utf8');
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

export function releaseLine(framework) {
  return framework.split('.').slice(0, 2).join('.');
}
