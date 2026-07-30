import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ALWAYS_EXCLUDED = new Set(['.git', '.turbo', '.vx', 'node_modules']);

export function sourceFingerprint(root: string, extra: unknown, excludedPaths: readonly string[] = []): string {
  const hash = createHash('sha256');
  for (const filePath of sourceFiles(root, excludedPaths)) {
    const relative = path.relative(root, filePath).split(path.sep).join('/');
    hash.update(relative); hash.update('\0'); hash.update(fs.readFileSync(filePath)); hash.update('\0');
  }
  hash.update(stableJson(extra));
  return hash.digest('hex');
}

export function artifactFingerprint(root: string): string {
  const hash = createHash('sha256');
  for (const filePath of allFiles(root)) {
    const relative = path.relative(root, filePath).split(path.sep).join('/');
    if (relative === 'vx.build.json') continue;
    hash.update(relative); hash.update('\0'); hash.update(fs.readFileSync(filePath)); hash.update('\0');
  }
  return hash.digest('hex');
}

export function fileHash(content: Uint8Array): string { return createHash('sha256').update(content).digest('hex'); }

function sourceFiles(root: string, excludedPaths: readonly string[]): string[] {
  const excluded = excludedPaths.map((entry) => path.resolve(entry));
  return allFiles(root).filter((filePath) => {
    const relative = path.relative(root, filePath).split(path.sep).join('/');
    if (excluded.some((entry) => filePath === entry || filePath.startsWith(`${entry}${path.sep}`))) return false;
    return !relative.startsWith('release/') && !relative.endsWith('.log');
  });
}

function allFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const output: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Deterministic build refuses symbolic link '${full}'.`);
      if (entry.isDirectory() && (ALWAYS_EXCLUDED.has(entry.name) || (current === root && entry.name === 'dist'))) continue;
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) output.push(full);
    }
  }
  return output.sort();
}

function stableJson(value: unknown): string { return JSON.stringify(sortValue(value)); }
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, sortValue(child)]));
}
