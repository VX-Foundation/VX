import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = process.env.VX_REPOSITORY_ROOT
  ? path.resolve(process.env.VX_REPOSITORY_ROOT)
  : path.resolve(scriptDirectory, '..');

function parseVersion(value, fieldName) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) throw new Error(`${fieldName} must use an exact x.y.z version, received ${JSON.stringify(value)}.`);
  return match.slice(1).map(Number);
}

function readTopLevelKeys(yaml) {
  const keys = new Set();
  for (const line of yaml.split(/\r?\n/u)) {
    const match = /^([A-Za-z][A-Za-z0-9]*):(?:\s|$)/u.exec(line);
    if (match) keys.add(match[1]);
  }
  return keys;
}

function inspectWorkflowVersions(content, fileName) {
  const violations = [];
  const lines = content.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    if (!/uses:\s*pnpm\/action-setup@/u.test(lines[index])) continue;
    for (let cursor = index + 1; cursor < Math.min(lines.length, index + 8); cursor += 1) {
      if (/^\s*-\s+uses:/u.test(lines[cursor])) break;
      if (/^\s+version:\s*/u.test(lines[cursor])) {
        violations.push(`${fileName}:${cursor + 1} duplicates the pnpm version. Use package.json#packageManager as the single source of truth.`);
      }
    }
  }
  return violations;
}

const packageJson = JSON.parse(await readFile(path.join(rootDirectory, 'package.json'), 'utf8'));
const packageManager = packageJson.packageManager;
const packageManagerMatch = /^pnpm@(\d+\.\d+\.\d+)$/u.exec(packageManager ?? '');
if (!packageManagerMatch) {
  throw new Error('package.json#packageManager must pin pnpm with an exact version, for example pnpm@11.19.0.');
}

const pinnedVersionText = packageManagerMatch[1];
const pinnedVersion = parseVersion(pinnedVersionText, 'package.json#packageManager');
const engineVersionText = packageJson.engines?.pnpm;
const supportedEngineRange = `>=${pinnedVersionText} <${pinnedVersion[0] + 1}`;
if (engineVersionText !== supportedEngineRange) {
  throw new Error(`package.json#engines.pnpm must equal ${supportedEngineRange}; received ${JSON.stringify(engineVersionText)}.`);
}
if (pinnedVersion[0] < 11) {
  throw new Error(`VX requires pnpm 11 or newer; received ${pinnedVersionText}.`);
}

const workspacePath = path.join(rootDirectory, 'pnpm-workspace.yaml');
const workspace = await readFile(workspacePath, 'utf8');
const npmrc = await readFile(path.join(rootDirectory, '.npmrc'), 'utf8').catch(() => '');
const keys = readTopLevelKeys(workspace);
const violations = [];
if (/^ignore-scripts\s*=\s*true\s*$/imu.test(npmrc)) {
  violations.push('.npmrc must not disable all lifecycle scripts because approved native builds are governed by allowBuilds and strictDepBuilds.');
}

if (!/^pmOnFail:\s*download\s*$/mu.test(workspace)) {
  violations.push('pnpm-workspace.yaml must set pmOnFail to download.');
}
if (/^packageManagerStrictVersion:/mu.test(workspace)) {
  violations.push('packageManagerStrictVersion was removed in pnpm 11; use pmOnFail instead.');
}
if (!/^engineStrict:\s*true\s*$/mu.test(workspace)) {
  violations.push('pnpm-workspace.yaml must enable engineStrict.');
}
if (!/^strictDepBuilds:\s*true\s*$/mu.test(workspace)) {
  violations.push('pnpm-workspace.yaml must enable strictDepBuilds.');
}
if (!/^minimumReleaseAge:\s*1440\s*$/mu.test(workspace)) {
  violations.push('pnpm-workspace.yaml must set minimumReleaseAge to 1440 minutes.');
}

if (/set this to true or false|TODO|FIXME/iu.test(workspace)) {
  violations.push('pnpm-workspace.yaml contains an unresolved placeholder.');
}

if (!keys.has('allowBuilds')) {
  violations.push('pnpm 11 must use allowBuilds as the build-script policy.');
}
const esbuildRule = /^\s{2}esbuild:\s*(\S+)\s*$/mu.exec(workspace);
if (esbuildRule?.[1] !== 'true') {
  violations.push('allowBuilds.esbuild must be the boolean true.');
}
for (const legacy of ['onlyBuiltDependencies', 'onlyBuiltDependenciesFile', 'neverBuiltDependencies', 'ignoredBuiltDependencies', 'ignoreDepScripts']) {
  if (keys.has(legacy)) violations.push(`${legacy} was removed in pnpm 11 and must not be used.`);
}

const workflowDirectory = path.join(rootDirectory, '.github', 'workflows');
for (const entry of await readdir(workflowDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.ya?ml$/u.test(entry.name)) continue;
  const content = await readFile(path.join(workflowDirectory, entry.name), 'utf8');
  violations.push(...inspectWorkflowVersions(content, `.github/workflows/${entry.name}`));
}

if (violations.length > 0) {
  console.error(`Package-manager policy failed with ${violations.length} violation(s):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log(`Package-manager policy passed for pnpm ${pinnedVersionText}.`);
}
