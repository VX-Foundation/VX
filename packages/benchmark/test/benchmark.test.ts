import { describe, expect, it } from 'vitest';
import { compareFrameworkResults, runBenchmark, summarizeSamples } from '../src/index.js';
const environment = { os: 'test', architecture: 'x64', cpu: 'test', cores: 1, memoryBytes: 1, node: 'test' };
describe('@vx-foundation/benchmark', () => {
  it('summarizes samples', () => expect(summarizeSamples([{ value: 1, metric: 'duration-ms' }, { value: 3, metric: 'duration-ms' }]).median).toBe(1));
  it('runs adapters', async () => expect((await runBenchmark({ identity: () => ({ framework: 'vx', version: '0.1.0', adapterVersion: '1', lockfileIntegrity: 'sha512-test' }), execute: () => ({ value: 1, metric: 'duration-ms' }) }, 'lists', environment, { warmupIterations: 0, measuredIterations: 2 })).samples).toHaveLength(2));
  it('compares results to VX', () => expect(compareFrameworkResults([{ schema: 'https://vx.dev/schemas/benchmark-result/v1', suiteVersion: 1, scenario: 'lists', identity: { framework: 'vx', version: '1', adapterVersion: '1', lockfileIntegrity: 'x' }, environment, warmupIterations: 0, measuredIterations: 1, samples: [{ value: 1, metric: 'duration-ms' }], metadata: {} }])[0]?.winner).toBe('vx'));
});
