import { parse } from '@vx/language';
import type { ComponentContract, ScriptStatement } from '@vx/types';

export interface HMRSignature {
  componentId: string;
  moduleKind: string;
  generics: string[];
  props: string[];
  forwarding: string[];
  outputs: string[];
  content: string[];
  parts: string[];
  exports: string[];
  state: string[];
  models: string[];
  contexts: string[];
  schemas: string[];
  forms: string[];
  stores: string[];
  queries: string[];
}

export interface HMRCompatibility {
  compatible: boolean;
  preserveState: boolean;
  reasons: string[];
  previous: HMRSignature;
  next: HMRSignature;
}

export function createHMRSignature(source: string, contract: ComponentContract): HMRSignature {
  const parsed = parse(source, contract.filePath);
  const statements = parsed.ast.blocks.find((block) => block.kind === 'ScriptBlock')?.statements ?? [];
  return {
    componentId: contract.id,
    moduleKind: contract.kind,
    generics: contract.generics.map((item) => `${item.name}:${item.constraint ?? ''}`).sort(),
    props: contract.props.map((item) => `${item.name}:${item.type}:${item.required ? 'required' : 'optional'}:${item.side}`).sort(),
    forwarding: Object.entries(contract.forwarding).filter(([, enabled]) => enabled).map(([name]) => name).sort(),
    outputs: contract.outputs.map((item) => `${item.name}:${item.type}`).sort(),
    content: contract.content.map((item) => `${item.name}:${item.cardinality}`).sort(),
    parts: contract.parts.map((item) => `${item.name}:${item.partType}`).sort(),
    exports: contract.exports.map((item) => `${item.name}:${item.kind}:${item.type ?? ''}:${item.side}`).sort(),
    state: signatures(statements, 'StateDeclaration'),
    models: signatures(statements, 'ModelDeclarationNode'),
    contexts: [...signatures(statements, 'ContextProvideDeclaration'), ...signatures(statements, 'ContextInjectDeclaration')].sort(),
    schemas: signatures(statements, 'SchemaDeclaration'),
    forms: signatures(statements, 'FormDeclaration'),
    stores: signatures(statements, 'StoreDeclaration'),
    queries: signatures(statements, 'QueryDeclaration')
  };
}

export function compareHMRSignatures(previous: HMRSignature, next: HMRSignature): HMRCompatibility {
  const reasons: string[] = [];
  compareField('component identity', [previous.componentId], [next.componentId], reasons);
  compareField('module kind', [previous.moduleKind], [next.moduleKind], reasons);
  compareField('generic contract', previous.generics ?? [], next.generics ?? [], reasons);
  compareField('prop contract', previous.props, next.props, reasons);
  compareField('forwarding contract', previous.forwarding ?? [], next.forwarding ?? [], reasons);
  compareField('output contract', previous.outputs, next.outputs, reasons);
  compareField('content contract', previous.content, next.content, reasons);
  compareField('visual-part contract', previous.parts, next.parts, reasons);
  compareField('public export contract', previous.exports, next.exports, reasons);
  compareField('local state contract', previous.state, next.state, reasons);
  compareField('model contract', previous.models ?? [], next.models ?? [], reasons);
  compareField('context contract', previous.contexts ?? [], next.contexts ?? [], reasons);
  compareField('schema contract', previous.schemas ?? [], next.schemas ?? [], reasons);
  compareField('form contract', previous.forms ?? [], next.forms ?? [], reasons);
  compareField('store acquisition contract', previous.stores, next.stores, reasons);
  compareField('query contract', previous.queries, next.queries, reasons);
  return { compatible: reasons.length === 0, preserveState: reasons.length === 0, reasons, previous, next };
}

function signatures(statements: readonly ScriptStatement[], kind: ScriptStatement['kind']): string[] {
  return statements.filter((statement) => statement.kind === kind).map((statement) => {
    if (statement.kind === 'StateDeclaration') return `${statement.name}:${statement.typeAnnotation.text}`;
    if (statement.kind === 'ModelDeclarationNode') return `${statement.name}:${statement.typeAnnotation.text}:${statement.outputName}`;
    if (statement.kind === 'ContextProvideDeclaration') return `provide:${statement.name}:${statement.typeAnnotation.text}`;
    if (statement.kind === 'ContextInjectDeclaration') return `inject:${statement.name}:${statement.typeAnnotation.text}:${statement.fallback ? 'optional' : 'required'}`;
    if (statement.kind === 'SchemaDeclaration') return `${statement.name}:${statement.fields.map((field) => `${field.name}:${field.typeAnnotation.text}:${field.optional ? 'optional' : 'required'}:${field.rules.map((rule) => rule.name).join(',')}`).join('|')}`;
    if (statement.kind === 'FormDeclaration') return `${statement.name}:${statement.schemaName}:${statement.options.map((option) => `${option.name}:${option.expression.text}`).join('|')}`;
    if (statement.kind === 'StoreDeclaration') return `${statement.name}:${statement.from}:${statement.lifetime}:${statement.side}`;
    if (statement.kind === 'QueryDeclaration') return `${statement.name}:${statement.source.text}:${statement.side}`;
    return statement.kind;
  }).sort();
}

function compareField(label: string, previous: readonly string[], next: readonly string[], reasons: string[]): void {
  if (previous.length === next.length && previous.every((value, index) => value === next[index])) return;
  reasons.push(`The ${label} changed.`);
}
