import assert from 'node:assert/strict';
import { cp, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { buildVXPackage, discoverVXPackagePublicAPI } from '../../packages/compiler/dist/package/index.js';
import { compileComponentProject } from '../../packages/compiler/dist/project.js';
import { writeProject } from './fixtures.mjs';

export async function verifyPhase4Packaging(root) {
  const libraryRoot = join(root, 'library');
  await writeProject(libraryRoot, {
    'package.json': JSON.stringify({
      name: '@acme/ui',
      version: '1.2.0',
      description: 'Convention-driven VX package'
    }),
    'src/internal/card-label.vx': '#script\n  export const suffix: String = " component"\n#end script\n',
    'src/components/Card.vx': `#script
  import { suffix } from "../internal/card-label.vx"
  prop title: String
#end script
#view
  Text(title + suffix)
#end view
`,
    'src/modules/labels.vx': '#script\n  export const heading: String = "Packages"\n#end script\n'
  });


  const templateRoot = join(root, 'library-template');
  await cp(resolve('packages/cli/templates/library'), templateRoot, { recursive: true });
  const templatePackagePath = join(templateRoot, 'package.json');
  const templatePackage = JSON.parse(await readFile(templatePackagePath, 'utf8'));
  templatePackage.name = '@acme/template-library';
  await writeFile(templatePackagePath, `${JSON.stringify(templatePackage, null, 2)}
`, 'utf8');
  const templateBuild = buildVXPackage(templateRoot, { frameworkVersion: '0.0.0' });
  assert.deepEqual(templateBuild.diagnostics, []);
  assert.deepEqual(Object.keys(templateBuild.manifest?.exports ?? {}), ['./card', './labels']);

  const sourcePackage = JSON.parse(await readFile(join(libraryRoot, 'package.json'), 'utf8'));
  assert.equal(sourcePackage.exports, undefined, 'authors must not maintain package exports');
  assert.equal(sourcePackage.vx, undefined, 'authors must not maintain VX package metadata');

  const discovery = discoverVXPackagePublicAPI(libraryRoot);
  assert.deepEqual(discovery.diagnostics, []);
  assert.deepEqual(
    discovery.entries.map((entry) => entry.exportKey),
    ['./card', './labels']
  );

  const packaged = buildVXPackage(libraryRoot, { frameworkVersion: '0.0.0' });
  assert.deepEqual(packaged.diagnostics, []);
  assert(packaged.manifest);
  assert.deepEqual(Object.keys(packaged.manifest.exports), ['./card', './labels']);
  assert(packaged.copiedModules.includes('src/internal/card-label.vx'));

  const stagedPackageJson = JSON.parse(await readFile(join(packaged.outDir, 'package.json'), 'utf8'));
  assert.deepEqual(stagedPackageJson.exports, {
    './card': './src/components/Card.vx',
    './labels': './src/modules/labels.vx'
  });
  assert.equal(stagedPackageJson.vx.generatedManifest, './vx.manifest.json');

  const consumerRoot = join(root, 'consumer');
  await mkdir(join(consumerRoot, 'node_modules', '@acme'), { recursive: true });
  await cp(packaged.outDir, join(consumerRoot, 'node_modules', '@acme', 'ui'), { recursive: true });
  await writeProject(consumerRoot, {
    'App.vx': `#script
  import Card from "@acme/ui/card"
  import { heading } from "@acme/ui/labels"
#end script
#view
  Card { title: heading }
#end view
`
  });
  const consumer = compileComponentProject(join(consumerRoot, 'App.vx'), {
    rootDir: consumerRoot,
    frameworkVersion: '0.0.0'
  });
  assert.deepEqual(consumer.diagnostics, []);

  await writeFile(join(consumerRoot, 'Private.vx'), `#script
  import { suffix } from "@acme/ui/internal/card-label"
#end script
`, 'utf8');
  assertCode(
    compileComponentProject(join(consumerRoot, 'Private.vx'), { rootDir: consumerRoot, frameworkVersion: '0.0.0' }),
    'VX_COMPONENT_PACKAGE_EXPORT'
  );

  await writeFile(
    join(consumerRoot, 'node_modules', '@acme', 'ui', 'src', 'internal', 'card-label.vx'),
    '#script\n  export const suffix: String = "tampered"\n#end script\n',
    'utf8'
  );
  assertCode(
    compileComponentProject(join(consumerRoot, 'App.vx'), { rootDir: consumerRoot, frameworkVersion: '0.0.0' }),
    'VX_PACKAGE_INTEGRITY_MISMATCH'
  );

  const sourceConsumer = join(root, 'source-consumer');
  await writeProject(sourceConsumer, {
    'App.vx': '#script\n  import Card from "@local/ui/card"\n#end script\n#view\n  Card { title: "Local" }\n#end view\n',
    'node_modules/@local/ui/package.json': JSON.stringify({ name: '@local/ui', version: '0.1.0' }),
    'node_modules/@local/ui/src/components/Card.vx': '#script\n  prop title: String\n#end script\n#view\n  Text(title)\n#end view\n'
  });
  const sourceResult = compileComponentProject(join(sourceConsumer, 'App.vx'), {
    rootDir: sourceConsumer,
    frameworkVersion: '0.0.0'
  });
  assert.deepEqual(sourceResult.diagnostics, []);

  const collisionRoot = join(root, 'collision');
  await writeProject(collisionRoot, {
    'package.json': JSON.stringify({ name: '@acme/collision', version: '1.0.0' }),
    'src/components/FooBar.vx': '#view\n  Text("component")\n#end view\n',
    'src/modules/foo-bar.vx': '#script\n  export const value: String = "module"\n#end script\n'
  });
  assertCode({ diagnostics: discoverVXPackagePublicAPI(collisionRoot).diagnostics }, 'VX_PACKAGE_EXPORT_COLLISION');

  const publicSymlinkRoot = join(root, 'public-symlink');
  const externalPublicRoot = join(root, 'external-public');
  await writeProject(publicSymlinkRoot, {
    'package.json': JSON.stringify({ name: '@acme/public-symlink', version: '1.0.0' })
  });
  await writeProject(externalPublicRoot, {
    'Card.vx': '#view\n  Text("outside")\n#end view\n'
  });
  await mkdir(join(publicSymlinkRoot, 'src'), { recursive: true });
  await symlink(externalPublicRoot, join(publicSymlinkRoot, 'src', 'components'), 'dir');
  assertCode({ diagnostics: discoverVXPackagePublicAPI(publicSymlinkRoot).diagnostics }, 'VX_PACKAGE_PUBLIC_SYMLINK');

  const outputSymlinkRoot = join(root, 'output-symlink');
  const externalOutput = join(root, 'external-output');
  await writeProject(outputSymlinkRoot, {
    'package.json': JSON.stringify({ name: '@acme/output-symlink', version: '1.0.0' }),
    'src/components/Card.vx': '#view\n  Text("safe")\n#end view\n'
  });
  await mkdir(externalOutput, { recursive: true });
  await symlink(externalOutput, join(outputSymlinkRoot, '.vx'), 'dir');
  assertCode(buildVXPackage(outputSymlinkRoot, { frameworkVersion: '0.0.0' }), 'VX_PACKAGE_OUTPUT_SYMLINK');

}

function assertCode(result, code) {
  assert(
    result.diagnostics.some((diagnostic) => diagnostic.code === code),
    `Expected diagnostic ${code}, received ${result.diagnostics.map((item) => item.code).join(', ')}`
  );
}
