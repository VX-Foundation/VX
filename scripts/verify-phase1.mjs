import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { parse } from '../packages/language/dist/index.js';
import { analyze, lower, UnsupportedLoweringError } from '../packages/compiler/dist/index.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const canonicalPath = join(root, 'packages/language/test/fixtures/canonical.vx');
const canonicalSource = await readFile(canonicalPath, 'utf8');
const canonical = parse(canonicalSource, canonicalPath);
assert.deepEqual(canonical.diagnostics, [], 'canonical source must parse without diagnostics');

const script = canonical.ast.blocks.find((block) => block.kind === 'ScriptBlock');
const view = canonical.ast.blocks.find((block) => block.kind === 'ViewBlock');
assert(script?.kind === 'ScriptBlock');
assert(view?.kind === 'ViewBlock');
assert(script.statements.some((statement) => statement.kind === 'ConstDeclaration'));
assert(script.statements.some((statement) => statement.kind === 'QueryDeclaration'));
assert(script.statements.some((statement) => statement.kind === 'EffectDeclaration'));
assert.equal(view.roles.length, 2);
assert.equal(view.roles[1]?.states[0]?.name, 'hover');

const canonicalAnalysis = analyze(canonical.ast);
assert.deepEqual(canonicalAnalysis.diagnostics, [], 'canonical source must analyze without diagnostics');
assert.deepEqual(
  [...(canonicalAnalysis.graph.nodes.get('products')?.dependencies ?? [])].sort(),
  ['category', 'page', 'pageSize']
);

assert.throws(
  () => lower(canonical.ast, canonicalAnalysis.graph),
  (error) => error instanceof UnsupportedLoweringError && error.code === 'VX3004'
);


const roleOnly = parse(
  '#view\nView @grid(min: 240) { Text("x") }\n#end view',
  'roles.vx'
);
assert.deepEqual(roleOnly.diagnostics, []);
const roleOnlyAnalysis = analyze(roleOnly.ast);
assert.deepEqual(roleOnlyAnalysis.diagnostics, []);
const roleOnlyOutput = lower(roleOnly.ast, roleOnlyAnalysis.graph, roleOnlyAnalysis.visual);
assert.match(roleOnlyOutput.clientCode, /installStyles/);
assert.match(roleOnlyOutput.clientCode, /attachVisualIntent/);

const componentOnly = parse(
  '#view\nProductCard()\n#end view',
  'component.vx'
);
assert.deepEqual(componentOnly.diagnostics, []);
const componentOnlyAnalysis = analyze(componentOnly.ast);
assert.deepEqual(componentOnlyAnalysis.diagnostics, []);
assert.throws(
  () => lower(componentOnly.ast, componentOnlyAnalysis.graph),
  (error) => error instanceof UnsupportedLoweringError && error.code === 'VX3004'
);

const storeOnly = parse(
  '#script\nstore session from "./session.vx"\n#end script',
  'store.vx'
);
assert.deepEqual(storeOnly.diagnostics, []);
const storeOnlyAnalysis = analyze(storeOnly.ast);
assert.deepEqual(storeOnlyAnalysis.diagnostics, []);
const storeOutput = lower(storeOnly.ast, storeOnlyAnalysis.graph, storeOnlyAnalysis.visual, storeOnlyAnalysis.data);
assert.match(storeOutput.clientCode, /acquireStore/);
assert.match(storeOutput.clientCode, /"component"/);

assertAnalyzeDiagnostic(
  '#view\nButton { unknownProperty: true }\n#end view',
  'VX_UNKNOWN_PROPERTY'
);

assertDiagnostic(
  '#style\n  Button {}\n#end style',
  'VX1006',
  'superseded #style must be rejected at the language boundary'
);
assertAnalyzeDiagnostic(
  '#script\nstate count: Int = 0\nconst doubled: Int = count * 2\n#end script',
  'VX_CONST_REACTIVE_DEPENDENCY'
);
assertAnalyzeDiagnostic(
  '#script\nstate count: Int = 0\neffect { count++ }\n#end script',
  'VX_STATE_MUTATION_OUTSIDE_ACTION'
);
assertAnalyzeDiagnostic(
  '#script\nconst pageSize: Int = 24\naction change() { pageSize++ }\n#end script',
  'VX_READ_ONLY_MUTATION'
);
assertAnalyzeDiagnostic(
  '#view\nView @grid @row { Text("x") }\n#end view',
  'VX_VISUAL_MULTIPLE_STRUCTURAL_ROLES'
);
assertAnalyzeDiagnostic(
  '#view\nButton("Save") @primary @danger\n#end view',
  'VX_VISUAL_MULTIPLE_SEMANTIC_ROLES'
);

const stringSafety = parse(
  '#script\nstate products: Any = none\n#end script\n#view\nText("Loading products")\nif products.loading { Text("Ok") }\n#end view',
  'strings.vx'
);
assert.deepEqual(stringSafety.diagnostics, []);
assert.deepEqual(analyze(stringSafety.ast).diagnostics, []);

const templatePath = join(root, 'packages/cli/templates/basic/src/pages/page.vx');
const template = parse(await readFile(templatePath, 'utf8'), templatePath);
assert.deepEqual(template.diagnostics, [], 'the basic scaffold must parse');
const templateAnalysis = analyze(template.ast);
assert.deepEqual(templateAnalysis.diagnostics, [], 'the basic scaffold must analyze');
const templateOutput = lower(template.ast, templateAnalysis.graph);
assert.match(templateOutput.clientCode, /export default function mountApp/);
assert.doesNotMatch(templateOutput.clientCode, /ctxVar|ctx:\s*any/);

const vxFiles = await collectVxFiles(root);
for (const filePath of vxFiles) {
  const parsed = parse(await readFile(filePath, 'utf8'), filePath);
  assert.deepEqual(parsed.diagnostics, [], `${filePath} must parse without diagnostics`);
  assert.deepEqual(analyze(parsed.ast).diagnostics, [], `${filePath} must analyze without diagnostics`);
}

console.log(`VX Phase 1 verification passed (${vxFiles.length} active .vx files).`);

function assertDiagnostic(source, code, message) {
  const result = parse(source, 'diagnostic.vx');
  assert(result.diagnostics.some((diagnostic) => diagnostic.code === code), message);
}

function assertAnalyzeDiagnostic(source, code) {
  const parsed = parse(source, 'semantic.vx');
  assert.deepEqual(parsed.diagnostics, []);
  const result = analyze(parsed.ast);
  assert(
    result.diagnostics.some((diagnostic) => diagnostic.code === code),
    `expected analyzer diagnostic ${code}, got ${result.diagnostics.map((diagnostic) => diagnostic.code).join(', ')}`
  );
}


async function collectVxFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory)) {
    if (['archive', 'dist', 'node_modules', '.turbo'].includes(entry)) continue;
    const path = join(directory, entry);
    const metadata = await stat(path);
    if (metadata.isDirectory()) files.push(...await collectVxFiles(path));
    else if (path.endsWith('.vx')) files.push(path);
  }
  return files;
}
