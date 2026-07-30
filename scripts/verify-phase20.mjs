import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

for (const name of ['testing', 'security-testing', 'benchmark']) {
  assert.ok(existsSync(resolve(root, 'packages', name, 'package.json')), `Missing @vx/${name}.`);
}

const testing = ['types', 'runner', 'dom', 'component', 'ssr', 'routes', 'accessibility', 'visual', 'performance', 'browser']
  .map((name) => read(`packages/testing/src/${name}.ts`))
  .join('\n');
for (const contract of [
  'unit', 'component', 'hydration', 'route', 'action', 'endpoint',
  'compareRgbaSnapshots', 'auditAccessibility', 'enforcePerformanceBudget',
  'AbortSignal', 'cleanup'
]) {
  assert.ok(testing.includes(contract), `Official testing is missing ${contract}.`);
}

const security = [
  read('packages/security-testing/src/fuzz.ts'),
  read('packages/security-testing/src/secrets.ts'),
  read('packages/security-testing/src/supply-chain.ts')
].join('\n');
for (const contract of ['runFuzzCampaign', 'minimize', 'scanSecrets', 'reviewPackageManifest', 'reviewLockfileText', 'TimeoutError']) {
  assert.ok(security.includes(contract), `Security testing is missing ${contract}.`);
}

const benchmark = [
  read('packages/benchmark/src/protocol.ts'),
  read('packages/benchmark/src/statistics.ts'),
  read('packages/benchmark/src/report.ts')
].join('\n');
for (const framework of ['vx', 'react', 'next', 'svelte', 'sveltekit', 'solid', 'vue', 'nuxt']) {
  assert.ok(benchmark.includes(`'${framework}'`), `Benchmark matrix is missing ${framework}.`);
}
for (const scenario of ['lists', 'reorder', 'forms', 'dashboards', 'ssr', 'streaming', 'hydration', 'islands', 'cold-build', 'incremental-build', 'hmr', 'memory', 'bundle-size']) {
  assert.ok(benchmark.includes(`'${scenario}'`), `Benchmark matrix is missing ${scenario}.`);
}

for (const document of [
  'docs/security/THREAT-MODEL.md',
  'docs/security/FUZZING.md',
  'docs/security/SUPPLY-CHAIN.md',
  'docs/security/EXTERNAL-AUDIT.md',
  'docs/security/ADVISORIES.md',
  'docs/performance/PUBLIC-BENCHMARKS.md',
  'docs/testing/OFFICIAL-TESTING.md'
]) {
  assert.ok(existsSync(resolve(root, document)), `Missing ${document}.`);
}
for (const workflow of ['security-continuous.yml', 'fuzz-continuous.yml', 'performance.yml']) {
  assert.ok(existsSync(resolve(root, '.github/workflows', workflow)), `Missing ${workflow}.`);
}


const publicBenchmark = read('benchmarks/public/fixture-contract.mjs') + read('benchmarks/public/scripts/run.mjs');
for (const contract of ['framework-native', 'Synthetic fallback is forbidden', 'required evidence', 'resultIntegrity']) {
  assert.ok(publicBenchmark.includes(contract), `Public benchmark fairness gate is missing ${contract}.`);
}
for (const framework of ['vx', 'react', 'next', 'svelte', 'sveltekit', 'solid', 'vue', 'nuxt']) {
  assert.ok(existsSync(resolve(root, 'benchmarks/public/fixtures', framework, 'fixture.config.json')), `Missing native fixture contract for ${framework}.`);
  assert.equal(existsSync(resolve(root, 'benchmarks/public/fixtures', framework, 'scenario.mjs')), false, `Synthetic ${framework} scenario is forbidden.`);
}

const exports = JSON.parse(read('packages/testing/package.json')).exports;
for (const entry of ['./runner', './dom', './component', './routes', './ssr', './visual', './accessibility', './performance', './browser']) {
  assert.ok(exports[entry], `@vx/testing is missing ${entry}.`);
}

console.log('Phase 20 structural verification passed.');
