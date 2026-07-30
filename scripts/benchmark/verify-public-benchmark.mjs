import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..'); const publicRoot = resolve(root, 'benchmarks/public');
const suite = JSON.parse(readFileSync(resolve(publicRoot, 'suite.json'), 'utf8'));
const failures = [];
for (const framework of suite.frameworks) {
  const fixture = resolve(publicRoot, 'fixtures', framework); const configPath = resolve(fixture, 'fixture.config.json');
  if (!existsSync(configPath)) { failures.push(`${framework}: missing fixture.config.json`); continue; }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (config.implementation !== 'framework-native' || config.framework !== framework) failures.push(`${framework}: invalid native fixture contract`);
  if (!suite.scenarios.every((scenario) => config.supportedScenarios.includes(scenario))) failures.push(`${framework}: incomplete scenario declaration`);
  if (existsSync(resolve(fixture, 'scenario.mjs'))) failures.push(`${framework}: synthetic scenario.mjs is forbidden`);
  const driver = readFileSync(resolve(fixture, 'driver.mjs'), 'utf8'); if (!driver.includes('loadNativeFixture')) failures.push(`${framework}: driver bypasses native fixture validation`);
}
const runner = readFileSync(resolve(publicRoot, 'scripts/run.mjs'), 'utf8');
for (const token of ['framework-native','resultIntegrity','clean Git commit','evidence']) if (!runner.includes(token)) failures.push(`runner missing ${token}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`Phase 20 public benchmark contract passed for ${suite.frameworks.length} frameworks and ${suite.scenarios.length} scenarios.`);
