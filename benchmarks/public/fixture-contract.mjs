import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const SCHEMA = 'https://vx.veelv.site/schemas/benchmark-fixture/v1';
const REQUIRED_EVIDENCE = Object.freeze(['native-runtime', 'rendered-output', 'scenario-contract', 'raw-artifact']);

export async function loadNativeFixture(fixtureRoot, expectedFramework, scenario) {
  const root = realpathSync(fixtureRoot);
  const configPath = contained(root, resolve(root, 'fixture.config.json'));
  const packagePath = contained(root, resolve(root, 'package.json'));
  const packageLockPath = contained(root, resolve(root, 'package-lock.json'));
  if (!existsSync(configPath) || !existsSync(packagePath) || !existsSync(packageLockPath)) {
    throw new Error(`Benchmark fixture '${expectedFramework}' is not prepared. Run benchmarks/public/scripts/prepare.mjs with registry access.`);
  }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  validateConfig(config, expectedFramework, scenario);
  const nativePath = contained(root, resolve(root, config.nativeEntrypoint));
  if (!existsSync(nativePath) || !lstatSync(nativePath).isFile()) {
    throw new Error(`Benchmark fixture '${expectedFramework}' has no framework-native implementation at '${config.nativeEntrypoint}'. Synthetic fallback is forbidden.`);
  }
  const source = readFileSync(nativePath, 'utf8');
  if (!declaresRuntimeImport(source, config.runtimePackage)) {
    throw new Error(`Native fixture '${expectedFramework}' must import '${config.runtimePackage}' directly.`);
  }
  const module = await import(`${pathToFileURL(nativePath).href}?integrity=${sha512(source)}`);
  if (typeof module.createNativeBenchmarkAdapter !== 'function') {
    throw new TypeError(`Native fixture '${expectedFramework}' must export createNativeBenchmarkAdapter(context).`);
  }
  const adapter = await module.createNativeBenchmarkAdapter(Object.freeze({ root, framework: expectedFramework, scenario, config }));
  validateAdapter(adapter, expectedFramework);
  return { adapter, config, sourceIntegrity: `sha512-${sha512(source)}`, packageLockIntegrity: `sha512-${sha512(readFileSync(packageLockPath))}` };
}

export function validateMeasurement(measurement, framework, scenario, requiredEvidence = REQUIRED_EVIDENCE) {
  if (!measurement || typeof measurement !== 'object') throw new TypeError(`Native fixture '${framework}' returned no measurement for '${scenario}'.`);
  if (!Number.isFinite(measurement.value) || measurement.value < 0) throw new TypeError(`Native fixture '${framework}' returned an invalid value for '${scenario}'.`);
  if (!['duration-ms','memory-bytes','bundle-bytes','first-byte-ms','hydration-ms','hmr-ms'].includes(measurement.metric)) throw new TypeError(`Native fixture '${framework}' returned an unsupported metric.`);
  const evidence = measurement.evidence;
  if (!evidence || typeof evidence !== 'object') throw new Error(`Native fixture '${framework}' omitted benchmark evidence.`);
  for (const key of requiredEvidence) if (!(key in evidence)) throw new Error(`Native fixture '${framework}' omitted required evidence '${key}'.`);
  if (evidence['native-runtime'] !== framework) throw new Error(`Native fixture evidence identifies '${evidence['native-runtime']}', expected '${framework}'.`);
  if (evidence['scenario-contract'] !== scenario) throw new Error(`Native fixture evidence does not match scenario '${scenario}'.`);
  if (typeof evidence['rendered-output'] !== 'string' || evidence['rendered-output'].length === 0) throw new Error(`Native fixture '${framework}' did not provide a rendered-output digest.`);
  if (typeof evidence['raw-artifact'] !== 'string' || evidence['raw-artifact'].length === 0) throw new Error(`Native fixture '${framework}' did not retain a raw artifact reference.`);
  return Object.freeze({ value: measurement.value, metric: measurement.metric, evidence: Object.freeze({ ...evidence }) });
}

function validateConfig(config, framework, scenario) {
  if (config?.$schema !== SCHEMA || config.framework !== framework || config.implementation !== 'framework-native') throw new Error(`Invalid native fixture contract for '${framework}'.`);
  if (typeof config.runtimePackage !== 'string' || !config.runtimePackage) throw new Error(`Fixture '${framework}' has no runtime package.`);
  if (!Array.isArray(config.supportedScenarios) || !config.supportedScenarios.includes(scenario)) throw new Error(`Fixture '${framework}' does not support '${scenario}'.`);
  if (!Array.isArray(config.requiredEvidence) || REQUIRED_EVIDENCE.some((key) => !config.requiredEvidence.includes(key))) throw new Error(`Fixture '${framework}' weakens the mandatory evidence contract.`);
}
function validateAdapter(adapter, framework) {
  if (!adapter || typeof adapter !== 'object' || typeof adapter.execute !== 'function') throw new TypeError(`Native fixture '${framework}' returned an invalid adapter.`);
  if (adapter.framework !== framework) throw new Error(`Native fixture adapter identity mismatch for '${framework}'.`);
}
function declaresRuntimeImport(source, packageName) {
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:from\\s*|import\\s*\\()\\s*['\"]${escaped}(?:[/\"'])`, 'u').test(source) || new RegExp(`import\\s*['\"]${escaped}['\"]`, 'u').test(source);
}
function contained(root, candidate) {
  const normalized = resolve(candidate); if (normalized !== root && !normalized.startsWith(`${root}${sep}`)) throw new Error(`Benchmark fixture path escapes '${root}'.`); return normalized;
}
function sha512(value) { return createHash('sha512').update(value).digest('base64'); }
