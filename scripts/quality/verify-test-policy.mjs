import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const policy = JSON.parse(readFileSync(resolve(root, 'quality/coverage-policy.json'), 'utf8'));
const manifests = new Map();
for (const workspace of ['packages', 'apps']) {
  const directory = resolve(root, workspace);
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packagePath = resolve(directory, entry.name, 'package.json');
    if (!existsSync(packagePath)) continue;
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
    if (manifest.name) manifests.set(manifest.name, { manifest, directory: resolve(directory, entry.name) });
  }
}

const failures = [];
const packages = new Set(policy.targets.flatMap((target) => target.packages));
for (const name of policy.requiredBehavioralSuites) packages.add(name);
for (const name of packages) {
  const entry = manifests.get(name);
  if (!entry) { failures.push(`${name}: package manifest not found`); continue; }
  const testScript = entry.manifest.scripts?.test;
  if (!testScript) failures.push(`${name}: missing test script`);
  if (typeof testScript === 'string' && testScript.includes('--passWithNoTests')) failures.push(`${name}: test script permits an empty suite`);
  if (!hasTests(entry.directory)) failures.push(`${name}: no test files found`);
}

for (const target of policy.targets) {
  for (const key of ['lines', 'functions', 'statements', 'branches']) {
    const value = target[key];
    if (!Number.isInteger(value) || value < 0 || value > 100) failures.push(`${target.name}: invalid ${key} threshold '${value}'`);
  }
}

const rootManifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
if (!rootManifest.scripts?.[policy.officialApplicationGate]) failures.push(`root: missing official application gate '${policy.officialApplicationGate}'`);

if (failures.length) {
  console.error(`VX test policy failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`VX test policy verified: ${packages.size} protected packages, ${policy.targets.length} coverage target groups, no empty suites.`);
}

function hasTests(directory) {
  for (const candidate of ['test', 'tests']) {
    const path = resolve(directory, candidate);
    if (existsSync(path) && containsTest(path)) return true;
  }
  return false;
}
function containsTest(path) {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory() && containsTest(child)) return true;
    if (entry.isFile() && /\.(?:test|spec)\.(?:[cm]?[jt]s|tsx?)$/u.test(entry.name)) return true;
  }
  return false;
}
