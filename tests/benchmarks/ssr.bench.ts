import { bench, describe } from 'vitest';
import { parse } from '@vx/language';
import { analyze, lower } from '@vx/compiler/core';
import { createRequestRuntime, createServerRenderContext, renderDocument } from '@vx/runtime/server';

const source = '#view\n  View {\n    Title("VX", level: 1)\n    Text("Production benchmark")\n  }\n#end view\n';

describe('compiler and SSR performance', () => {
  bench('parse, analyze and lower a component', () => {
    const parsed = parse(source, '/benchmark.vx');
    const analyzed = analyze(parsed.ast);
    lower(parsed.ast, analyzed.graph, analyzed.visual, analyzed.data);
  });

  bench('render a server document', async () => {
    const runtime = createRequestRuntime({ requestId: 'benchmark' });
    const context = createServerRenderContext({ runtime, routeId: 'benchmark', requestURL: new URL('https://vx.test/'), hydration: 'full', streaming: 'blocking' });
    renderDocument({ context, html: '<h1>VX</h1>' });
    context.dispose();
    runtime.dispose();
  });
});
