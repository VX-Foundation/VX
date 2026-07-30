import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'packages/runtime/src/scheduler.ts',
  'packages/runtime/src/ownership.ts',
  'packages/runtime/src/dom-target.ts',
  'packages/runtime/src/transitions.ts',
  'packages/runtime/src/resumable.ts',
  'packages/runtime/src/hydration.ts',
  'docs/framework/rendering.md',
  'scripts/benchmark/phase15-runtime-benchmark.mjs'
];
for (const relative of required) assert.ok(fs.existsSync(path.join(root, relative)), `Missing Phase 15 artifact: ${relative}`);

const client = fs.readFileSync(path.join(root, 'packages/runtime/src/client.ts'), 'utf8');
for (const contract of ['scheduleTask', 'createResourceOwner', 'createDOMElement', 'transitionElement', 'resumeBoundaries', 'recoverHydrationRange']) {
  assert.match(client, new RegExp(`\\b${contract}\\b`), `Missing public client runtime contract: ${contract}`);
}
const server = fs.readFileSync(path.join(root, 'packages/runtime/src/server.ts'), 'utf8');
assert.match(server, /renderResumableBoundary/);
const codegen = fs.readFileSync(path.join(root, 'packages/compiler/src/codegen/dom-setup.ts'), 'utf8');
assert.match(codegen, /createCleanupStack/);
const cleanup = fs.readFileSync(path.join(root, 'packages/compiler/src/codegen/dom.ts'), 'utf8');
assert.match(cleanup, /disposeCleanupStack/);
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.ok(rootPackage.scripts['verify:conformance']);
console.log('Phase 15 structural verification passed.');
