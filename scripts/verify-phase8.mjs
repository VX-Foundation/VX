import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  VXLanguageService,
  compareHMRSignatures,
  createComponentHarness,
  formatVX,
  inspectVX,
  migrateVXSource
} from '../packages/tooling/dist/index.js';

const root = process.cwd();
const source = `#script
state count:Int=0
derive doubled:Int=count*2
server action save(value:String): String {
  return value
}
action increment(){
count++
}
#end script
#view
View{
Text("Count: "+count)
Button("Increment"){
click=>increment()
}
}
#end view
`;

const formatted = formatVX(source, '/Counter.vx');
assert.equal(formatted.diagnostics.filter((item) => item.severity === 'error').length, 0);
assert.match(formatted.code, /Text\("Count: " \+ count\)/);
assert.equal(formatVX(formatted.code, '/Counter.vx').changed, false, 'formatter must be idempotent');
const literalFormatting = formatVX(`#script
const sample:String="a:b,c=>d" // keep:x,y
const matcher:Any=/a:b,c=>d\\/[x]/gi
#end script
`, '/Literals.vx');
assert.match(literalFormatting.code, /"a:b,c=>d" \/\/ keep:x,y/);
assert.match(literalFormatting.code, /\/a:b,c=>d\\\/\[x\]\/gi/);

const service = new VXLanguageService();
const snapshot = service.open('/Counter.vx', formatted.code, 1);
assert(snapshot.symbols.some((symbol) => symbol.name === 'count' && symbol.kind === 'state'));
const countUse = formatted.code.indexOf('count++');
assert.equal(service.definition('/Counter.vx', countUse)?.name, 'count');
assert(service.references('/Counter.vx', countUse).length >= 3);
assert(service.rename('/Counter.vx', countUse, 'total').every((edit) => edit.newText === 'total'));
assert(service.completions('/Counter.vx', formatted.code.length).some((entry) => entry.label === 'action'));
const scopedCode = formatVX(`#script
state value:Int=1
action update(value:Int):Int{
return value
}
#end script
#view
Text("value")
Text(value)
#end view
`, '/Scoped.vx').code;
service.open('/Scoped.vx', scopedCode, 1);
const parameterUse = scopedCode.indexOf('return value') + 'return '.length;
const stateUse = scopedCode.lastIndexOf('value)');
assert.equal(service.definition('/Scoped.vx', parameterUse)?.kind, 'parameter');
assert.equal(service.definition('/Scoped.vx', stateUse)?.kind, 'state');
assert.equal(service.definition('/Scoped.vx', scopedCode.indexOf('\"value\"') + 2), undefined);
assert.equal(service.references('/Scoped.vx', stateUse).length, 2, 'string literals must not become rename references');
service.open('/Broken.vx', '#script\nstate count: Int = 0\n', 1);
assert(service.codeActions('/Broken.vx').some((action) => action.title === "Insert '#end script'"));

const inspection = inspectVX(formatted.code, '/Counter.vx', true);
assert(inspection.reactiveGraph.some((node) => node.name === 'doubled' && node.dependencies.includes('count')));
assert(inspection.boundaries.some((boundary) => boundary.name === 'save' && boundary.side === 'server'));
assert(inspection.generated?.client.includes('mountApp'));
assert(inspection.generated?.server.includes('renderComponent'));

const harness = createComponentHarness(formatted.code, '/Counter.vx');
harness.assertValid();
assert(harness.sourceMap.length > 0);

const stable = {
  componentId: 'counter', moduleKind: 'component', props: [], outputs: [], content: [], parts: [], exports: [],
  state: ['count:Int'], stores: [], queries: []
};
assert.equal(compareHMRSignatures(stable, { ...stable }).preserveState, true);
assert.equal(compareHMRSignatures(stable, { ...stable, state: ['count:String'] }).compatible, false);

const migration = migrateVXSource('#state\nstate count: Int = 0\n#end state\n');
assert.equal(migration.changed, true);
assert.match(migration.code, /#script/);
const mergedMigration = migrateVXSource('#state\nstate count: Int = 0\n#end state\n#logic\naction increment() { count++ }\n#end logic\n');
assert.equal((mergedMigration.code.match(/#script/g) ?? []).length, 1);
assert.match(mergedMigration.code, /action increment/);
assert(migrateVXSource('#style\n.card {}\n#end style\n').manual.length > 0);

const requiredFiles = [
  'packages/tooling/src/formatter.ts',
  'packages/tooling/src/language-service.ts',
  'packages/tooling/src/inspect.ts',
  'packages/tooling/src/hmr.ts',
  'packages/tooling/src/testing.ts',
  'packages/tooling/src/migration.ts',
  'packages/cli/templates/fullstack/src/pages/layout.vx',
  'apps/playground/src/worker.ts'
];
for (const file of requiredFiles) assert(fs.existsSync(path.join(root, file)), `missing Phase 8 file: ${file}`);

const bundler = fs.readFileSync(path.join(root, 'packages/bundler/src/plugin.ts'), 'utf8');
assert.match(bundler, /compareHMRSignatures/);
assert.match(bundler, /vx:hmr-contract/);
assert.match(bundler, /sourceToComponentId\.set\(artifact\.filePath, artifact\.id\)/);
assert.match(bundler, /import\.meta\.hot\.accept\(\)/);
assert.match(bundler, /full-reload/);
const languageServer = fs.readFileSync(path.join(root, 'packages/language-server/src/server.ts'), 'utf8');
for (const feature of ['onDefinition', 'onReferences', 'onRenameRequest', 'onCodeAction', 'onDocumentFormatting', 'onDocumentSymbol']) {
  assert(languageServer.includes(feature), `language server is missing ${feature}`);
}
assert.match(languageServer, /onRequest\('vx\/inspect'/);
const extension = fs.readFileSync(path.join(root, 'packages/vscode-extension/src/extension.ts'), 'utf8');
assert.match(extension, /sendRequest<VXInspection>\('vx\/inspect'/);
assert.match(extension, /createOutputChannel\('VX Inspector'\)/);
assert(fs.existsSync(path.join(root, 'packages/vscode-extension/scripts/stage-language-server.mjs')));
const cli = fs.readFileSync(path.join(root, 'packages/cli/src/cli.ts'), 'utf8');
for (const command of ["command('format", "command('inspect", "command('test:component", "command('migrate"]) assert(cli.includes(command));

console.log('Phase 8 tooling verification passed.');
