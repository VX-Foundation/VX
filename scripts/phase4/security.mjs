import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { compileComponentProject } from '../../packages/compiler/dist/project.js';
import { writeProject } from './fixtures.mjs';

export async function verifyPhase4Security(root) {
  await expectCode(root, 'unknown-prop', baseUse('unknown: "x"'), 'VX_COMPONENT_UNKNOWN_PROP');
  await expectCode(root, 'unknown-output', baseUse('missing => receive($event)'), 'VX_COMPONENT_UNKNOWN_OUTPUT_BINDING');
  await expectCode(root, 'unknown-content', baseUse('content missing { Text("x") }'), 'VX_COMPONENT_UNKNOWN_CONTENT_REGION');
  await expectCode(root, 'unknown-part', baseUse('part missing @title'), 'VX_COMPONENT_UNKNOWN_VISUAL_PART');
  await expectCode(root, 'required-prop', baseUse(''), 'VX_COMPONENT_REQUIRED_PROP');
  await expectCode(root, 'prop-type', baseUse('title: 42'), 'VX_COMPONENT_PROP_TYPE');
  await expectCode(root, 'root-part', baseUse('title: "x"', '@card'), 'VX_COMPONENT_ROOT_PART_REQUIRED');

  await expectCode(root, 'dynamic-output', {
    'App.vx': componentWithScript('output save: String\n  action send(name: String) { emit(name, "x") }')
  }, 'VX_COMPONENT_DYNAMIC_OUTPUT');
  await expectCode(root, 'output-type', {
    'App.vx': componentWithScript('output save: Int\n  action send() { emit("save", "x") }')
  }, 'VX_COMPONENT_OUTPUT_TYPE');
  await expectCode(root, 'unsafe-name', {
    'App.vx': componentWithScript('output __proto__: String')
  }, 'VX_COMPONENT_UNSAFE_CONTRACT_NAME');
  await expectCode(root, 'server-prop', {
    'App.vx': componentWithScript('server prop secret: String')
  }, 'VX_COMPONENT_SERVER_PROP');
  await expectCode(root, 'component-export', {
    'App.vx': componentWithScript('export const shared: String = "x"')
  }, 'VX_COMPONENT_NAMED_EXPORT');
  await expectCode(root, 'part-type', {
    'App.vx': `#script
  part title: text
#end script
#view
  View @part(name: title) {}
#end view
`
  }, 'VX_COMPONENT_PART_TYPE_MISMATCH');

  await expectCode(root, 'emit-outside-action', {
    'App.vx': componentWithScript('output save: String\n  effect invalidEmit { emit("save", "x") }')
  }, 'VX_COMPONENT_EMIT_OUTSIDE_ACTION');

  await expectCode(root, 'default-import-headless', {
    'values.vx': '#script\n  export const value: String = "x"\n#end script\n',
    'App.vx': '#script\n  import Values from "./values.vx"\n#end script\n#view\n  View {}\n#end view\n'
  }, 'VX_COMPONENT_DEFAULT_IMPORT_KIND');

  await expectCode(root, 'named-import-component', {
    'Card.vx': componentWithScript(''),
    'App.vx': '#script\n  import { value } from "./Card.vx"\n#end script\n#view\n  View {}\n#end view\n'
  }, 'VX_COMPONENT_NAMED_IMPORT_KIND');

  await expectCode(root, 'import-declaration-conflict', {
    'values.vx': '#script\n  export const value: String = "x"\n#end script\n',
    'App.vx': '#script\n  import { value } from "./values.vx"\n  state value: String = "local"\n#end script\n#view\n  Text(value)\n#end view\n'
  }, 'VX_COMPONENT_IMPORT_DECLARATION_CONFLICT');

  await expectCode(root, 'cycle', {
    'A.vx': '#script\n  import B from "./B.vx"\n#end script\n#view\n  B {}\n#end view\n',
    'B.vx': '#script\n  import A from "./A.vx"\n#end script\n#view\n  A {}\n#end view\n'
  }, 'VX_COMPONENT_IMPORT_CYCLE', 'A.vx');

  const escapeRoot = join(root, 'path-escape');
  await mkdir(escapeRoot, { recursive: true });
  await writeFile(join(root, 'outside.vx'), componentWithScript(''), 'utf8');
  await writeFile(join(escapeRoot, 'App.vx'), '#script\n  import Outside from "../outside.vx"\n#end script\n#view\n  Outside {}\n#end view\n', 'utf8');
  assertCode(compileComponentProject(join(escapeRoot, 'App.vx'), { rootDir: escapeRoot }), 'VX_COMPONENT_BOUNDARY_ESCAPE');

  const symlinkRoot = join(root, 'symlink-escape');
  await mkdir(symlinkRoot, { recursive: true });
  await symlink(join(root, 'outside.vx'), join(symlinkRoot, 'Outside.vx'));
  await writeFile(join(symlinkRoot, 'App.vx'), '#script\n  import Outside from "./Outside.vx"\n#end script\n#view\n  Outside {}\n#end view\n', 'utf8');
  assertCode(compileComponentProject(join(symlinkRoot, 'App.vx'), { rootDir: symlinkRoot }), 'VX_COMPONENT_BOUNDARY_ESCAPE');

  const sizeRoot = join(root, 'size-limit');
  await writeProject(sizeRoot, { 'App.vx': `${componentWithScript('')}\n${'x'.repeat(256)}` });
  assertCode(compileComponentProject(join(sizeRoot, 'App.vx'), { rootDir: sizeRoot, maxFileBytes: 64 }), 'VX_COMPONENT_FILE_SIZE');

  const manualManifestRoot = join(root, 'manual-package-manifest');
  await writeProject(manualManifestRoot, {
    'App.vx': '#script\n  import Card from "@secure/manual"\n#end script\n#view\n  Card {}\n#end view\n',
    'node_modules/@secure/manual/package.json': JSON.stringify({ name: '@secure/manual', version: '1.0.0' }),
    'node_modules/@secure/manual/vx.package.json': JSON.stringify({
      name: '@secure/manual',
      framework: '^0.0.0',
      exports: { '.': './Card.vx' }
    }),
    'node_modules/@secure/manual/Card.vx': componentWithScript('')
  });
  assertCode(
    compileComponentProject(join(manualManifestRoot, 'App.vx'), { rootDir: manualManifestRoot, frameworkVersion: '0.0.0' }),
    'VX_PACKAGE_MANUAL_MANIFEST'
  );

  const invalidRoot = compileComponentProject(join(root, 'missing', 'App.vx'), { rootDir: join(root, 'missing') });
  assertCode(invalidRoot, 'VX_COMPONENT_ROOT');
}

async function expectCode(root, name, files, code, entry = 'App.vx') {
  const target = join(root, name);
  await writeProject(target, typeof files === 'string' ? { 'App.vx': files } : files);
  assertCode(compileComponentProject(join(target, entry), { rootDir: target }), code);
}

function assertCode(result, code) {
  assert(result.diagnostics.some((diagnostic) => diagnostic.code === code), `Expected diagnostic ${code}, received ${result.diagnostics.map((item) => item.code).join(', ')}`);
}

function baseUse(body, role = '') {
  return {
    'Card.vx': `#script
  prop title: String
  output select: String
  content default: optional
  part title: text
#end script
#view
  Title(title) @part(name: title)
  Content(default)
#end view
`,
    'App.vx': `#script
  import Card from "./Card.vx"
  action receive(value: String) {}
#end script
#view
  Card ${role} {
    ${body}
  }
#end view
`
  };
}

function componentWithScript(script) {
  return `#script
  ${script}
#end script
#view
  View {}
#end view
`;
}
