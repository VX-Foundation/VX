import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { classifyAsset, contentHash, integrityHash } from '../../packages/bundler/dist/assets/index.js';
import { analyzeBuild, normalizeBuildOptions } from '../../packages/bundler/dist/build/index.js';

const assetCount = 50_000;
const payload = new TextEncoder().encode('VX asset benchmark payload');
const assetStart = performance.now();
let digestBytes = 0;
for (let index = 0; index < assetCount; index += 1) {
  const file = index % 5 === 0 ? `image-${index}.webp` : index % 7 === 0 ? `module-${index}.worker.js` : `chunk-${index}.js`;
  digestBytes += classifyAsset(file).length + contentHash(payload).length + integrityHash(payload, 'sha256').length;
}
const assetMs = performance.now() - assetStart;
assert.ok(digestBytes > 1_000_000);
assert.ok(assetMs < 8_000, `Asset metadata benchmark regression: ${assetMs.toFixed(2)} ms.`);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-phase17-benchmark-'));
try {
  const options = normalizeBuildOptions({ root, outDir: 'dist', adapter: 'node', chunkPolicy: { maxChunkCount: 20_000 } });
  const directory = path.join(options.outDir, 'client', 'assets');
  fs.mkdirSync(directory, { recursive: true });
  const chunkCount = 5_000;
  for (let index = 0; index < chunkCount; index += 1) fs.writeFileSync(path.join(directory, `chunk-${index.toString().padStart(5, '0')}-deadbeef.js`), `export const value=${index};`);
  const analysisStart = performance.now();
  const analysis = analyzeBuild(options);
  const analysisMs = performance.now() - analysisStart;
  assert.equal(analysis.artifacts.length, chunkCount);
  assert.ok(analysisMs < 20_000, `Bundle analysis benchmark regression: ${analysisMs.toFixed(2)} ms.`);
  console.log(JSON.stringify({ assetCount, assetMs: Number(assetMs.toFixed(2)), chunkCount, analysisMs: Number(analysisMs.toFixed(2)), digestBytes }));
  console.log('Phase 17 build benchmark passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
