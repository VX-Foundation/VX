import { createHash } from 'node:crypto';
import type { ProvenanceFile, ProvenanceManifest } from './types.js';

export interface ProvenanceInputFile {
  path: string;
  content: string | Uint8Array;
}

export function createProvenanceManifest(
  packageName: string,
  packageVersion: string,
  sourceRevision: string,
  inputFiles: readonly ProvenanceInputFile[]
): ProvenanceManifest {
  if (!packageName || !packageVersion || !sourceRevision) throw new TypeError('VX provenance requires package, version, and source revision.');
  const files = inputFiles.map((file) => toFile(file)).sort((left, right) => left.path.localeCompare(right.path));
  const payload = JSON.stringify({ packageName, packageVersion, sourceRevision, files });
  return {
    schema: 'https://vx.dev/schemas/release-provenance/v1',
    version: 1,
    packageName,
    packageVersion,
    sourceRevision,
    files,
    integrity: integrity(payload)
  };
}

export function verifyProvenanceManifest(manifest: ProvenanceManifest, inputFiles: readonly ProvenanceInputFile[]): boolean {
  const recreated = createProvenanceManifest(manifest.packageName, manifest.packageVersion, manifest.sourceRevision, inputFiles);
  return recreated.integrity === manifest.integrity
    && recreated.files.length === manifest.files.length
    && recreated.files.every((file, index) => {
      const expected = manifest.files[index];
      return Boolean(expected && file.path === expected.path && file.size === expected.size && file.integrity === expected.integrity);
    });
}

function toFile(file: ProvenanceInputFile): ProvenanceFile {
  if (!file.path || file.path.startsWith('/') || file.path.split(/[\\/]+/).includes('..')) throw new TypeError(`Invalid provenance path '${file.path}'.`);
  const bytes = typeof file.content === 'string' ? new TextEncoder().encode(file.content) : file.content;
  return { path: file.path.replaceAll('\\', '/'), size: bytes.byteLength, integrity: integrity(bytes) };
}

function integrity(value: string | Uint8Array): string {
  return `sha256-${createHash('sha256').update(value).digest('base64')}`;
}
