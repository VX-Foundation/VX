import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from '../../packages/language/dist/index.js';
import { analyze, lower } from '../../packages/compiler/dist/core.js';
import { createRequestRuntime, createServerRenderContext, renderDocument } from '../../packages/runtime/dist/server.js';

const source = `#script\n  state count: Int = 0\n#end script\n\n#view\n  View {\n    Title(\"VX\")\n    Button(\"Increment\") {\n      click => count = count + 1\n    }\n    Text(\"Count: \" + count)\n  }\n#end view\n`;
const baselinePath = new URL('../../benchmarks/phase9-baseline.json', import.meta.url);
const update = process.argv.includes('--update');
const calibration = measure('calibration', 20_000, () => JSON.stringify({ value: 42, label: 'vx' }));
const metrics = {
  parseAnalyzeLowerMs: measure('compile', 300, () => {
    const parsed = parse(source, '/benchmark.vx');
    const analyzed = analyze(parsed.ast);
    if (![...parsed.diagnostics, ...analyzed.diagnostics].some((item) => item.severity === 'error')) lower(parsed.ast, analyzed.graph, analyzed.visual, analyzed.data);
  }),
  renderDocumentMs: await measureAsync('render', 500, async () => {
    const runtime = createRequestRuntime({ requestId: 'benchmark' });
    const context = createServerRenderContext({ runtime, routeId: 'benchmark', requestURL: new URL('https://vx.test/'), hydration: 'full', streaming: 'blocking' });
    renderDocument({ context, html: '<h1>VX</h1>' });
    context.dispose();
    runtime.dispose();
  })
};
const normalized = Object.fromEntries(Object.entries(metrics).map(([key, value]) => [key, Number((value / Math.max(calibration, 0.0001)).toFixed(6))]));
const result = { schema: 'https://vx.dev/schemas/benchmark/v1', node: process.version, calibrationMs: calibration, metrics, normalized };
if (update) {
  await writeFile(baselinePath, `${JSON.stringify({ ...result, tolerance: 1.75 }, null, 2)}\n`);
  console.log('Phase 9 benchmark baseline updated.');
} else {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const tolerance = Number(baseline.tolerance ?? 1.75);
  for (const [name, value] of Object.entries(normalized)) {
    const expected = Number(baseline.normalized[name]);
    assert.ok(value <= expected * tolerance, `${name} regressed: ${value} > ${expected} × ${tolerance}`);
  }
  console.log(JSON.stringify(result, null, 2));
  console.log('Phase 9 benchmark gate passed.');
}

function measure(_name, iterations, callback) {
  for (let index = 0; index < Math.min(30, iterations); index += 1) callback();
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) callback();
  return (performance.now() - started) / iterations;
}
async function measureAsync(_name, iterations, callback) {
  for (let index = 0; index < Math.min(10, iterations); index += 1) await callback();
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) await callback();
  return (performance.now() - started) / iterations;
}
