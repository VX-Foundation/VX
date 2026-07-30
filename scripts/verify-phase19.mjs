import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
for (const packageName of ['package-system','interop','devtools']) assert.ok(existsSync(resolve(root, 'packages', packageName, 'package.json')), `Missing @vx/${packageName}.`);
const packageSystem = read('packages/package-system/src/semver.ts') + read('packages/package-system/src/lockfile.ts') + read('packages/package-system/src/signatures.ts') + read('packages/package-system/src/workspace.ts') + read('packages/package-system/src/contracts.ts') + read('packages/package-system/src/publication.ts');
for (const contract of ['compareSemver', 'satisfiesSemver', 'validSemverRange', 'lockfileVersion', 'ed25519', 'createWorkspaceGraph', 'comparePublicContracts', 'createPublicationManifest', 'verifyPublicationManifest']) assert.ok(packageSystem.includes(contract), `Package system is missing ${contract}.`);
const pluginExports = JSON.parse(read('packages/plugins/package.json')).exports;
assert.ok(pluginExports['./sitemap'] && pluginExports['./host']);
assert.equal(pluginExports['./tailwind'], undefined);
assert.equal(pluginExports['./mdx'], undefined);
assert.ok(!existsSync(resolve(root, 'packages/plugins/src/tailwind')) && !existsSync(resolve(root, 'packages/plugins/src/mdx')), 'Symbolic plugins remain in the source tree.');
const host = read('packages/plugins/src/host.ts');
for (const contract of ['apiVersion', 'allowedCapabilities', 'allowedPermissions', 'requireSignatures', 'withTimeout', 'deterministic', 'safeRelativePath']) assert.ok(host.includes(contract), `Plugin host is missing ${contract}.`);
const sandbox = read('packages/plugins/src/sandbox.ts') + read('packages/plugins/src/sandbox-loader.ts') + read('packages/plugins/src/source-integrity.ts') + read('packages/plugins/src/sandbox-worker.ts');
for (const contract of ['Worker', 'resourceLimits', 'read-project-file', 'blocked sensitive module', 'outside the plugin dependency graph', 'maxOldGenerationSizeMb', 'vx.plugin.json', 'sourceIntegrity', 'protected project data']) assert.ok(sandbox.includes(contract), `Plugin sandbox is missing ${contract}.`);
const types = read('packages/compiler/src/package/types.ts');
for (const field of ['privateModules', 'publicContracts', 'deprecation', 'migrations']) assert.ok(types.includes(field), `Generated package manifest is missing ${field}.`);
const interop = read('packages/interop/src/types.ts') + read('packages/interop/src/runtime.ts') + read('packages/interop/src/resolver.ts');
for (const contract of ['callback','promise','stream','class','browser','node','server','resolveNpmInteropPackage','declarationsPath','usedConditions','treeShakable']) assert.ok(interop.includes(contract), `Interop contract is missing ${contract}.`);
const pluginTypes = read('packages/types/src/index.ts');
for (const forbidden of ["'network' | 'filesystem'", "'spawn-process'"]) assert.ok(!pluginTypes.includes(forbidden), `Unmediated plugin surface remains: ${forbidden}`);

const publish = read('packages/cli/src/commands/publish.ts');
for (const contract of ['vx.publication.json', 'createPublicationManifest', 'verifyPublicationManifest', 'publicationIntegrity']) assert.ok(publish.includes(contract), `Publish command is missing ${contract}.`);

console.log('Phase 19 structural verification passed.');
