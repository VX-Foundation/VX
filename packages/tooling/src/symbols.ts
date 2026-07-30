import type {
  BaseNode,
  ProgramNode,
  ScriptStatement,
  SourcePosition,
  SourceSpan,
  ViewNode
} from '@vx/types';
import type { SymbolKind, SymbolReference, VXSymbol } from './types.js';

const RESERVED = new Set([
  'true', 'false', 'null', 'undefined', 'if', 'else', 'when', 'is', 'for', 'in', 'keyed',
  'loading', 'empty', 'error', 'content', 'part', 'policy', 'server', 'client', 'export',
  'return', 'await', 'new', 'typeof', 'instanceof', 'and', 'or', 'not',
  'generic', 'model', 'schema', 'form', 'provide', 'inject', 'forward', 'emits', 'attributes', 'events', 'class', 'style',
  'Dynamic', 'Portal', 'Self'
]);

export function collectSymbols(ast: ProgramNode, source: string): VXSymbol[] {
  const symbols: VXSymbol[] = [];
  for (const block of ast.blocks) {
    if (block.kind === 'ModelDeclaration') {
      symbols.push(symbolFor(block.name, 'model', block, source, undefined, ast.span));
      for (const field of block.fields) symbols.push(symbolFor(field.name, 'parameter', field, source, field.typeAnnotation.text, block.span));
      continue;
    }
    if (block.kind === 'ScriptBlock') {
      for (const statement of block.statements) symbols.push(...symbolsForStatement(statement, source, ast.span));
      continue;
    }
    if (block.kind === 'ViewBlock') {
      for (const role of block.roles) symbols.push(symbolFor(role.name, 'role', role, source, undefined, block.span));
      for (const child of block.children) collectViewBindings(child, source, symbols);
    }
  }
  return symbols.sort((left, right) => left.selectionSpan.start.offset - right.selectionSpan.start.offset);
}

export function collectReferences(ast: ProgramNode, source: string, symbols: readonly VXSymbol[]): SymbolReference[] {
  const byName = new Map<string, VXSymbol[]>();
  for (const symbol of symbols) {
    const bucket = byName.get(symbol.name) ?? [];
    bucket.push(symbol);
    byName.set(symbol.name, bucket);
  }

  const references: SymbolReference[] = [];
  for (const symbol of symbols) references.push({ name: symbol.name, span: symbol.selectionSpan, declaration: true, symbol });

  for (const occurrence of scanIdentifierOccurrences(source)) {
    const { name, offset } = occurrence;
    if (RESERVED.has(name)) continue;
    const existing = references.find((reference) => reference.declaration && reference.span.start.offset === offset);
    if (existing) continue;
    const candidates = byName.get(name);
    if (!candidates?.length) continue;
    const symbol = selectVisibleSymbol(candidates, offset);
    if (!symbol) continue;
    const start = offsetToPosition(source, offset);
    const end = offsetToPosition(source, offset + name.length);
    references.push({ name, declaration: false, symbol, span: { filePath: ast.filePath, start, end } });
  }

  return references.sort((left, right) => left.span.start.offset - right.span.start.offset);
}

export function wordAtOffset(source: string, offset: number): { word: string; start: number; end: number } | undefined {
  const safe = Math.max(0, Math.min(offset, source.length));
  let start = safe;
  let end = safe;
  while (start > 0 && /[A-Za-z0-9_]/.test(source[start - 1]!)) start -= 1;
  while (end < source.length && /[A-Za-z0-9_]/.test(source[end]!)) end += 1;
  if (start === end || !/[A-Za-z_]/.test(source[start]!)) return undefined;
  return { word: source.slice(start, end), start, end };
}

