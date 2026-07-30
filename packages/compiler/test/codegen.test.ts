import { describe, expect, it } from 'vitest';
import { parse } from '@vx/language';
import { analyze, lower } from '../src/index.js';

describe('Compiler lowering pass', () => {
  it('compiles a static primitive view without innerHTML', () => {
    const source = `
#view
  Text("Hello")
#end view
`;
    const parsed = parse(source, 'static.vx');
    expect(parsed.diagnostics).toHaveLength(0);
    const analysis = analyze(parsed.ast);
    expect(analysis.diagnostics).toHaveLength(0);

    const result = lower(parsed.ast, analysis.graph);
    expect(result.clientCode).toContain('claimHydrationElement(ctx.__vxRuntime.hydration');
    expect(result.clientCode).toContain('"span"');
    expect(result.clientCode).toContain('setWidgetProperty');
    expect(result.clientCode).not.toContain('innerHTML =');
  });

  it('lowers state reads and mutations through signal values', () => {
    const source = `
#script
  state count: Int = 0
  derive doubled: Int = count * 2

  action increment() {
    count++
  }
#end script

#view
  Text("Count: " + count)
  Text("Doubled: " + doubled)
  Button("Increment") {
    click => increment()
  }
#end view
`;
    const parsed = parse(source, 'counter.vx');
    expect(parsed.diagnostics).toHaveLength(0);
    const analysis = analyze(parsed.ast);
    expect(analysis.diagnostics).toHaveLength(0);

    const result = lower(parsed.ast, analysis.graph);
    expect(result.clientCode).toContain('const count = state((0))');
    expect(result.clientCode).toContain('count.value++');
    expect(result.clientCode).toContain('ctx.doubled.value');
    expect(result.clientCode).toContain('(ctx.increment())');
    expect(result.clientCode).not.toContain('ctxVar');
    expect(result.clientCode).not.toContain('ctx: any');
  });

  it('lowers server actions to named handlers and client RPC proxies', () => {
    const source = `
#script
  server action save(value: String): Any {
    await database.save(value)
  }

  action submit() {
    await save("saved")
  }
#end script

#view
  Button("Save") {
    click => submit()
  }
#end view
`;
    const parsed = parse(source, 'server-action.vx');
    expect(parsed.diagnostics).toHaveLength(0);
    const analysis = analyze(parsed.ast);
    expect(analysis.diagnostics).toHaveLength(0);

    const result = lower(parsed.ast, analysis.graph);
    expect(result.serverCode).toContain('registerServerAction({"id":"component:save"');
    expect(result.serverCode).toContain('await database.save(value);');
    expect(result.clientCode).toContain('createServerAction("component:save")');
  });

  it('lowers final if branches through structuralMount', () => {
    const source = `
#script
  state visible: Bool = true
#end script

#view
  if visible {
    Text("Shown")
  }
#end view
`;
    const parsed = parse(source, 'conditional.vx');
    expect(parsed.diagnostics).toHaveLength(0);
    const analysis = analyze(parsed.ast);
    expect(analysis.diagnostics).toHaveLength(0);

    const result = lower(parsed.ast, analysis.graph);
    expect(result.clientCode).toContain('structuralMount(');
    expect(result.clientCode).toContain('claimHydrationComment(ctx.__vxRuntime.hydration, "vx:if:');
  });

  it('lowers managed queries and visual roles through their final runtime contracts', () => {
    const query = parse(`#script
query products from Product.list { page: 1 }
#end script`, 'query.vx');
    const queryAnalysis = analyze(query.ast);
    expect(queryAnalysis.diagnostics).toHaveLength(0);
    const queryResult = lower(query.ast, queryAnalysis.graph, queryAnalysis.visual, queryAnalysis.data);
    expect(queryResult.clientCode).toContain('createQuery(__vxQueryClient');

    const role = parse(`#view
View @grid(min: 240) { Text("x") }
#end view`, 'role.vx');
    const roleAnalysis = analyze(role.ast);
    expect(roleAnalysis.diagnostics).toHaveLength(0);
    const roleResult = lower(role.ast, roleAnalysis.graph, roleAnalysis.visual, roleAnalysis.data);
    expect(roleResult.clientCode).toContain('attachVisualIntent(');
    expect(roleResult.clientCode).toContain('grid-template-columns');
  });

  it('lowers keyed collections, pattern bindings, transitions, and visual source maps', () => {
    const source = `
#script
  state products: List<Any> = []
  state result: Any = { status: "success", data: { label: "Ready" } }
#end script

#view
  for product, index in products keyed(product.id) {
    Text(product.name + index)
  } loading {
    Text("Loading")
  } empty {
    Text("Empty")
  } error problem {
    Text(problem.message)
  } transition("fade")

  when result {
    is Success(payload) { Text(payload.label) }
    else { Text("Unknown") }
  }
#end view
`;
    const parsed = parse(source, 'phase5-structures.vx');
    expect(parsed.diagnostics).toHaveLength(0);
    const analysis = analyze(parsed.ast);
    expect(analysis.diagnostics).toHaveLength(0);

    const result = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);
    expect(result.clientCode).toContain('collectionMount(');
    expect(result.clientCode).toContain('selectPatternBranch(');
    expect(result.clientCode).toContain('__vx_item_');
    expect(result.clientCode).toContain('markViewSource(');
    expect(result.viewSourceMap.some((entry) => entry.kind === 'collection')).toBe(true);
    expect(result.viewSourceMap.every((entry) => entry.generated.startLine > 0)).toBe(true);
  });

});

  it('lowers final component lifecycle, context, models, refs, dynamic components, and portals', () => {
    const source = `
#script
  model value: String = "" emits change
  inject theme: String = "light"
  prop target: Any
  prop selected: Any
  prop controlRef: Any
  forward attributes
  forward class
  forward style

  @mount
    value.value
  @end mount
#end script

#view
  View @forward {
    Text(theme)
    Input {
      ariaLabel: "Value"
      ref: controlRef
      value: value
    }
    Dynamic(selected) {
      value: value
    }
    Portal(target) {
      Text("Portal")
    }
  }
#end view
`;
    const parsed = parse(source, 'phase11-lowering.vx');
    expect(parsed.diagnostics).toHaveLength(0);
    const analysis = analyze(parsed.ast);
    expect(analysis.diagnostics).toHaveLength(0);
    const result = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);
    expect(result.clientCode).toContain('componentModel(');
    expect(result.clientCode).toContain('acquireComponentContext(');
    expect(result.clientCode).toContain('onComponentScopeMount(');
    expect(result.clientCode).toContain('assignComponentRef(');
    expect(result.clientCode).toContain('dynamicComponentMount(');
    expect(result.clientCode).toContain('portalMount(');
    expect(result.clientCode).toContain('applyForwardedBindings(');
  });

it('lowers VX string interpolation consistently for client and server output', () => {
  const source = `
#script
  state name = "VX"
#end script
#view
  Text("Hello {{ name }}!")
#end view
`;
  const parsed = parse(source, 'interpolation.vx');
  expect(parsed.diagnostics).toHaveLength(0);
  const analysis = analyze(parsed.ast);
  expect(analysis.diagnostics).toHaveLength(0);
  const result = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);
  expect(result.clientCode).toContain('"Hello " + String(ctx.name.value) + "!"');
  expect(result.serverCode).toContain('"Hello " + String(ctx.name) + "!"');
});
