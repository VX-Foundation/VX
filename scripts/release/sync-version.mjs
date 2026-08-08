import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  publicPackageManifests,
  readJson,
  readVersionManifest,
  releaseLine,
  replaceRequired,
  root,
  workspaceManifestPaths,
  writeJson,
  writeText,
  writeVersionManifest
} from './versioning.mjs';

let canonical = readVersionManifest();
const frameworkArgument = argument('--framework');
const specificationArgument = argument('--specification');
const channelArgument = argument('--channel');
const freezeDateArgument = argument('--freeze-date');
const adoptRoot = process.argv.includes('--adopt-root');

if (adoptRoot || frameworkArgument || specificationArgument || channelArgument || freezeDateArgument) {
  const rootVersion = String(readJson(join(root, 'package.json')).version ?? '');
  canonical = writeVersionManifest({
    framework: frameworkArgument ?? (adoptRoot ? rootVersion : canonical.framework),
    specification: specificationArgument ?? canonical.specification,
    channel: channelArgument ?? canonical.channel,
    freezeDate: freezeDateArgument ?? canonical.freezeDate
  });
}

const { framework, specification, channel, freezeDate } = canonical;
const line = releaseLine(framework);

for (const manifestPath of workspaceManifestPaths()) {
  const manifest = readJson(manifestPath);
  manifest.version = framework;
  writeJson(manifestPath, manifest);
}

writeText(join(root, 'VERSION'), `${framework}\n`);
updateJson('release/release-policy.json', (manifest) => { manifest.frameworkVersion = framework; });
updateJson('release/v1-readiness.json', (manifest) => { manifest.frameworkVersion = framework; });
updateJson('apps/browser-devtools/manifest.json', (manifest) => { manifest.version = framework; });

replaceRequired(
  join(root, 'packages/plugins/src/sitemap/index.ts'),
  /(name:\s*'@vx-foundation\/sitemap',\s*version:\s*')[^']+(')/u,
  `$1${framework}$2`
);
replaceRequired(
  join(root, 'README.md'),
  /(\*\*Current release line:\*\*\s*`)[^`]+(`\s+unstable\.)/u,
  `$1${framework}$2`
);
replaceRequired(
  join(root, 'README.md'),
  /VX\s+\d+\.\d+\s+is prepared for GitHub and npm publication/u,
  `VX ${line} is prepared for GitHub and npm publication`
);
replaceRequired(
  join(root, 'docs/CONTRIBUTING.md'),
  /VX is in the \d+\.\d+ stabilization line\./u,
  `VX is in the ${line} stabilization line.`
);
replaceRequired(
  join(root, 'docs/SUPPORT-POLICY.md'),
  /The VX \d+\.\d+ line supports Node\.js/u,
  `The VX ${line} line supports Node.js`
);
replaceRequired(
  join(root, 'docs/spec/FROZEN.md'),
  /# VX \d+\.\d+ Specification Freeze/u,
  `# VX ${specification} Specification Freeze`
);
replaceRequired(
  join(root, 'docs/spec/FROZEN.md'),
  /The VX language and framework specification is frozen for the \d+\.\d+ stabilization line as of \d{4}-\d{2}-\d{2}\./u,
  `The VX language and framework specification is frozen for the ${specification} stabilization line as of ${freezeDate}.`
);
replaceRequired(
  join(root, 'docs/RELEASE.md'),
  /\d+\.\d+\.\d+-canary\.<revision>\.<sequence>/u,
  `${framework}-canary.<revision>.<sequence>`
);
replaceRequired(
  join(root, 'docs/RELEASE.md'),
  /\d+\.\d+\.\d+-next\.<sequence>/u,
  `${framework}-next.<sequence>`
);
replaceRequired(
  join(root, '.github/ISSUE_TEMPLATE/bug-report.yml'),
  /placeholder:\s+\d+\.\d+\.\d+-next\.0/u,
  `placeholder: ${framework}-next.0`
);

writeVersioningGuide({ framework, channel });
verifyTemplateContracts();
synchronizeApiBaseline(framework);
runNodeScript(join(root, 'scripts/docs/generate-api-reference.mjs'));
runNodeScript(join(root, 'scripts/release/create-freeze-manifests.mjs'));
runNodeScript(join(root, 'scripts/release/verify-version-sync.mjs'));

console.log(`VX version surfaces synchronized at ${framework} (specification ${specification}, channel ${channel}).`);

function updateJson(relativePath, mutator) {
  const path = join(root, relativePath);
  const manifest = readJson(path);
  mutator(manifest);
  writeJson(path, manifest);
}

function synchronizeApiBaseline(version) {
  const manifests = new Map(publicPackageManifests().map(({ manifest }) => [manifest.name, manifest.version]));
  const path = join(root, 'release/api-baseline.json');
  const snapshot = readJson(path);
  assert.ok(Array.isArray(snapshot.packages), 'release/api-baseline.json has no package list.');
  const snapshotNames = new Set();
  for (const pkg of snapshot.packages) {
    assert.ok(pkg && typeof pkg.name === 'string', 'release/api-baseline.json contains an invalid package entry.');
    assert.ok(manifests.has(pkg.name), `API baseline contains unknown public package '${pkg.name}'.`);
    pkg.version = version;
    snapshotNames.add(pkg.name);
  }
  for (const name of manifests.keys()) assert.ok(snapshotNames.has(name), `API baseline is missing public package '${name}'.`);
  writeJson(path, snapshot, true);
}

function writeVersioningGuide({ framework, channel }) {
  const line = releaseLine(framework);
  writeText(join(root, 'docs/VERSIONING.md'), `# Versioning and Distribution Tags\n\nVX follows Semantic Versioning for every public package. The canonical release metadata lives in \`release/version.json\`; package manifests and generated release documents are derived from it.\n\n## Historical baseline\n\nThe unpublished internal baseline was \`0.1.0\`, and the first VX Foundation public line began at \`0.1.1\`. Historical versions remain in changelogs and migration documents and are not synchronization targets.\n\n## Current unstable line\n\nThe current synchronized framework version is \`${framework}\` on the \`${channel}\` release channel. All public \`@vx-foundation/*\` packages use the same version:\n\n- \`${framework}-canary.<revision>.<sequence>\` under \`canary\`;\n- \`${framework}-next.<sequence>\` under \`next\`;\n- \`1.0.0\` under \`latest\` only after the stable gate passes.\n\nThe active compatibility line is VX ${line}. Private repository applications follow the same framework version so integration drift is detected before publication. Template projects keep their own initial project version, while their VX dependencies are replaced with \`^${framework}\` when generated.\n\n## Compatibility\n\nThe public API baseline records exported entrypoints and declarations. A release is rejected when its version change is smaller than the detected compatibility impact. Internal source paths are never public contracts.\n\n## Changesets\n\nEvery user-visible public package change requires a Changeset. The public package set is configured as one fixed Changesets group, and \`pnpm version-packages\` adopts the resulting root version into \`release/version.json\` before regenerating every derived version surface.\n`);
}

function verifyTemplateContracts() {
  for (const template of ['basic', 'starter', 'fullstack', 'library']) {
    const path = join(root, 'packages/cli/templates', template, 'package.json');
    const manifest = readJson(path);
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (name.startsWith('@vx-foundation/')) assert.equal(range, 'workspace:*', `${template} template must keep ${name} as workspace:* before scaffolding.`);
      }
    }
  }
}

function runNodeScript(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Command failed: ${[process.execPath, scriptPath, ...args].join(' ')}`);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
