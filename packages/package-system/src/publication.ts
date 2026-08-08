import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { canonicalJson } from './canonical.js';
import { createIntegrity, verifyIntegrity } from './integrity.js';
import type { PublicationFile, PublicationManifest } from './types.js';

export interface CreatePublicationManifestOptions {
  maxFiles?: number;
  maxFileBytes?: number;
  maxTotalBytes?: number;
  ignore?: readonly string[];
}

export function createPublicationManifest(root: string, packageName: string, packageVersion: string, options: CreatePublicationManifestOptions = {}): PublicationManifest {
  const packageRoot = realpathSync(resolve(root));
  const maxFiles = bounded(options.maxFiles ?? 20_000, 1, 100_000, 'maxFiles');
  const maxFileBytes = bounded(options.maxFileBytes ?? 100 * 1024 * 1024, 1, 1024 * 1024 * 1024, 'maxFileBytes');
  const maxTotalBytes = bounded(options.maxTotalBytes ?? 1024 * 1024 * 1024, 1, 4 * 1024 * 1024 * 1024, 'maxTotalBytes');
  const ignored = new Set(['node_modules', '.git', '.vx/cache', ...(options.ignore ?? [])].map(normalize));
  const files: PublicationFile[] = [];
  let total = 0;
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = resolve(directory, entry.name);
      const relativePath = normalize(relative(packageRoot, path));
      if (ignored.has(relativePath) || [...ignored].some((prefix) => relativePath.startsWith(`${prefix}/`))) continue;
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) throw new Error(`Publication cannot include symbolic link '${relativePath}'.`);
      if (stats.isDirectory()) { visit(path); continue; }
      if (!stats.isFile()) throw new Error(`Publication entry '${relativePath}' is not a regular file.`);
      const real = realpathSync(path);
      if (!within(real, packageRoot)) throw new Error(`Publication entry '${relativePath}' resolves outside the package root.`);
      const size = statSync(real).size;
      if (size > maxFileBytes) throw new Error(`Publication file '${relativePath}' exceeds ${maxFileBytes} bytes.`);
      total += size;
      if (total > maxTotalBytes) throw new Error(`Publication exceeds ${maxTotalBytes} total bytes.`);
      if (files.length >= maxFiles) throw new Error(`Publication exceeds ${maxFiles} files.`);
      files.push({ path: relativePath, size, integrity: createIntegrity(readFileSync(real), 'sha512') });
    }
  };
  visit(packageRoot);
  const ordered = files.sort((left, right) => left.path.localeCompare(right.path));
  const payload = canonicalJson({ packageName, packageVersion, files: ordered });
  return Object.freeze({
    schema: 'https://vx.veelv.site/schemas/publication/v1', version: 1,
    packageName, packageVersion,
    files: Object.freeze(ordered.map((file) => Object.freeze(file))),
    integrity: createIntegrity(payload, 'sha512')
  });
}

export function verifyPublicationManifest(root: string, manifest: PublicationManifest): boolean {
  try {
    const recreated = createPublicationManifest(root, manifest.packageName, manifest.packageVersion, { ignore: ['vx.publication.json', 'vx.signature.json'] });
    if (!verifyIntegrity(canonicalJson({ packageName: recreated.packageName, packageVersion: recreated.packageVersion, files: recreated.files }), manifest.integrity)) return false;
    return recreated.files.length === manifest.files.length && recreated.files.every((file, index) => {
      const expected = manifest.files[index];
      return Boolean(expected && file.path === expected.path && file.size === expected.size && file.integrity === expected.integrity);
    });
  } catch { return false; }
}

function bounded(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new TypeError(`${label} must be between ${minimum} and ${maximum}.`);
  return value;
}
function normalize(value: string): string { return value.replaceAll('\\', '/').replace(/^\.\//, ''); }
function within(path: string, root: string): boolean { return path === root || path.startsWith(`${root}${sep}`); }
