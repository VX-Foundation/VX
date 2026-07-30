import fs from 'node:fs';
import path from 'node:path';
import type { BuildMetadata } from './types.js';

export interface BuildCacheRecord {
  sourceFingerprint: string;
  artifactFingerprint: string;
  result: Readonly<Record<string, unknown>>;
}

export function readBuildCache(root: string): BuildCacheRecord | undefined {
  const filePath = cachePath(root);
  if (!fs.existsSync(filePath)) return undefined;
  try {
    const value: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!isRecord(value) || typeof value['sourceFingerprint'] !== 'string' || typeof value['artifactFingerprint'] !== 'string' || !isRecord(value['result'])) return undefined;
    return value as unknown as BuildCacheRecord;
  } catch { return undefined; }
}

export function writeBuildCache(root: string, record: BuildCacheRecord): void {
  const filePath = cachePath(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`);
}

export function writeBuildMetadata(outDir: string, metadata: BuildMetadata): string {
  const filePath = path.join(outDir, 'vx.build.json');
  fs.writeFileSync(filePath, `${JSON.stringify(metadata, null, 2)}\n`);
  return filePath;
}

function cachePath(root: string): string { return path.join(root, '.vx', 'cache', 'build.json'); }
function isRecord(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
