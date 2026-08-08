import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpus, freemem, platform, arch, totalmem } from 'node:os';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const suite = JSON.parse(readFileSync(resolve(root, 'suite.json'), 'utf8'));
const options = parse(process.argv.slice(2));
const frameworks = options.framework === 'all' || !options.framework ? suite.frameworks : options.framework.split(',');
const scenarios = options.scenario === 'all' || !options.scenario ? suite.scenarios : options.scenario.split(',');
const runId = new Date().toISOString().replace(/[:.]/gu, '-');
const resultRoot = resolve(root, suite.resultDirectory, runId); mkdirSync(resultRoot, { recursive: true });
for (const framework of frameworks) for (const scenario of scenarios) {
  const adapter = resolve(root, 'adapters', `${framework}.mjs`); const output = resolve(resultRoot, `${framework}-${scenario}.json`);
  const environment = { os: platform(), architecture: arch(), cpu: cpus()[0]?.model ?? 'unknown', cores: cpus().length, memoryBytes: totalmem(), freeMemoryBytes: freemem(), totalMemoryBytes: totalmem(), node: process.version, browser: process.env.VX_BENCH_BROWSER, commit: git(['rev-parse', 'HEAD']), dirty: git(['status', '--porcelain']).length > 0, timestamp: new Date().toISOString() };
  if (!environment.commit || environment.dirty) throw new Error('Public benchmarks require a clean Git commit.');
  const stdout = execFileSync(process.execPath, [adapter, '--scenario', scenario, '--suite', resolve(root, 'suite.json')], { encoding: 'utf8', env: { ...process.env, VX_BENCH_ENVIRONMENT: JSON.stringify(environment) } });
  const result = JSON.parse(stdout); validate(result, framework, scenario); const canonical = JSON.stringify(result); result.resultIntegrity = `sha512-${createHash('sha512').update(canonical).digest('base64')}`; writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
}
function parse(args) { const output = {}; for (let i=0;i<args.length;i+=1) if (args[i]?.startsWith('--')) output[args[i].slice(2)] = args[i+1] ?? 'true', i+=1; return output; }
function git(args) { try { return execFileSync('git', args, { cwd: resolve(root, '../..'), encoding: 'utf8' }).trim(); } catch { return ''; } }
function validate(result, framework, scenario) {
  if (result.schema !== 'https://vx.veelv.site/schemas/benchmark-result/v1' || result.identity?.framework !== framework || result.scenario !== scenario) throw new Error(`Invalid benchmark identity for ${framework}/${scenario}.`);
  if (result.metadata?.implementation !== 'framework-native' || typeof result.metadata?.sourceIntegrity !== 'string') throw new Error(`Benchmark ${framework}/${scenario} is not backed by a native fixture.`);
  if (!Array.isArray(result.samples) || result.samples.length !== result.measuredIterations || result.samples.some((sample) => !Number.isFinite(sample.value) || sample.value < 0)) throw new Error(`Invalid raw samples for ${framework}/${scenario}.`);
  if (!Array.isArray(result.evidence) || result.evidence.length !== result.samples.length) throw new Error(`Missing evidence for ${framework}/${scenario}.`);
  if (!result.environment?.commit || result.environment?.dirty !== false || !result.identity?.version || !result.identity?.lockfileIntegrity) throw new Error(`Incomplete reproducibility metadata for ${framework}/${scenario}.`);
}
