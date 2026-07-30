import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
export async function runPublicAdapter(framework, metaUrl) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs, []));
  const scenario = args.scenario;
  if (!scenario) throw new Error('Missing --scenario.');
  const root = resolve(new URL('..', metaUrl).pathname);
  const suite = JSON.parse(readFileSync(args.suite, 'utf8'));
  const lock = JSON.parse(readFileSync(resolve(root, 'locks', `${framework}.json`), 'utf8'));
  const driver = await import(new URL(`../fixtures/${framework}/driver.mjs`, metaUrl));
  const warmup = suite.warmupIterations, measured = suite.measuredIterations;
  const controller = new AbortController();
  for (let index = 0; index < warmup; index += 1) await driver.execute(scenario, controller.signal);
  const samples = [], evidence = [];
  for (let index = 0; index < measured; index += 1) {
    const started = performance.now(); const measurement = await driver.execute(scenario, controller.signal); const elapsed = performance.now() - started;
    samples.push({ value: measurement.value ?? elapsed, metric: measurement.metric ?? 'duration-ms' }); evidence.push(measurement.evidence);
  }
  const nativeIdentity = await driver.identity(); await driver.cleanup?.(scenario);
  const result = { schema: 'https://vx.dev/schemas/benchmark-result/v1', suiteVersion: suite.suiteVersion, scenario, identity: { framework, version: lock.version, adapterVersion: '2', lockfileIntegrity: lock.lockfileIntegrity }, environment: JSON.parse(process.env.VX_BENCH_ENVIRONMENT ?? '{}'), warmupIterations: warmup, measuredIterations: measured, samples, metadata: { fixture: `fixtures/${framework}`, implementation: 'framework-native', sourceIntegrity: nativeIdentity.sourceIntegrity, nativeLockfileIntegrity: nativeIdentity.packageLockIntegrity, evidenceIntegrity: `sha512-${createHash('sha512').update(JSON.stringify(evidence)).digest('base64')}` }, evidence };
  process.stdout.write(JSON.stringify(result));
}
