import assert from 'node:assert/strict';
import { parse } from '../packages/language/dist/index.js';
import { analyze, lower } from '../packages/compiler/dist/index.js';

const source = `#script
  state compact: Bool = false
#end script

#view
  View @grid(min: 240, gap: lg) @catalog {
    Title("Products") @title
    Button("Buy") @primary(width: fill)
  }

  @surfaceBase {
    surface: raised
    corner: lg
  }

  @catalog uses @surfaceBase, @card {
    inset: xl
    gap: compact ? sm : lg

    when hover {
      elevation: md
    }

    when viewport(max: md) {
      inset: md
    }

    when container(min: sm) {
      corner: xl
    }

    when motion(reduced) {
      transition: none
    }
  }
#end view`;

const parsed = parse(source, 'phase2-visual.vx');
assert.deepEqual(parsed.diagnostics, []);
const view = parsed.ast.blocks.find((block) => block.kind === 'ViewBlock');
assert.equal(view?.kind, 'ViewBlock');
assert.deepEqual(view.roles.find((role) => role.name === 'catalog')?.uses, ['surfaceBase', 'card']);
assert.equal(view.roles.find((role) => role.name === 'catalog')?.states[1]?.condition.name, 'viewport');
assert.equal(view.roles.find((role) => role.name === 'catalog')?.states[1]?.condition.arguments[0]?.name, 'max');

const analysis = analyze(parsed.ast);
assert.deepEqual(analysis.diagnostics, []);
assert(analysis.visual);
assert.equal(analysis.visual.nodes.length, 3);
assert.deepEqual(analysis.visual.roleNames, ['catalog', 'grid', 'primary', 'title']);
assert.match(analysis.visual.cssText, /grid-template-columns/);
assert.match(analysis.visual.cssText, /container-type: inline-size/);
assert.match(analysis.visual.cssText, /@media \(max-width: 48rem\)/);
assert.match(analysis.visual.cssText, /@container \(min-width: 40rem\)/);
assert.match(analysis.visual.cssText, /prefers-reduced-motion: reduce/);
assert.match(analysis.visual.cssText, /:hover/);
assert.doesNotMatch(analysis.visual.cssText, /\.primary\b|\.catalog\b/);

const lowered = lower(parsed.ast, analysis.graph, analysis.visual);
assert.match(lowered.clientCode, /installStyles/);
assert.match(lowered.clientCode, /attachVisualIntent/);
assert.match(lowered.clientCode, /applyVisualSemantics/);
assert.match(lowered.clientCode, /setVisualProperty/);
assert.match(lowered.clientCode, /ctx\.compact\.value \? "sm" : "lg"/);
assert.match(lowered.clientCode, /claimHydrationElement\([^\n]+"h1"\)/);

const designSystem = {
  name: 'Aster',
  tokens: {
    'brand.primary': '#7c3aed',
    'brand.onPrimary': '#ffffff'
  },
  modes: {
    dark: { 'brand.primary': '#a78bfa' }
  },
  breakpoints: { tablet: 900 },
  roles: {
    brandAction: {
      category: 'semantic',
      properties: {
        surface: 'theme.brand.primary',
        tone: 'theme.brand.onPrimary',
        corner: 'lg'
      },
      states: { hover: { elevation: 'sm' } },
      arguments: { width: 'width' }
    }
  }
};
const external = parse(`#view
  View @column @responsive {
    Button("Action") @brandAction(width: fill)
  }
  @responsive {
    when viewport(max: tablet) { inset: sm }
  }
#end view`, 'design-system.vx');
assert.deepEqual(external.diagnostics, []);
const externalAnalysis = analyze(external.ast, { designSystem });
assert.deepEqual(externalAnalysis.diagnostics, []);
assert.match(externalAnalysis.visual?.cssText ?? '', /--vx-theme-brand-primary: #7c3aed/);
assert.match(externalAnalysis.visual?.cssText ?? '', /prefers-color-scheme: dark/);
assert.match(externalAnalysis.visual?.cssText ?? '', /var\(--vx-theme-brand-primary\)/);
assert.match(externalAnalysis.visual?.cssText ?? '', /max-width: 900px/);

assertAnalyzeDiagnostic(`#view\n  View @missing {}\n#end view`, 'VX_VISUAL_UNKNOWN_ROLE');
assertAnalyzeDiagnostic(`#view\n  View @bad {}\n  @bad { madeUpProperty: lg }\n#end view`, 'VX_VISUAL_UNKNOWN_PROPERTY');
assertAnalyzeDiagnostic(`#view\n  Button("x") @primary(flavor: loud)\n#end view`, 'VX_VISUAL_UNKNOWN_ARGUMENT');
assertAnalyzeDiagnostic(`#view\n  View @a {}\n  @a uses @b {}\n  @b uses @a {}\n#end view`, 'VX_VISUAL_ROLE_CYCLE');
assertAnalyzeDiagnostic(`#view\n  Button("x") @grid\n#end view`, 'VX_VISUAL_LAYOUT_ON_LEAF');
assertAnalyzeDiagnostic(`#script\nstate active: Bool = false\n#end script\n#view\n  View @card {}\n  @card { when hover { opacity: active ? 1 : 0.5 } }\n#end view`, 'VX_VISUAL_DYNAMIC_STATE_PROPERTY');

console.log('VX Phase 2 compiler verification passed (Visual IR, roles, composition, states, queries, design system).');

function assertAnalyzeDiagnostic(sourceText, code) {
  const result = parse(sourceText, `${code}.vx`);
  assert.deepEqual(result.diagnostics, []);
  const diagnostics = analyze(result.ast).diagnostics;
  assert(
    diagnostics.some((diagnostic) => diagnostic.code === code),
    `expected ${code}, got ${diagnostics.map((diagnostic) => diagnostic.code).join(', ')}`
  );
}
