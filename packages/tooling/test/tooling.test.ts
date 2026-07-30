import { describe, expect, it } from 'vitest';
import { compareHMRSignatures, createComponentHarness, formatVX, inspectVX, migrateVXSource, VXLanguageService } from '../src/index.js';

const component = `#script
state count:Int=0
derive doubled:Int=count*2
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

describe('Phase 8 tooling', () => {
  it('formats idempotently without changing string content', () => {
    const first = formatVX(component, '/Counter.vx');
    expect(first.code).toContain('Text("Count: " + count)');
    expect(formatVX(first.code, '/Counter.vx').changed).toBe(false);

    const literals = formatVX(`#script
const sample:String="a:b,c=>d" // keep:x,y
const matcher:Any=/a:b,c=>d\\/[x]/gi
#end script
`, '/Literals.vx');
    expect(literals.code).toContain('const sample: String = "a:b,c=>d" // keep:x,y');
    expect(literals.code).toContain('const matcher: Any = /a:b,c=>d\\/[x]/gi');
  });

  it('provides definitions, references, rename, and source actions', () => {
    const formatted = formatVX(component, '/Counter.vx').code;
    const service = new VXLanguageService();
    service.open('/Counter.vx', formatted, 1);
    const offset = formatted.indexOf('count++');
    expect(service.definition('/Counter.vx', offset)?.kind).toBe('state');
    expect(service.references('/Counter.vx', offset).length).toBeGreaterThan(1);
    expect(service.rename('/Counter.vx', offset, 'total')).toHaveLength(service.references('/Counter.vx', offset).length);

    const scoped = formatVX(`#script
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
    service.open('/Scoped.vx', scoped, 1);
    const parameterUse = scoped.indexOf('return value') + 'return '.length;
    const stateUse = scoped.lastIndexOf('value)');
    expect(service.definition('/Scoped.vx', parameterUse)?.kind).toBe('parameter');
    expect(service.definition('/Scoped.vx', stateUse)?.kind).toBe('state');
    expect(service.definition('/Scoped.vx', scoped.indexOf('"value"') + 2)).toBeUndefined();
    expect(service.references('/Scoped.vx', stateUse)).toHaveLength(2);

    service.open('/Broken.vx', '#script\nstate count: Int = 0\n', 1);
    expect(service.codeActions('/Broken.vx').some((action) => action.title === "Insert '#end script'")).toBe(true);
  });

  it('exposes compiler inspection and harness output', () => {
    const formatted = formatVX(component, '/Counter.vx').code;
    const inspection = inspectVX(formatted, '/Counter.vx', true);
    expect(inspection.reactiveGraph.map((node) => node.name)).toContain('count');
    expect(inspection.generated?.client).toContain('mountApp');
    const harness = createComponentHarness(formatted, '/Counter.vx');
    expect(() => harness.assertValid()).not.toThrow();
  });

  it('rejects HMR state-contract changes', () => {
    const previous = { componentId: 'counter', moduleKind: 'component', generics: [], props: [], forwarding: [], outputs: [], content: [], parts: [], exports: [], state: ['count:Int'], models: [], contexts: [], stores: [], queries: [], schemas: [], forms: [] };
    const next = { ...previous, state: ['count:String'] };
    expect(compareHMRSignatures(previous, next).compatible).toBe(false);
  });

  it('understands final component-model symbols and completions', () => {
    const source = formatVX(`#script
generic T: String
model value: T = "initial" emits change
provide theme: String = "dark"
inject locale: String = "en"
forward attributes
forward events
#end script
#view
View @forward {
Dynamic(component: Self)
Portal(target: document.body) {
Text(value)
}
}
#end view
`, '/ComponentModel.vx').code;
    const service = new VXLanguageService();
    const snapshot = service.open('/ComponentModel.vx', source, 1);
    expect(snapshot.symbols.some((symbol) => symbol.name === 'T' && symbol.kind === 'generic')).toBe(true);
    expect(snapshot.symbols.some((symbol) => symbol.name === 'value' && symbol.kind === 'model')).toBe(true);
    expect(snapshot.symbols.some((symbol) => symbol.name === 'theme' && symbol.kind === 'context')).toBe(true);
    expect(snapshot.symbols.some((symbol) => symbol.name === 'locale' && symbol.kind === 'context')).toBe(true);
    const labels = service.completions('/ComponentModel.vx', source.length).map((entry) => entry.label);
    expect(labels).toEqual(expect.arrayContaining(['generic', 'model', 'provide', 'inject', 'forward', 'Dynamic', 'Portal', 'Self']));
    const atOffset = source.indexOf('@forward') + 1;
    expect(service.completions('/ComponentModel.vx', atOffset).map((entry) => entry.label))
      .toEqual(expect.arrayContaining(['forward', 'mount', 'update', 'unmount']));
  });

  it('migrates deterministic regions and reports manual style work', () => {
    expect(migrateVXSource('#state\nstate count: Int = 0\n#end state\n').code).toContain('#script');
    const merged = migrateVXSource('#state\nstate count: Int = 0\n#end state\n#logic\naction increment() { count++ }\n#end logic\n');
    expect(merged.code.match(/#script/g)).toHaveLength(1);
    expect(merged.code).toContain('action increment()');
    expect(migrateVXSource('#style\n.card {}\n#end style\n').manual).not.toHaveLength(0);
  });
});
