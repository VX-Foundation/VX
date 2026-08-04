/**
 * Tests for the visual module system in the compiler:
 * - classifyModule correctly identifies visual modules
 * - extractComponentContract populates visualExports
 * - resolveVisualProgram resolves imported visual roles
 * - validateComponentModule enforces visual module contracts
 * - validateImportBindings accepts named imports from visual modules
 *   and rejects private/missing roles
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@vx-foundation/language';
import { analyze } from '../src/index.js';
import { extractComponentContract, classifyModule, findViewBlock } from '../src/components/contract.js';
import { resolveVisualProgram } from '../src/visual/resolver.js';
import { DiagnosticCollector } from '../src/analyze/diagnostics.js';

// ---------------------------------------------------------------------------
// classifyModule
// ---------------------------------------------------------------------------
describe('classifyModule', () => {
  it('classifies a file with only exported roles as visual', () => {
    const { ast } = parse(
      `#view\nexport @screen { flow: vertical }\n#end view`,
      'main.visual.vx'
    );
    const view = findViewBlock(ast);
    expect(classifyModule(ast, view)).toBe('visual');
  });

  it('classifies a file with widgets as component', () => {
    const { ast } = parse(
      `#view\n  View @page {}\n  @page { flow: vertical }\n#end view`,
      'page.vx'
    );
    const view = findViewBlock(ast);
    expect(classifyModule(ast, view)).toBe('component');
  });

  it('classifies a file with no #view as headless', () => {
    const { ast } = parse(
      `#script\n  export const version: String = "1.0"\n#end script`,
      'utils.vx'
    );
    const view = findViewBlock(ast);
    expect(classifyModule(ast, view)).toBe('headless');
  });

  it('classifies a file with #view but no exported roles as component', () => {
    const { ast } = parse(
      `#view\n  View @page {}\n  @page { flow: vertical }\n#end view`,
      'implicit.vx'
    );
    const view = findViewBlock(ast);
    expect(classifyModule(ast, view)).toBe('component');
  });

  it('classifies a file with mixed exported and non-exported roles as component (not fully exported)', () => {
    const { ast } = parse(
      `#view\n  View @local {}\nexport @shared { surface: raised }\n  @local { inset: md }\n#end view`,
      'mixed.vx'
    );
    const view = findViewBlock(ast);
    // Not all roles are exported, so treated as component
    expect(classifyModule(ast, view)).toBe('component');
  });
});

// ---------------------------------------------------------------------------
// extractComponentContract — visual module
// ---------------------------------------------------------------------------
describe('extractComponentContract — visual module', () => {
  it('populates visualExports for an all-exported visual module', () => {
    const { ast } = parse(
      `#view\nexport @screen { flow: vertical }\nexport @helperText { display: block }\n#end view`,
      'main.visual.vx'
    );
    const contract = extractComponentContract(ast);

    expect(contract.kind).toBe('visual');
    expect(contract.visualExports).toHaveLength(2);
    expect(contract.visualExports.map((e) => e.name)).toEqual(['screen', 'helperText']);
  });

  it('has empty visualExports for component modules', () => {
    const { ast } = parse(
      `#view\n  View @page {}\n  @page { flow: vertical }\n#end view`,
      'page.vx'
    );
    const contract = extractComponentContract(ast);

    expect(contract.kind).toBe('component');
    expect(contract.visualExports).toHaveLength(0);
  });

  it('has empty visualExports for headless modules', () => {
    const { ast } = parse(
      `#script\n  export const version: String = "1.0"\n#end script`,
      'utils.vx'
    );
    const contract = extractComponentContract(ast);

    expect(contract.kind).toBe('headless');
    expect(contract.visualExports).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// resolveVisualProgram — with importedVisualRoles
// ---------------------------------------------------------------------------
describe('resolveVisualProgram with importedVisualRoles', () => {
  it('resolves an imported role in the consuming component', () => {
    // Simulate what the visual module exports
    const { ast: visualAst } = parse(
      `#view\nexport @card { surface: raised inset: lg corner: md }\n#end view`,
      'cards.visual.vx'
    );
    const visualView = findViewBlock(visualAst);
    expect(visualView).toBeDefined();
    const exportedRole = visualView!.roles[0]!;

    // The consuming component uses @card imported from the visual module
    const { ast: consumerAst } = parse(
      `#view\n  View @card {}\n#end view`,
      'page.vx'
    );
    const consumerView = findViewBlock(consumerAst);
    expect(consumerView).toBeDefined();

    const diagnostics = new DiagnosticCollector();
    const importedRoles = new Map([[exportedRole.name, exportedRole]]);
    const graph = { nodes: new Map(), order: [] };

    const result = resolveVisualProgram(consumerView!, graph, diagnostics, undefined, importedRoles);

    expect(diagnostics.getDiagnostics().filter((d) => d.severity === 'error')).toHaveLength(0);
    // The @card role should have been resolved from the imported roles
    expect(result.roleNames).toContain('card');
  });

  it('local role in the consumer overrides the imported role', () => {
    const { ast: visualAst } = parse(
      `#view\nexport @card { surface: raised }\n#end view`,
      'cards.visual.vx'
    );
    const visualView = findViewBlock(visualAst);
    const exportedRole = visualView!.roles[0]!;

    const { ast: consumerAst } = parse(
      `#view\n  View @card {}\n  @card { surface: neutral inset: lg }\n#end view`,
      'page.vx'
    );
    const consumerView = findViewBlock(consumerAst);
    const diagnostics = new DiagnosticCollector();
    const importedRoles = new Map([[exportedRole.name, exportedRole]]);
    const graph = { nodes: new Map(), order: [] };

    const result = resolveVisualProgram(consumerView!, graph, diagnostics, undefined, importedRoles);

    expect(diagnostics.getDiagnostics().filter((d) => d.severity === 'error')).toHaveLength(0);
    // Local @card should win — 2 properties (surface + inset from local)
    const cardNode = result.nodes[0];
    expect(cardNode?.semantic?.sources.at(-1)).toBe('local:card');
  });

  it('emits VX_VISUAL_UNKNOWN_ROLE when using an unimported role', () => {
    const { ast: consumerAst } = parse(
      `#view\n  View @missing {}\n#end view`,
      'page.vx'
    );
    const consumerView = findViewBlock(consumerAst);
    const diagnostics = new DiagnosticCollector();
    const graph = { nodes: new Map(), order: [] };

    resolveVisualProgram(consumerView!, graph, diagnostics, undefined);

    const errors = diagnostics.getDiagnostics().filter((d) => d.code === 'VX_VISUAL_UNKNOWN_ROLE');
    expect(errors).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// analyze — importedVisualRoles integration
// ---------------------------------------------------------------------------
describe('analyze with importedVisualRoles', () => {
  it('resolves imported visual roles during analysis', () => {
    const { ast: visualAst } = parse(
      `#view\nexport @heroArea { flow: vertical space: xl }\n#end view`,
      'main.visual.vx'
    );
    const visualView = findViewBlock(visualAst);
    const exportedRole = visualView!.roles[0]!;

    const { ast } = parse(
      `#view\n  View @heroArea {}\n#end view`,
      'page.vx'
    );

    const importedVisualRoles = new Map([[exportedRole.name, exportedRole]]);
    const { diagnostics, visual } = analyze(ast, { importedVisualRoles });

    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    expect(visual?.roleNames).toContain('heroArea');
  });
});
