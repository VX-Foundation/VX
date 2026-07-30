import { resolve } from 'node:path';
import { loadNativeFixture, validateMeasurement } from '../../fixture-contract.mjs';
const framework = 'svelte';
const root = resolve(import.meta.dirname);
let loaded;
export async function execute(scenario, signal) {
  loaded ??= loadNativeFixture(root, framework, scenario);
  const fixture = await loaded;
  const measurement = await fixture.adapter.execute(scenario, signal);
  return validateMeasurement(measurement, framework, scenario, fixture.config.requiredEvidence);
}
export async function cleanup(scenario) { if (!loaded) return; const fixture = await loaded; await fixture.adapter.cleanup?.(scenario); loaded = undefined; }
export async function identity() { const fixture = await (loaded ??= loadNativeFixture(root, framework, 'lists')); return { sourceIntegrity: fixture.sourceIntegrity, packageLockIntegrity: fixture.packageLockIntegrity }; }
