import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  comparePublicContracts,
  compareSemver,
  createPublicationManifest,
  createPublicContractSnapshot,
  satisfiesSemver,
  validSemverRange,
  verifyPublicationManifest
} from '../packages/package-system/dist/index.js';
import {
  assertInteropBoundary,
  callback,
  defineInteropModule,
  treeShakeInterop
} from '../packages/interop/dist/index.js';

assert.equal(compareSemver('1.0.0-beta.2', '1.0.0'), -1);
assert.equal(validSemverRange('^1.2.3 || ~2.0'), true);
assert.equal(satisfiesSemver('1.8.0', '^1.2.3'), true);
assert.equal(satisfiesSemver('2.0.0', '^1.2.3'), false);

const metadata = {
  schema: 'https://vx.veelv.site/schemas/package/v1', version: 1,
  name: '@vx-foundation/demo', packageVersion: '1.0.0',
  exports: { '.': './dist/index.js', './old': './dist/old.js' },
  privateModules: [], publicContracts: { '.': 'sha512-main', './old': 'sha512-old' }
};
const previous = createPublicContractSnapshot(metadata);
const next = createPublicContractSnapshot({ ...metadata, packageVersion: '2.0.0', exports: { '.': './dist/index.js' }, publicContracts: { '.': 'sha512-main' } });
assert.equal(comparePublicContracts(previous, next).recommendedBump, 'major');

const publicationRoot = mkdtempSync(join(tmpdir(), 'vx-phase19-publication-'));
writeFileSync(join(publicationRoot, 'package.json'), '{"name":"demo","version":"1.0.0"}');
writeFileSync(join(publicationRoot, 'index.js'), 'export const value = 1;');
const publication = createPublicationManifest(publicationRoot, 'demo', '1.0.0', { ignore: ['vx.publication.json'] });
assert.equal(verifyPublicationManifest(publicationRoot, publication), true);
writeFileSync(join(publicationRoot, 'index.js'), 'export const value = 2;');
assert.equal(verifyPublicationManifest(publicationRoot, publication), false);

assert.throws(() => assertInteropBoundary('client', 'node', 'node:fs'), /server-only/);
const moduleContract = defineInteropModule({ module: 'demo', environment: 'universal', sideEffects: false, exports: [
  { module: 'demo', exportName: 'used', kind: 'function', environment: 'universal', pure: true },
  { module: 'demo', exportName: 'unused', kind: 'function', environment: 'universal', pure: true }
] });
assert.deepEqual(treeShakeInterop(moduleContract, new Set(['used'])).exports.map((item) => item.exportName), ['used']);
const once = callback((value) => value + 1, { once: true });
assert.equal(once(2), 3);
assert.throws(() => once(2), /after disposal/);
console.log('Phase 19 behavioral verification passed (semver, API contracts, publication integrity, and interop boundaries).');
