import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from 'vitest';
import { parse } from '../src/parser.js';

test('parses the canonical VX fixture without errors', () => {
  const filePath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'canonical.vx');
  const source = readFileSync(filePath, 'utf-8');

  const { ast, diagnostics } = parse(source, filePath);

  expect(diagnostics).toHaveLength(0);
  expect(ast.blocks).toHaveLength(3); // Model, Script, View

  const scriptBlock = ast.blocks[1];
  expect(scriptBlock?.kind).toBe('ScriptBlock');
  if (scriptBlock?.kind === 'ScriptBlock') {
    expect(scriptBlock.statements.map((statement) => statement.kind)).toEqual([
      'PropDeclaration',
      'ConstDeclaration',
      'StateDeclaration',
      'QueryDeclaration',
      'DeriveDeclaration',
      'ActionDeclaration',
      'EffectDeclaration'
    ]);
  }

  const viewBlock = ast.blocks[2];
  expect(viewBlock?.kind).toBe('ViewBlock');
  if (viewBlock?.kind === 'ViewBlock') {
    expect(viewBlock.children).toHaveLength(1);
    expect(viewBlock.roles.map((role) => role.name)).toEqual(['page', 'product']);

    const root = viewBlock.children[0];
    expect(root?.kind).toBe('Widget');
    if (root?.kind === 'Widget') {
      expect(root.tagName).toBe('View');
      expect(root.roles.map((role) => role.name)).toEqual(['page']);
    }

    expect(viewBlock.roles[1]?.states[0]?.condition.name).toBe('hover');
  }
});

test('rejects superseded top-level blocks', () => {
  const { diagnostics } = parse('#style\n  Button {}\n#end style', 'legacy.vx');
  expect(diagnostics.some((diagnostic) => diagnostic.code === 'VX1006')).toBe(true);
});

test('parses an empty widget call without creating a blank argument', () => {
  const { ast, diagnostics } = parse(`#view\n  ProductCard()\n#end view`, 'empty-call.vx');
  expect(diagnostics).toHaveLength(0);

  const view = ast.blocks[0];
  expect(view?.kind).toBe('ViewBlock');
  if (view?.kind === 'ViewBlock') {
    const widget = view.children[0];
    expect(widget?.kind).toBe('Widget');
    if (widget?.kind === 'Widget') {
      expect(widget.tagName).toBe('ProductCard');
      expect(widget.isCall).toBe(true);
      expect(widget.callArgument).toBeUndefined();
    }
  }
});


test('parses visual role composition and environment conditions', () => {
  const { ast, diagnostics } = parse(`#view
  View @grid(min: 240, gap: lg) @catalog {}

  @catalog uses @surfaceBase, @card {
    inset: xl
    when viewport(max: md) { inset: md }
    when container(min: sm) { corner: lg }
  }

  @surfaceBase { surface: raised }
#end view`, 'visual-roles.vx');

  expect(diagnostics).toHaveLength(0);
  const view = ast.blocks[0];
  expect(view?.kind).toBe('ViewBlock');
  if (view?.kind === 'ViewBlock') {
    const catalog = view.roles.find((role) => role.name === 'catalog');
    expect(catalog?.uses).toEqual(['surfaceBase', 'card']);
    expect(catalog?.states.map((state) => state.condition.name)).toEqual(['viewport', 'container']);
    expect(catalog?.states[0]?.condition.arguments[0]?.name).toBe('max');
    expect(catalog?.states[0]?.condition.arguments[0]?.expression.text).toBe('md');
  }
});


