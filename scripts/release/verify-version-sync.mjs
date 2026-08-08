import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  publicPackageManifests,
  readJson,
  readVersionManifest,
  releaseLine,
  root,
  sha256,
  workspaceManifestPaths
} from './versioning.mjs';

const { framework, specification, channel, freezeDate } = readVersionManifest();
const line = releaseLine(framework);
const issues = [];

check('VERSION', readFileSync(join(root, 'VERSION'), 'utf8').trim() === framework, `expected ${framework}`);
for (const path of workspaceManifestPaths()) {
  const manifest = readJson(path);
  check(relative(root, path), manifest.version === framework, `version is '${manifest.version}', expected '${framework}'`);
}

checkJsonField('release/release-policy.json', 'frameworkVersion', framework);
checkJsonField('release/v1-readiness.json', 'frameworkVersion', framework);
checkJsonField('release/api-freeze.json', 'frameworkVersion', framework);
checkJsonField('release/spec-freeze.json', 'frameworkVersion', framework);
checkJsonField('release/spec-freeze.json', 'specificationVersion', specification);
checkJsonField('apps/browser-devtools/manifest.json', 'version', framework);

contains('README.md', `**Current release line:** \`${framework}\` unstable.`);
contains('README.md', `VX ${line} is prepared for GitHub and npm publication`);
contains('docs/CONTRIBUTING.md', `VX is in the ${line} stabilization line.`);
contains('docs/SUPPORT-POLICY.md', `The VX ${line} line supports Node.js`);
contains('docs/spec/FROZEN.md', `# VX ${specification} Specification Freeze`);
contains('docs/spec/FROZEN.md', `frozen for the ${specification} stabilization line as of ${freezeDate}.`);
contains('docs/RELEASE.md', `${framework}-canary.<revision>.<sequence>`);
contains('docs/RELEASE.md', `${framework}-next.<sequence>`);
contains('docs/VERSIONING.md', `current synchronized framework version is \`${framework}\``);
contains('.github/ISSUE_TEMPLATE/bug-report.yml', `placeholder: ${framework}-next.0`);
contains('packages/plugins/src/sitemap/index.ts', `version: '${framework}'`);

verifyApiBaseline();
verifyGeneratedApiDocs();
verifyFreezeIntegrity();
verifyTemplates();
verifyChangesetsFixedGroup();

if (issues.length > 0) {
  for (const issue of issues) console.error(`VX version drift: ${issue}`);
  throw new Error(`VX version synchronization failed with ${issues.length} issue(s). Run 'pnpm version:sync'.`);
}
console.log(`VX version synchronization passed at ${framework} (specification ${specification}, channel ${channel}).`);

function verifyApiBaseline() {
  const publicNames = publicPackageManifests().map(({ manifest }) => manifest.name);
  const snapshot = readJson(join(root, 'release/api-baseline.json'));
  const packages = Array.isArray(snapshot.packages) ? snapshot.packages : [];
  check('release/api-baseline.json', packages.length === publicNames.length, `contains ${packages.length} packages, expected ${publicNames.length}`);
  const names = packages.map((pkg) => pkg.name).sort();
  check('release/api-baseline.json', JSON.stringify(names) === JSON.stringify(publicNames), 'package names do not match the public workspace set');
  for (const pkg of packages) check(`release/api-baseline.json:${pkg.name}`, pkg.version === framework, `version is '${pkg.version}', expected '${framework}'`);
}

function verifyGeneratedApiDocs() {
  const apiDir = join(root, 'docs/api');
  if (!existsSync(apiDir)) {
    check('docs/api', false, 'docs/api directory does not exist. Run pnpm version:sync.');
    return;
  }
  const expected = publicPackageManifests().map(({ manifest }) => `${manifest.name.replace('@vx-foundation/', '')}.md`).sort();
  const actual = readdirSync(apiDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md')
    .map((entry) => entry.name)
    .sort();
  check('docs/api', JSON.stringify(actual) === JSON.stringify(expected), 'generated API pages do not match the public package set');
  for (const file of expected) contains(`docs/api/${file}`, `Current package line: \`${framework}\`.`);
}

function verifyFreezeIntegrity() {
  const apiFreeze = readJson(join(root, 'release/api-freeze.json'));
  const api = readFileSync(join(root, apiFreeze.path));
  check('release/api-freeze.json', apiFreeze.sha256 === sha256(api), 'API baseline hash is stale');
  const snapshot = JSON.parse(api.toString('utf8'));
  check('release/api-freeze.json', apiFreeze.packages === snapshot.packages.length, 'API package count is stale');
  const entrypoints = snapshot.packages.reduce((total, pkg) => total + (Array.isArray(pkg.entrypoints) ? pkg.entrypoints.length : 0), 0);
  check('release/api-freeze.json', apiFreeze.entrypoints === entrypoints, 'API entrypoint count is stale');

  const specFreeze = readJson(join(root, 'release/spec-freeze.json'));
  for (const file of specFreeze.files ?? []) {
    const content = readFileSync(join(root, file.path));
    check(`release/spec-freeze.json:${file.path}`, file.size === content.byteLength, 'size is stale');
    check(`release/spec-freeze.json:${file.path}`, file.sha256 === sha256(content), 'hash is stale');
  }
  check('release/spec-freeze.json', specFreeze.integrity === sha256(Buffer.from(JSON.stringify(specFreeze.files))), 'integrity is stale');
}

function verifyTemplates() {
  for (const template of ['basic', 'starter', 'fullstack', 'library']) {
    const manifest = readJson(join(root, 'packages/cli/templates', template, 'package.json'));
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const [name, range] of Object.entries(manifest[field] ?? {})) {
        if (name.startsWith('@vx-foundation/')) check(`template:${template}`, range === 'workspace:*', `${name} uses '${range}', expected 'workspace:*'`);
      }
    }
  }
}

function verifyChangesetsFixedGroup() {
  const expected = publicPackageManifests().map(({ manifest }) => manifest.name);
  const config = readJson(join(root, '.changeset/config.json'));
  const groups = Array.isArray(config.fixed) ? config.fixed : [];
  const actual = Array.isArray(groups[0]) ? [...groups[0]].sort() : [];
  check('.changeset/config.json', groups.length === 1, `expected one fixed public-package group, found ${groups.length}`);
  check('.changeset/config.json', JSON.stringify(actual) === JSON.stringify(expected), 'fixed package group does not match the public workspace package set');
}

function checkJsonField(path, field, expected) {
  const value = readJson(join(root, path));
  check(path, value[field] === expected, `${field} is '${value[field]}', expected '${expected}'`);
}

function contains(path, expected) {
  const source = readFileSync(join(root, path), 'utf8');
  check(path, source.includes(expected), `missing '${expected}'`);
}

function check(target, condition, message) {
  if (!condition) issues.push(`${target}: ${message}.`);
}
