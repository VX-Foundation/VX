import assert from 'node:assert/strict';
import {
  assertDeterministicMarkup,
  compareHydrationMarkup,
  compareRgbaSnapshots,
  contrastRatio,
  createTestSuite,
  enforcePerformanceBudget,
  measurePerformance
} from '../packages/testing/dist/index.js';
import { reviewLockfileText, reviewPackageManifest, runFuzzCampaign, scanSecrets } from '../packages/security-testing/dist/index.js';
import { compareFrameworkResults, runBenchmark, summarizeSamples } from '../packages/benchmark/dist/index.js';

let disposed = false;
const suite = createTestSuite('phase20').add({
  id: 'unit:cleanup',
  name: 'cleanup',
  kind: 'unit',
  run(context) {
    context.cleanup(() => { disposed = true; });
  }
});
const report = await suite.run();
assert.equal(report.failed, 0);
assert.equal(disposed, true);

assert.equal(await assertDeterministicMarkup(() => '<main>stable</main>'), '<main>stable</main>');
assert.equal(compareHydrationMarkup('<p>one</p>', '<p>two</p>').matched, false);
assert.equal(
  compareRgbaSnapshots(Uint8ClampedArray.of(0, 0, 0, 255), Uint8ClampedArray.of(0, 0, 0, 255), 1, 1).matched,
  true
);
assert(contrastRatio('#000000', '#ffffff') > 20);

const performance = await measurePerformance(() => undefined, { warmup: 0, iterations: 5 });
assert.equal(enforcePerformanceBudget(performance, { maximumMs: 100 }).passed, true);

const fuzz = await runFuzzCampaign({
  seed: 20,
  iterations: 100,
  corpus: ['#view\nView {}'],
  target(input) { new TextDecoder().decode(input); }
});
assert.equal(fuzz.crashes.length, 0);
assert(scanSecrets(['-----BEGIN ', 'PRIVATE KEY-----'].join('')).some((finding) => finding.rule === 'private-key'));
assert(reviewPackageManifest({
  packageManager: 'pnpm@11.17.0',
  scripts: { postinstall: 'node unsafe.js' }
}).some((issue) => issue.severity === 'error'));
assert(reviewLockfileText('lockfileVersion: 9').some((issue) => issue.code === 'VX_SUPPLY_INTEGRITY' && issue.severity === 'error'));
assert.equal(reviewLockfileText('packages:\n  dependency-file:\n    resolution: {integrity: sha512-YQ==}').some((issue) => issue.code === 'VX_SUPPLY_LOCK_REMOTE'), false);
assert.equal(reviewLockfileText('packages:\n  pkg:\n    specifier: https://example.invalid/pkg.tgz\n    integrity: sha512-YQ==').some((issue) => issue.code === 'VX_SUPPLY_LOCK_REMOTE'), true);
const stoppedFuzz = await runFuzzCampaign({ seed: 3, iterations: 10, corpus: ['vx'], target() { throw new Error('expected crash'); }, stopAfterFirstCrash: true });
assert.equal(stoppedFuzz.executions, 1);
assert.equal(stoppedFuzz.crashes.length, 1);

const environment = {
  os: 'test',
  architecture: 'x64',
  cpu: 'test',
  cores: 1,
  memoryBytes: 1,
  node: process.version
};
const vx = await runBenchmark({
  identity: () => ({ framework: 'vx', version: '0.1.0', adapterVersion: '1', lockfileIntegrity: 'sha512-test' }),
  execute: () => ({ value: 1, metric: 'duration-ms' })
}, 'lists', environment, { warmupIterations: 1, measuredIterations: 5 });
const react = {
  ...vx,
  identity: { ...vx.identity, framework: 'react', version: 'test' },
  samples: vx.samples.map((sample) => ({ ...sample, value: 2 }))
};
assert.equal(summarizeSamples(vx.samples).median, 1);
assert.equal(compareFrameworkResults([vx, react])[0]?.winner, 'vx');

console.log('Phase 20 runtime verification passed.');
