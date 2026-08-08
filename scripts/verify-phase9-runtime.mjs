import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from '../packages/language/dist/index.js';
import { analyze } from '../packages/compiler/dist/core.js';
import {
  createProvenanceManifest,
  createReleaseChannelPlan,
  compareApiSnapshots,
  validatePackagePolicy,
  verifyProvenanceManifest
} from '../packages/release/dist/index.js';

const accessible = parse(`#view\n  View {\n    Title(\"Accessible\")\n    Image {\n      src: \"hero.png\"\n      alt: \"VX hero\"\n    }\n    Input {\n      label: \"Name\"\n    }\n    Button(\"Save\")\n  }\n#end view\n`, '/accessible.vx');
const accessibleAnalysis = analyze(accessible.ast);
assert.equal([...accessible.diagnostics, ...accessibleAnalysis.diagnostics].filter((item) => item.severity === 'error').length, 0);

const inaccessible = parse(`#view\n  View {\n    Image {\n      src: \"hero.png\"\n    }\n    Input {\n      tabIndex: 2\n    }\n    Button { Link(\"Nested\", destination: \"/\") }\n  }\n#end view\n`, '/inaccessible.vx');
const codes = analyze(inaccessible.ast).diagnostics.map((item) => item.code);
for (const code of ['VX_A11Y_IMAGE_ALT', 'VX_A11Y_CONTROL_NAME', 'VX_A11Y_POSITIVE_TABINDEX', 'VX_A11Y_NESTED_INTERACTIVE']) assert.ok(codes.includes(code), `Missing ${code}.`);

const base = snapshot('1.0.0', [{ name: 'compile', kind: 'function', hash: 'same' }]);
const additive = snapshot('1.1.0', [{ name: 'compile', kind: 'function', hash: 'same' }, { name: 'inspect', kind: 'function', hash: 'new' }]);
assert.equal(compareApiSnapshots(base, additive).valid, true);
const breaking = snapshot('1.1.0', [{ name: 'compile', kind: 'function', hash: 'changed' }]);
assert.equal(compareApiSnapshots(base, breaking).valid, false);
assert.equal(compareApiSnapshots(base, breaking).requiredImpact, 'major');

const packagePolicy = validatePackagePolicy({
  name: '@vx-foundation/valid', version: '1.0.0', description: 'Valid VX package.', type: 'module', license: 'MIT',
  author: { name: 'Veelv' }, files: ['dist', 'README.md', 'LICENSE'], sideEffects: false,
  keywords: ['vx', 'valid', 'framework'], exports: { '.': './dist/index.js' },
  engines: { node: '>=22.11.0 <23 || >=24.11.0 <25' },
  repository: { type: 'git', url: 'git+https://github.com/VX-Foundation/vx.git' },
  homepage: 'https://github.com/VX-Foundation/vx/tree/main/packages/valid#readme', bugs: { url: 'https://github.com/VX-Foundation/vx/issues' },
  publishConfig: { access: 'public', registry: 'https://registry.npmjs.org/' }
});
assert.equal(packagePolicy.valid, true);
assert.equal(validatePackagePolicy({ ...{}, name: '@vx-foundation/bad', version: '1.0.0', scripts: { postinstall: 'node unsafe.js' } }).valid, false);

const provenance = createProvenanceManifest('@vx-foundation/example', '1.0.0', 'abc123', [{ path: 'dist/index.js', content: 'export const safe = true;' }]);
assert.equal(verifyProvenanceManifest(provenance, [{ path: 'dist/index.js', content: 'export const safe = true;' }]), true);
assert.equal(verifyProvenanceManifest(provenance, [{ path: 'dist/index.js', content: 'tampered' }]), false);
assert.equal(createReleaseChannelPlan({ channel: 'stable', baseVersion: '1.0.0' }).npmTag, 'latest');
assert.equal(createReleaseChannelPlan({ channel: 'next', baseVersion: '1.1.0', sequence: 4 }).version, '1.1.0-next.4');
assert.match(createReleaseChannelPlan({ channel: 'canary', baseVersion: '1.1.0', sequence: 2, revision: 'ABC-123' }).version, /canary\.abc123\.2$/);

const temp = await mkdtemp(join(tmpdir(), 'vx-phase9-'));
try {
  const path = join(temp, 'provenance.json');
  await writeFile(path, JSON.stringify(provenance));
  assert.equal(JSON.parse(await readFile(path, 'utf8')).integrity, provenance.integrity);
} finally { await rm(temp, { recursive: true, force: true }); }
console.log('Phase 9 runtime and release verification passed.');

function snapshot(version, symbols) {
  return { schema: 'https://vx.veelv.site/schemas/public-api-snapshot/v1', version: 1, packages: [{ name: '@vx-foundation/example', version, peerDependencies: {}, entrypoints: [{ subpath: '.', typesPath: 'dist/index.d.ts', symbols }] }] };
}