test('parses final Phase 5 view control flow and keyed collections', () => {
  const { ast, diagnostics } = parse(`#view
  if ready { Text("Ready") } else if pending { Text("Pending") } else { Text("Idle") } transition("fade")

  when result {
    is Success(value) { Text(value.label) }
    is "empty" { Text("Empty") }
    else { Text("Unknown") }
  }

  for item, index in items keyed(item.id) {
    Text(item.name + index)
  } loading { Text("Loading") } empty { Text("Empty") } error problem { Text(problem.message) }
#end view`, 'phase5.vx');

  expect(diagnostics).toHaveLength(0);
  const view = ast.blocks[0];
  expect(view?.kind).toBe('ViewBlock');
  if (view?.kind !== 'ViewBlock') return;

  const conditional = view.children[0];
  expect(conditional?.kind).toBe('IfBlock');
  if (conditional?.kind === 'IfBlock') {
    expect(conditional.branches).toHaveLength(3);
    expect(conditional.transition?.expression.text).toBe('"fade"');
  }

  const matching = view.children[1];
  expect(matching?.kind).toBe('WhenBlock');
  if (matching?.kind === 'WhenBlock') {
    expect(matching.branches[0]?.pattern.binding).toBe('value');
    expect(matching.fallback).toHaveLength(1);
  }

  const collection = view.children[2];
  expect(collection?.kind).toBe('KeyedCollection');
  if (collection?.kind === 'KeyedCollection') {
    expect(collection.itemName).toBe('item');
    expect(collection.indexName).toBe('index');
    expect(collection.key.text).toBe('item.id');
    expect(collection.fallbacks.map((branch) => branch.branch)).toEqual(['loading', 'empty', 'error']);
    expect(collection.fallbacks[2]?.binding).toBe('problem');
  }
});

test('diagnoses duplicate and unreachable match branches', () => {
  const { diagnostics } = parse(`#view
  when value {
    is _ { Text("Any") }
    is String { Text("Never") }
    is String { Text("Duplicate") }
  }
#end view`, 'invalid-match.vx');

  expect(diagnostics.some((diagnostic) => diagnostic.code === 'VX1217')).toBe(true);
  expect(diagnostics.some((diagnostic) => diagnostic.code === 'VX1216')).toBe(true);
});

test('diagnoses fallback ordering and canonical duplicate patterns', () => {
  const { diagnostics } = parse(`#view
  when value {
    is Success(first) { Text(first) }
    is Success(second) { Text(second) }
    else { Text("Fallback") }
    is Error(problem) { Text(problem.message) }
  }

  when other {
    is _ { Text("Any") }
    else { Text("Never") }
  }
#end view`, 'invalid-match-order.vx');

  expect(diagnostics.filter((diagnostic) => diagnostic.code === 'VX1216')).toHaveLength(1);
  expect(diagnostics.filter((diagnostic) => diagnostic.code === 'VX1217')).toHaveLength(2);
});

test('requires an is branch in a when structure', () => {
  const { diagnostics } = parse(`#view
  when value {
    else { Text("Always") }
  }
#end view`, 'fallback-only-match.vx');

  expect(diagnostics.some((diagnostic) => diagnostic.code === 'VX1213')).toBe(true);
});

test('parses the final Phase 11 component contract', () => {
  const { ast, diagnostics } = parse(`#script
  generic Item: String
  prop item: Item
  model value: String = "" emits change
  provide theme: String = "dark"
  inject locale: String = "en"
  forward attributes
  forward events
  forward class
  forward style
  content default: optional
#end script

#view
  View @forward {
    Content(default)
  }
#end view`, 'phase11-component.vx');

  expect(diagnostics).toHaveLength(0);
  const script = ast.blocks.find((block) => block.kind === 'ScriptBlock');
  expect(script?.kind).toBe('ScriptBlock');
  if (script?.kind !== 'ScriptBlock') return;
  expect(script.statements.map((statement) => statement.kind)).toEqual([
    'GenericDeclaration',
    'PropDeclaration',
    'ModelDeclarationNode',
    'ContextProvideDeclaration',
    'ContextInjectDeclaration',
    'ForwardDeclaration',
    'ForwardDeclaration',
    'ForwardDeclaration',
    'ForwardDeclaration',
    'ContentDeclaration'
  ]);
  const model = script.statements[2];
  expect(model?.kind).toBe('ModelDeclarationNode');
  if (model?.kind === 'ModelDeclarationNode') expect(model.outputName).toBe('change');
  const view = ast.blocks.find((block) => block.kind === 'ViewBlock');
  if (view?.kind === 'ViewBlock' && view.children[0]?.kind === 'Widget') {
    expect(view.children[0].forwardTarget).toBe(true);
  }
});
