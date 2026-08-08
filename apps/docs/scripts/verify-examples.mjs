import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../../../packages/language/dist/index.js';
import { analyze } from '../../../packages/compiler/dist/core.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(appRoot, '..', '..');
const files = collect(join(repositoryRoot, 'docs'));
let examples = 0;

for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const pattern = /```(?:vx|veelv)\s*\n([\s\S]*?)```/gi;
  let match;
  let index = 0;
  while ((match = pattern.exec(source)) !== null) {
    index += 1;
    examples += 1;
    const displayPath = `${relative(repositoryRoot, file).replaceAll('\\', '/')}#example-${index}`;
    const parsed = parse(match[1], displayPath);
    const parseErrors = parsed.diagnostics.filter((diagnostic) => (diagnostic.severity ?? 'error') === 'error');
    assert.deepEqual(parseErrors, [], `${displayPath} must use the frozen VX grammar.`);
    const analysis = analyze(parsed.ast);
    const semanticErrors = analysis.diagnostics.filter((diagnostic) => (diagnostic.severity ?? 'error') === 'error');
    assert.deepEqual(semanticErrors, [], `${displayPath} must use valid current contracts.`);
  }
}

assert.ok(examples >= 40, `Expected at least 40 executable VX documentation examples, found ${examples}.`);
console.log(`VX documentation examples verified: ${examples} executable examples use the current parser and semantic contracts.`);

function collect(directory) {
  const output = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) output.push(...collect(path));
    else if (path.endsWith('.md')) output.push(path);
  }
  return output.sort();
}
