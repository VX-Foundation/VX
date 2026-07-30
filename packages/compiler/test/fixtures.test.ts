import { describe, it, expect } from 'vitest';
import { parse } from '@vx/language';
import { analyze } from '../src/index.js';

describe('Compiler Analyze Pass', () => {

  it('builds a reactive graph for a valid component', () => {
    const code = `
#script
  state count = 0
  derive isHigh = count > 5
  action increment() {
    count++
  }
#end script

#view
  Button {
    click => increment()
    Text("{{ count }}")
  }
  if isHigh {
    Text("123")
  }
#end view
    `;
    const { ast } = parse(code, 'test.vx');
    const { graph, diagnostics } = analyze(ast);
    console.log("DIAGNOSTICS:", diagnostics);

    expect(diagnostics.length).toBe(0);
    expect(graph.nodes.has('count')).toBe(true);
    expect(graph.nodes.has('isHigh')).toBe(true);
    expect(graph.nodes.has('increment')).toBe(true);
    
    const isHighNode = graph.nodes.get('isHigh')!;
    expect(isHighNode.dependencies.has('count')).toBe(true);
  });

  it('detects cyclical dependencies', () => {
    const code = `
#script
  derive a = b + 1
  derive b = a + 1
#end script
    `;
    const { ast } = parse(code, 'test.vx');
    const { diagnostics } = analyze(ast);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toBe('VX_CYCLE_DETECTED');
  });

  it('prevents leaking process.env into client code', () => {
    const code = `
#script
  state secret = process.env.API_KEY
#end script
    `;
    const { ast } = parse(code, 'test.vx');
    const { diagnostics } = analyze(ast);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toBe('VX_ENV_LEAK');
  });

  it('allows process.env in server-marked declarations', () => {
    const code = `
#script
  server action getSecret(): String {
    return process.env.API_KEY
  }
#end script
    `;
    const { ast } = parse(code, 'test.vx');
    const { diagnostics } = analyze(ast);

    expect(diagnostics.length).toBe(0);
  });

  it('prevents client logic from synchronously depending on server implementations', () => {
    const code = `
#script
  server state dbHost = "localhost"
  derive connectString = dbHost + ":5432"
#end script
    `;
    const { ast } = parse(code, 'test.vx');
    const { diagnostics } = analyze(ast);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toBe('VX_CROSS_PARTITION_LEAK');
  });

  it('validates view interpolation expressions', () => {
    const code = `
#script
  state name = "VX"
#end script

#view
  Text("{{ name }}")
  Text("{{ age }}")
#end view
    `;
    const { ast } = parse(code, 'test.vx');
    const { diagnostics } = analyze(ast);

    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics[0]!.code).toBe('VX_UNDECLARED_VARIABLE');
    expect(diagnostics[0]!.message).toContain("Cannot find name 'age'");
  });
});