function symbolsForStatement(statement: ScriptStatement, source: string, rootScope: SourceSpan): VXSymbol[] {
  if (statement.kind === 'ImportDeclaration') {
    const output: VXSymbol[] = [];
    if (statement.defaultImport) output.push(symbolFor(statement.defaultImport, 'import', statement, source, statement.source, rootScope));
    for (const specifier of statement.specifiers) output.push(symbolFor(specifier.local, 'import', specifier, source, specifier.imported, rootScope));
    return output;
  }
  if (statement.kind === 'EffectDeclaration' || statement.kind === 'LifecycleDirective' || statement.kind === 'ForwardDeclaration') return [];
  if (statement.kind === 'SchemaDeclaration') {
    const schema = symbolFor(statement.name, 'schema', statement, source, undefined, rootScope);
    return [schema, ...statement.fields.map((field) => symbolFor(field.name, 'field', field, source, field.typeAnnotation.text, statement.span))];
  }
  const name = statement.name;
  if (!name) return [];
  const kind = statementKind(statement.kind);
  const detail = 'typeAnnotation' in statement && statement.typeAnnotation ? statement.typeAnnotation.text : undefined;
  const symbol = symbolFor(name, kind, statement, source, detail, rootScope);
  const output = [symbol];
  if (statement.kind === 'ActionDeclaration') {
    for (const parameter of statement.parameters) {
      output.push(symbolFor(parameter.name, 'parameter', parameter, source, parameter.typeAnnotation?.text, statement.span));
    }
  }
  return output;
}

function statementKind(kind: ScriptStatement['kind']): SymbolKind {
  const mapping: Partial<Record<ScriptStatement['kind'], SymbolKind>> = {
    PropDeclaration: 'prop', ConstDeclaration: 'const', StateDeclaration: 'state', DeriveDeclaration: 'derive',
    QueryDeclaration: 'query', ActionDeclaration: 'action', StoreDeclaration: 'store', OutputDeclaration: 'output',
    ContentDeclaration: 'content', VisualPartDeclaration: 'part', GenericDeclaration: 'generic',
    ModelDeclarationNode: 'model', SchemaDeclaration: 'schema', FormDeclaration: 'form', ContextProvideDeclaration: 'context', ContextInjectDeclaration: 'context',
    ImportDeclaration: 'import'
  };
  return mapping[kind] ?? 'binding';
}

function collectViewBindings(node: ViewNode, source: string, output: VXSymbol[]): void {
  if (node.kind === 'Widget') {
    for (const child of node.children) collectViewBindings(child, source, output);
    for (const region of node.contentRegions) for (const child of region.children) collectViewBindings(child, source, output);
    return;
  }
  if (node.kind === 'IfBlock') {
    for (const branch of node.branches) for (const child of branch.children) collectViewBindings(child, source, output);
    return;
  }
  if (node.kind === 'WhenBlock') {
    for (const branch of node.branches) {
      if (branch.pattern.binding) output.push(symbolFor(branch.pattern.binding, 'binding', branch.pattern, source, undefined, branch.span));
      for (const child of branch.children) collectViewBindings(child, source, output);
    }
    for (const child of node.fallback ?? []) collectViewBindings(child, source, output);
    return;
  }
  if (node.kind === 'KeyedCollection') {
    output.push(symbolFor(node.itemName, 'binding', node, source, undefined, node.span));
    if (node.indexName) output.push(symbolFor(node.indexName, 'binding', node, source, undefined, node.span));
    for (const child of node.children) collectViewBindings(child, source, output);
    for (const fallback of node.fallbacks) {
      if (fallback.binding) output.push(symbolFor(fallback.binding, 'binding', fallback, source, undefined, fallback.span));
      for (const child of fallback.children) collectViewBindings(child, source, output);
    }
  }
}

function symbolFor(
  name: string,
  kind: SymbolKind,
  node: BaseNode,
  source: string,
  detail?: string,
  scopeSpan?: SourceSpan
): VXSymbol {
  const selectionSpan = locateName(node.span, source, name);
  const base: VXSymbol = { name, kind, span: node.span, selectionSpan, ...(scopeSpan ? { scopeSpan } : {}) };
  if (detail !== undefined) base.detail = detail;
  if ('side' in node && (node.side === 'client' || node.side === 'server')) base.side = node.side;
  if ('visibility' in node && node.visibility === 'public') base.exported = true;
  return base;
}

