import assert from 'node:assert/strict';
import { widgets } from '../../packages/widgets/registry/widgets.mjs';
import { parse } from '../../packages/language/dist/index.js';
import { analyze, lower } from '../../packages/compiler/dist/core.js';

let diagnostics = 0;
for (const [name, definition] of Object.entries(widgets)) {
  const source = `#view\n  ${name} {}\n#end view\n`;
  const parsed = parse(source, `/widget-conformance/${name}.vx`);
  assert.equal(
    parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error').length,
    0,
    `${name} must parse as a native widget.`
  );
  const analysis = analyze(parsed.ast);
  diagnostics += analysis.diagnostics.length;
  const output = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);
  assert.match(output.clientCode, new RegExp(`markWidget\\([^;]+, "${escapeRegex(name)}"`), `${name} must preserve its client widget identity.`);
  assert.match(output.clientCode, new RegExp(`claimHydrationElement\\([^;]+, "${escapeRegex(definition.nativeElement)}"\\)`), `${name} must lower to <${definition.nativeElement}> on the client.`);
  assert.match(output.serverCode, new RegExp(`renderElement\\("${escapeRegex(definition.nativeElement)}"[^;]+"${escapeRegex(name)}"\\)`), `${name} must lower to <${definition.nativeElement}> in SSR.`);
}

console.log(`VX widget lowering verified for ${Object.keys(widgets).length} canonical widgets (${diagnostics} non-blocking semantic diagnostics).`);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
