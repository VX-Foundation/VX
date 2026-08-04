/**
 * Tests for the visual module system:
 * - `export @role { ... }` syntax in the parser
 * - Rejection of `export @role` inside widget bodies
 * - `exported` flag on VisualRoleDeclarationNode
 */
import { test, expect } from 'vitest';
import { parse } from '../src/parser.js';

test('parses exported roles at the top level of #view', () => {
  const { ast, diagnostics } = parse(
    `#view
export @screen {
  flow: vertical
  minHeight: viewport
}
export @helperText {
  display: block
  width: fill
}
#end view`,
    'main.visual.vx'
  );

  expect(diagnostics).toHaveLength(0);

  const view = ast.blocks[0];
  expect(view?.kind).toBe('ViewBlock');
  if (view?.kind !== 'ViewBlock') return;

  expect(view.children).toHaveLength(0);
  expect(view.roles).toHaveLength(2);

  expect(view.roles[0]?.name).toBe('screen');
  expect(view.roles[0]?.exported).toBe(true);
  expect(view.roles[0]?.properties[0]?.name).toBe('flow');

  expect(view.roles[1]?.name).toBe('helperText');
  expect(view.roles[1]?.exported).toBe(true);
  expect(view.roles[1]?.properties[0]?.name).toBe('display');
});

test('non-exported roles have exported === undefined or false', () => {
  const { ast, diagnostics } = parse(
    `#view
  View @page {}
  @page { flow: vertical }
#end view`,
    'component.vx'
  );

  expect(diagnostics).toHaveLength(0);

  const view = ast.blocks[0];
  if (view?.kind !== 'ViewBlock') return;

  expect(view.roles[0]?.exported).toBeFalsy();
});

test('parses mix of exported and non-exported roles', () => {
  const { ast, diagnostics } = parse(
    `#view
  View @local {}
export @shared {
  surface: raised
}
  @local { inset: md }
#end view`,
    'mixed.vx'
  );

  expect(diagnostics).toHaveLength(0);

  const view = ast.blocks[0];
  if (view?.kind !== 'ViewBlock') return;

  expect(view.roles).toHaveLength(2);

  const shared = view.roles.find((r) => r.name === 'shared');
  expect(shared?.exported).toBe(true);

  const local = view.roles.find((r) => r.name === 'local');
  expect(local?.exported).toBeFalsy();
});

test('parses exported role with uses composition', () => {
  const { ast, diagnostics } = parse(
    `#view
export @card uses @base {
  inset: lg
  corner: md
}
export @base {
  surface: raised
}
#end view`,
    'composed.visual.vx'
  );

  expect(diagnostics).toHaveLength(0);

  const view = ast.blocks[0];
  if (view?.kind !== 'ViewBlock') return;

  const card = view.roles.find((r) => r.name === 'card');
  expect(card?.exported).toBe(true);
  expect(card?.uses).toEqual(['base']);
});

test('parses exported role with conditional states', () => {
  const { ast, diagnostics } = parse(
    `#view
export @button {
  surface: brand
  when hover { surface: brandHover }
  when disabled { opacity: 0.5 }
}
#end view`,
    'states.visual.vx'
  );

  expect(diagnostics).toHaveLength(0);

  const view = ast.blocks[0];
  if (view?.kind !== 'ViewBlock') return;

  const button = view.roles[0];
  expect(button?.exported).toBe(true);
  expect(button?.states).toHaveLength(2);
  expect(button?.states[0]?.condition.name).toBe('hover');
  expect(button?.states[1]?.condition.name).toBe('disabled');
});

test('rejects export @role inside a widget body', () => {
  const { diagnostics } = parse(
    `#view
  View {
    export @inner { color: red }
  }
#end view`,
    'invalid-inline-export.vx'
  );

  expect(diagnostics.some((d) => d.code === 'VX1220')).toBe(true);
});

test('rejects export keyword not followed by @role at top level', () => {
  const { diagnostics } = parse(
    `#view
  View @page {}
export something { color: red }
  @page { flow: vertical }
#end view`,
    'invalid-export-keyword.vx'
  );

  expect(diagnostics.some((d) => d.code === 'VX1219')).toBe(true);
});
