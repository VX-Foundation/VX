import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { analyze, lower } from '../packages/compiler/dist/index.js';
import { compileComponentProject } from '../packages/compiler/dist/project.js';
import { parse } from '../packages/language/dist/index.js';
import { selectPatternBranch } from '../packages/runtime/dist/structural.js';

const source = `#script
  state ready: Bool = true
  state loading: Bool = false
  state products: List<Any> = []
  state result: Any = { status: "success", data: { label: "Ready" } }
#end script

#view
  if ready {
    Text("Ready")
  } else if loading {
    Text("Loading")
  } else {
    Text("Unavailable")
  } transition("fade")

  for product, index in products keyed(product.id) {
    Text(product.name + index)
  } loading {
    Text("Loading products")
  } empty {
    Text("No products")
  } error problem {
    Text(problem.message)
  } transition("slide")

  when result {
    is Success(payload) {
      Text(payload.label)
    }
    is "cached" {
      Text("Cached")
    }
    else {
      Text("Unknown")
    }
  } transition("scale")
#end view`;

const parsed = parse(source, 'phase5-verification.vx');
assert.deepEqual(parsed.diagnostics, []);

const analysis = analyze(parsed.ast);
assert.deepEqual(analysis.diagnostics, []);

const output = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);
assert.match(output.clientCode, /structuralMount\(/);
assert.match(output.clientCode, /collectionMount\(/);
assert.match(output.clientCode, /selectPatternBranch\(/);
assert.match(output.clientCode, /markViewSource\(/);
assert.match(output.clientCode, /claimHydrationComment\([^\n]+"vx:if:/);
assert.match(output.clientCode, /claimHydrationComment\([^\n]+"vx:collection:/);
assert.match(output.clientCode, /claimHydrationComment\([^\n]+"vx:when:/);
assert.match(output.clientCode, /__vx_item_/);
assert.match(output.clientCode, /__vx_index_/);
assert.match(output.clientCode, /__vx_match_/);
assert.match(output.clientCode, /__vx_collection_error_/);
assert.equal(output.viewSourceMap.some((entry) => entry.kind === 'if'), true);
assert.equal(output.viewSourceMap.some((entry) => entry.kind === 'collection'), true);
assert.equal(output.viewSourceMap.some((entry) => entry.kind === 'when'), true);
assert.equal(output.viewSourceMap.some((entry) => entry.kind === 'widget'), true);
const generatedLines = output.clientCode.split('\n');
for (const entry of output.viewSourceMap) {
  assert(entry.id.startsWith('vxv-'));
  assert(entry.generated.startLine > 0);
  assert(entry.generated.endLine >= entry.generated.startLine);
  assert(entry.span.end.offset >= entry.span.start.offset);
  if (entry.kind !== 'text') {
    const generatedRange = generatedLines.slice(entry.generated.startLine - 1, entry.generated.endLine).join('\n');
    assert(
      generatedRange.includes(entry.id),
      `Visual source '${entry.id}' is outside its generated line range.`
    );
  }
}

const projectRoot = await mkdtemp(join(tmpdir(), 'vx-phase5-project-'));
try {
  const entryPath = join(projectRoot, 'App.vx');
  await writeFile(entryPath, source, 'utf8');
  const project = compileComponentProject(entryPath, { rootDir: projectRoot });
  assert.deepEqual(project.diagnostics, []);
  const artifact = project.artifacts.get(project.entryId);
  assert(artifact);
  assert.equal(artifact.viewSourceMap.some((entry) => entry.kind === 'collection'), true);
  assert.equal(artifact.viewSourceMap.some((entry) => entry.kind === 'when'), true);
} finally {
  await rm(projectRoot, { recursive: true, force: true });
}

const invalid = parse(`#view
  when value {
    is _ { Text("Any") }
    is String { Text("Never") }
    is String { Text("Duplicate") }
    else { Text("Also unreachable") }
  }

  when result {
    is Success(first) { Text(first) }
    is Success(second) { Text(second) }
    else { Text("Fallback") }
    is Error(problem) { Text(problem.message) }
  }

  when fallbackOnly {
    else { Text("Invalid") }
  }

  for item in items keyed(item.id) {
    Text(item.name)
  } empty { Text("First") } empty { Text("Second") }
#end view`, 'phase5-invalid.vx');
assert(invalid.diagnostics.some((diagnostic) => diagnostic.code === 'VX1216'));
assert(invalid.diagnostics.some((diagnostic) => diagnostic.code === 'VX1217'));
assert(invalid.diagnostics.some((diagnostic) => diagnostic.code === 'VX1213'));

const patterns = [
  {
    category: 'named',
    text: 'Success(payload)',
    name: 'Success',
    binding: 'payload'
  },
  {
    category: 'literal',
    text: '"cached"',
    literal: 'cached'
  }
];

const success = selectPatternBranch(
  { status: 'success', data: { label: 'Verified' } },
  patterns,
  'fallback'
);
assert.deepEqual(success, {
  key: 0,
  values: { payload: { label: 'Verified' } }
});
assert.deepEqual(selectPatternBranch('cached', patterns, 'fallback'), {
  key: 1,
  values: {}
});
assert.deepEqual(selectPatternBranch('other', patterns, 'fallback'), {
  key: 'fallback'
});

console.log('VX Phase 5 verification passed (control flow, patterns, keyed collections, direct-DOM lowering, transitions, nested bindings, diagnostics, and visual source maps).');