function locateName(span: SourceSpan, source: string, name: string): SourceSpan {
  const slice = source.slice(span.start.offset, span.end.offset);
  const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`);
  const match = pattern.exec(slice);
  const offset = match ? span.start.offset + match.index : span.start.offset;
  return {
    filePath: span.filePath,
    start: offsetToPosition(source, offset),
    end: offsetToPosition(source, offset + name.length)
  };
}

function selectVisibleSymbol(candidates: readonly VXSymbol[], offset: number): VXSymbol | undefined {
  const visible = candidates.filter((candidate) => containsOffset(candidate.scopeSpan ?? candidate.span, offset));
  if (visible.length === 0) return undefined;
  return [...visible].sort((left, right) => {
    const scopeDifference = spanLength(left.scopeSpan ?? left.span) - spanLength(right.scopeSpan ?? right.span);
    if (scopeDifference !== 0) return scopeDifference;
    const leftBefore = left.selectionSpan.start.offset <= offset;
    const rightBefore = right.selectionSpan.start.offset <= offset;
    if (leftBefore !== rightBefore) return leftBefore ? -1 : 1;
    return Math.abs(offset - left.selectionSpan.start.offset) - Math.abs(offset - right.selectionSpan.start.offset);
  })[0];
}

function containsOffset(span: SourceSpan, offset: number): boolean {
  return span.start.offset <= offset && offset <= span.end.offset;
}

function spanLength(span: SourceSpan): number {
  return span.end.offset - span.start.offset;
}


interface IdentifierOccurrence {
  name: string;
  offset: number;
}

/** Scans code identifiers while excluding comments, strings, and regex bodies. */
function scanIdentifierOccurrences(source: string): IdentifierOccurrence[] {
  const output: IdentifierOccurrence[] = [];

  const scanCode = (start: number, stopAtTemplateBrace = false): number => {
    let index = start;
    let braceDepth = 0;
    while (index < source.length) {
      const character = source[index]!;
      const next = source[index + 1];
      if (stopAtTemplateBrace && character === '}' && braceDepth === 0) return index + 1;
      if (character === '/' && next === '/') {
        index += 2;
        while (index < source.length && source[index] !== '\n') index += 1;
        continue;
      }
      if (character === '/' && next === '*') {
        index += 2;
        while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
        index = Math.min(source.length, index + 2);
        continue;
      }
      if (character === '"' || character === "'") {
        index = skipQuoted(source, index, character);
        continue;
      }
      if (character === '`') {
        index = scanTemplate(source, index, scanCode);
        continue;
      }
      if (character === '/' && isRegexStart(source, index)) {
        index = skipRegex(source, index);
        continue;
      }
      if (/[A-Za-z_]/.test(character)) {
        const offset = index;
        index += 1;
        while (index < source.length && /[A-Za-z0-9_]/.test(source[index]!)) index += 1;
        output.push({ name: source.slice(offset, index), offset });
        continue;
      }
      if (character === '{') braceDepth += 1;
      else if (character === '}' && braceDepth > 0) braceDepth -= 1;
      index += 1;
    }
    return index;
  };

  scanCode(0);
  return output;
}

function skipQuoted(source: string, start: number, quote: '"' | "'"): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') { index += 2; continue; }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return index;
}

function scanTemplate(
  source: string,
  start: number,
  scanCode: (start: number, stopAtTemplateBrace?: boolean) => number
): number {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === '\\') { index += 2; continue; }
    if (source[index] === '`') return index + 1;
    if (source[index] === '$' && source[index + 1] === '{') {
      index = scanCode(index + 2, true);
      continue;
    }
    index += 1;
  }
  return index;
}

function skipRegex(source: string, start: number): number {
  let index = start + 1;
  let inClass = false;
  while (index < source.length) {
    const character = source[index]!;
    if (character === '\\') { index += 2; continue; }
    if (character === '[') inClass = true;
    else if (character === ']') inClass = false;
    else if (character === '/' && !inClass) {
      index += 1;
      while (index < source.length && /[A-Za-z]/.test(source[index]!)) index += 1;
      return index;
    }
    index += 1;
  }
  return index;
}

function isRegexStart(source: string, index: number): boolean {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1;
  const prefix = source.slice(lineStart, index).trimEnd();
  if (!prefix) return true;
  if (/\b(return|throw|case|await|yield)$/.test(prefix)) return true;
  return /[([{,:;=!?&|+*%<>-]$/.test(prefix);
}

export function offsetToPosition(source: string, offset: number): SourcePosition {
  const safe = Math.max(0, Math.min(offset, source.length));
  let line = 1;
  let column = 1;
  for (let index = 0; index < safe; index += 1) {
    if (source[index] === '\n') { line += 1; column = 1; }
    else column += 1;
  }
  return { line, column, offset: safe };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
