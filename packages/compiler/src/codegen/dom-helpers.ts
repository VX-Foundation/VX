/** Shared client-codegen helpers kept separate from the DOM emitter orchestration. */
import type { ScriptBlockNode, ViewNode, ViewSourceMapEntry } from '@vx-foundation/types';
import type { ComponentCodegenContext } from '../components/codegen-context.js';
import { isRuntimeDeclaration } from './component-module.js';
import type { JavaScriptBinding } from './javascript.js';
import { PRIMITIVE_CALL_PROPERTIES, PRIMITIVE_NATIVE_ELEMENTS } from './primitive-metadata.generated.js';

export interface ComponentSymbols {
  signals: Set<string>;
  plain: Set<string>;
}

export type ViewBindings = Readonly<Record<string, JavaScriptBinding>>;

export function collectSymbols(
  scriptBlock: ScriptBlockNode | undefined,
  component: ComponentCodegenContext | undefined
): ComponentSymbols {
  const signals = new Set<string>();
  const plain = new Set<string>();
  if (component?.moduleKind === 'component') plain.add('Self');

  for (const statement of scriptBlock?.statements ?? []) {
    if (!statement.name || !isRuntimeDeclaration(statement)) continue;
    if (
      statement.side === 'client' &&
      (statement.kind === 'PropDeclaration' || statement.kind === 'ModelDeclarationNode' || statement.kind === 'ContextInjectDeclaration' || statement.kind === 'StateDeclaration' || statement.kind === 'DeriveDeclaration')
    ) {
      signals.add(statement.name);
    } else if ((statement.side === 'client' || statement.kind === 'ActionDeclaration') && statement.kind !== 'ContextProvideDeclaration') {
      plain.add(statement.name);
    }
  }

  for (const imported of component?.imports ?? []) {
    if (imported.moduleKind === 'component' && imported.imported === 'default') {
      plain.add(imported.local);
      continue;
    }
    if (imported.moduleKind !== 'headless' || imported.imported === 'default') continue;
    if (imported.exported?.kind === 'derive') signals.add(imported.local);
    else plain.add(imported.local);
  }

  return { signals, plain };
}

export function createSetupBindings(symbols: ComponentSymbols): Map<string, JavaScriptBinding> {
  const bindings = new Map<string, JavaScriptBinding>();
  for (const name of symbols.signals) bindings.set(name, { root: name, signal: true });
  for (const name of symbols.plain) bindings.set(name, { root: name });
  return bindings;
}

export function createViewBindings(symbols: ComponentSymbols, context: string): Map<string, JavaScriptBinding> {
  const bindings = new Map<string, JavaScriptBinding>();
  for (const name of symbols.signals) bindings.set(name, { root: context, path: [name], signal: true });
  for (const name of symbols.plain) bindings.set(name, { root: context, path: [name] });
  return bindings;
}

export function getPrimitiveTag(widgetName: string, semanticRole?: string): string {
  if (semanticRole === 'title') return 'h1';
  if (semanticRole === 'subtitle') return 'p';
  if (semanticRole === 'code') return 'code';
  return PRIMITIVE_NATIVE_ELEMENTS[widgetName] ?? 'div';
}

export function callProperty(widgetName: string): string {
  return PRIMITIVE_CALL_PROPERTIES[widgetName] ?? 'text';
}

export function sourceKind(node: ViewNode): ViewSourceMapEntry['kind'] {
  if (node.kind === 'Widget') return 'widget';
  if (node.kind === 'Text') return 'text';
  if (node.kind === 'IfBlock') return 'if';
  if (node.kind === 'WhenBlock') return 'when';
  return 'collection';
}

export function countLines(source: string): number {
  if (!source) return 0;
  return source.split('\n').length - (source.endsWith('\n') ? 1 : 0);
}

export function indent(source: string, spaces: number): string {
  if (!source.trim()) return `${' '.repeat(spaces)}// empty`;
  const prefix = ' '.repeat(spaces);
  return source.split('\n').map((line) => `${prefix}${line}`).join('\n');
}
