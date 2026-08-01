import fs from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { BuildTarget } from '@vx-foundation/types';
import { fileHash } from './fingerprint.js';
import type { BuildArtifact, BundleAnalysis, NormalizedBuildOptions } from './types.js';

export function analyzeBuild(options: NormalizedBuildOptions): BundleAnalysis {
  const artifacts: BuildArtifact[] = [];
  for (const [directory, target] of targetDirectories(options.outDir)) {
    if (!fs.existsSync(directory)) continue;
    for (const filePath of walk(directory)) {
      const content = fs.readFileSync(filePath);
      const relative = path.relative(options.outDir, filePath).split(path.sep).join('/');
      artifacts.push(Object.freeze({
        path: relative,
        bytes: content.byteLength,
        gzipBytes: gzipSync(content, { level: 9 }).byteLength,
        brotliBytes: brotliCompressSync(content).byteLength,
        hash: fileHash(content),
        kind: classifyArtifact(relative),
        target
      }));
    }
  }
  artifacts.sort((a, b) => a.path.localeCompare(b.path));
  const violations = validateChunkPolicy(artifacts, options);
  const totals: Record<string, { bytes: number; gzipBytes: number; brotliBytes: number; files: number }> = Object.create(null);
  for (const artifact of artifacts) {
    const key = artifact.target;
    const total = totals[key] ??= { bytes: 0, gzipBytes: 0, brotliBytes: 0, files: 0 };
    total.bytes += artifact.bytes; total.gzipBytes += artifact.gzipBytes; total.brotliBytes += artifact.brotliBytes; total.files++;
  }
  return Object.freeze({ version: 1, totals: Object.freeze(totals), artifacts: Object.freeze(artifacts), violations: Object.freeze(violations) });
}

export function writeBundleAnalysis(outDir: string, analysis: BundleAnalysis): string {
  const filePath = path.join(outDir, 'vx.bundle-analysis.json');
  fs.writeFileSync(filePath, `${JSON.stringify(analysis, null, 2)}\n`);
  return filePath;
}

function validateChunkPolicy(artifacts: readonly BuildArtifact[], options: NormalizedBuildOptions): string[] {
  const chunks = artifacts.filter((artifact) => artifact.target === 'browser' && (artifact.kind === 'entry' || artifact.kind === 'chunk'));
  const violations: string[] = [];
  if (chunks.length > options.chunkPolicy.maxChunkCount) violations.push(`Chunk count ${chunks.length} exceeds ${options.chunkPolicy.maxChunkCount}.`);
  for (const chunk of chunks) {
    if (chunk.bytes > options.chunkPolicy.maxChunkBytes) violations.push(`${chunk.path} is ${chunk.bytes} bytes and exceeds maxChunkBytes ${options.chunkPolicy.maxChunkBytes}.`);
    if (chunk.kind === 'entry' && chunk.bytes > options.chunkPolicy.maxInitialBytes) violations.push(`${chunk.path} exceeds maxInitialBytes ${options.chunkPolicy.maxInitialBytes}.`);
    if (chunk.kind === 'chunk' && chunk.bytes > options.chunkPolicy.maxAsyncBytes) violations.push(`${chunk.path} exceeds maxAsyncBytes ${options.chunkPolicy.maxAsyncBytes}.`);
  }
  if (options.chunkPolicy.enforce && violations.length) throw new AggregateError(violations.map((message) => new Error(message)), 'VX chunk policy failed.');
  return violations;
}

function targetDirectories(outDir: string): Array<[string, BuildTarget | 'deployment']> {
  const entries: ReadonlyArray<readonly [string, BuildTarget | 'deployment']> = [
    ['client', 'browser'], ['server', 'server'], ['edge', 'edge'], ['static', 'static'], ['library', 'library'], ['deploy', 'deployment']
  ];
  return entries.map(([directory, target]) => [path.join(outDir, directory), target]);
}
function classifyArtifact(relative: string): BuildArtifact['kind'] {
  if (relative.startsWith('deploy/')) return 'adapter';
  if (/vx-(?:client|server|edge)|server\.mjs|worker\.mjs|handler\.mjs/.test(relative)) return 'entry';
  if (/\/chunks\//.test(relative) || /assets\/.*\.(?:m?js)$/.test(relative)) return 'chunk';
  if (/\.json$/.test(relative)) return 'manifest';
  return 'asset';
}
function walk(directory: string): string[] {
  const output: string[] = [], stack = [directory];
  while (stack.length) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full); else if (entry.isFile()) output.push(full);
    }
  }
  return output.sort();
}
