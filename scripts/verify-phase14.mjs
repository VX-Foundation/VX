import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  'packages/server/package.json',
  'packages/server/src/platform.ts',
  'packages/server/src/sessions.ts',
  'packages/server/src/node.ts',
  'packages/server/src/endpoints.ts',
  'docs/framework/server.md',
  'docs/guides/security.md'
];
for (const relative of required) assert.ok(fs.existsSync(path.join(root, relative)), `Missing Phase 14 artifact: ${relative}`);
const codegen = fs.readFileSync(path.join(root, 'packages/router/src/build/codegen.ts'), 'utf8');
assert.match(codegen, /from '@vx-foundation\/server'/);
const nodeAdapter = fs.readFileSync(path.join(root, 'packages/bundler/src/adapters/node.ts'), 'utf8');
assert.match(nodeAdapter, /startNodeServer/);
assert.match(nodeAdapter, /gracefulShutdownMs/);
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'packages/server/package.json'), 'utf8'));
assert.equal(packageJson.name, '@vx-foundation/server');
for (const subpath of ['./cookies', './sessions', './middleware', './security', './observability', './node']) assert.ok(packageJson.exports[subpath]);
console.log('Phase 14 structural verification passed.');
