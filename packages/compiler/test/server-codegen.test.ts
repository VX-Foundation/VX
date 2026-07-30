import { describe, expect, it } from 'vitest';
import { parse } from '@vx/language';
import { analyze, lower } from '../src/index.js';

describe('server code generation', () => {
  it('emits executable SSR, hydration markers, and stable action contracts', () => {
    const parsed = parse(`#script
  prop title: String
  server action save(value: String): String { return value }
  state visible: Bool = true
#end script
#view
  View {
    Title(title)
    if visible { Text("Ready") } else { Text("Hidden") }
  }
#end view`, 'src/pages/index.vx');
    expect(parsed.diagnostics).toEqual([]);
    const analysis = analyze(parsed.ast);
    expect(analysis.diagnostics).toEqual([]);
    const output = lower(parsed.ast, analysis.graph, analysis.visual, analysis.data);
    expect(output.serverCode).toContain('export async function renderComponent');
    expect(output.serverCode).toContain('renderElement("h1"');
    expect(output.serverCode).toContain('renderComment("vx:if:');
    expect(output.serverCode).toContain('registerServerAction({"id":"component:save"');
    expect(output.clientCode).toContain('claimHydrationElement');
    expect(output.clientCode).toContain('claimHydrationComment');
  });
});
