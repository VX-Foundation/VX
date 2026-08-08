import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../../../packages/language/dist/index.js';
import { analyze, lower } from '../../../packages/compiler/dist/core.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '..', '..');
const pagesRoot = join(appRoot, 'src', 'pages');
const files = collect(pagesRoot);
let warnings = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const displayPath = relative(repositoryRoot, file).replaceAll('\\', '/');
  const parsed = parse(source, displayPath);
  const parseErrors = parsed.diagnostics.filter((diagnostic) => (diagnostic.severity ?? 'error') === 'error');
  assert.deepEqual(parseErrors, [], `${displayPath} must parse without errors.`);
  const analysis = analyze(parsed.ast);
  const semanticErrors = analysis.diagnostics.filter((diagnostic) => (diagnostic.severity ?? 'error') === 'error');
  warnings += analysis.diagnostics.length - semanticErrors.length;
  assert.deepEqual(semanticErrors, [], `${displayPath} must analyze without semantic errors.`);
  const output = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);
  assert.ok(output.clientCode.length > 0, `${displayPath} must produce client lowering.`);
  assert.ok(output.serverCode.length > 0, `${displayPath} must produce SSR lowering.`);
}

console.log(`VX documentation pipeline verified: ${files.length} modules parsed, analyzed, and lowered for client and SSR (${warnings} warnings).`);

function collect(directory) {
  const output = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) output.push(...collect(path));
    else if (path.endsWith('.vx')) output.push(path);
  }
  return output.sort();
}
