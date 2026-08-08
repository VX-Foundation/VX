import { CompletionItemKind, DiagnosticSeverity, Position, Range, SymbolKind } from 'vscode-languageserver/node.js';
import type { CompletionItem, Diagnostic } from 'vscode-languageserver/node.js';
import type { CompletionEntry, SemanticTokenEntry, VXSymbol } from '@vx-foundation/tooling';

export const SEMANTIC_TOKEN_TYPES = ['keyword', 'type', 'class', 'function', 'variable', 'property', 'parameter', 'namespace', 'string', 'number', 'comment'] as const;
const SEMANTIC_TOKEN_MODIFIERS = ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'async'] as const;

export function encodeSemanticTokens(tokens: readonly (SemanticTokenEntry | { line: number; column?: number; character?: number; length: number; type?: string; tokenType?: string; modifiers: readonly string[] })[]): number[] {
  const normalized = tokens.map(t => ({
    line: t.line,
    character: 'character' in t && typeof t.character === 'number' ? t.character : ('column' in t && typeof t.column === 'number' ? t.column : 1),
    length: t.length,
    tokenType: ('tokenType' in t && t.tokenType ? t.tokenType : ('type' in t && t.type ? t.type : 'variable')) as SemanticTokenEntry['tokenType'],
    modifiers: t.modifiers || []
  }));
  const sorted = [...normalized].sort((left, right) => left.line - right.line || left.character - right.character);
  const data: number[] = [];
  let previousLine = 0;
  let previousColumn = 0;
  for (const token of sorted) {
    const line = Math.max(0, token.line - 1);
    const column = Math.max(0, token.character - 1);
    const deltaLine = line - previousLine;
    const deltaColumn = deltaLine === 0 ? column - previousColumn : column;
    const tokenTypeIndex = SEMANTIC_TOKEN_TYPES.indexOf(token.tokenType as typeof SEMANTIC_TOKEN_TYPES[number]);
    const tokenType = tokenTypeIndex >= 0 ? tokenTypeIndex : 0;
    data.push(deltaLine, deltaColumn, token.length, tokenType, modifierBits(token.modifiers));
    previousLine = line;
    previousColumn = column;
  }
  return data;
}

export function toLspDiagnostic(diagnostic: {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  suggestion?: string;
  span: { start: { line: number; column: number }; end: { line: number; column: number } };
}): Diagnostic {
  return {
    severity: diagnostic.severity === 'error'
      ? DiagnosticSeverity.Error
      : diagnostic.severity === 'warning'
        ? DiagnosticSeverity.Warning
        : DiagnosticSeverity.Information,
    code: diagnostic.code,
    source: 'vx',
    message: diagnostic.suggestion ? `${diagnostic.message}\nSuggestion: ${diagnostic.suggestion}` : diagnostic.message,
    range: toRange(diagnostic.span)
  };
}

export function toCompletionItem(entry: CompletionEntry): CompletionItem {
  const kind = entry.kind === 'keyword'
    ? CompletionItemKind.Keyword
    : entry.kind === 'widget'
      ? CompletionItemKind.Class
      : entry.kind === 'role'
        ? CompletionItemKind.Property
        : entry.kind === 'action'
          ? CompletionItemKind.Function
          : entry.kind === 'model'
            ? CompletionItemKind.Struct
            : entry.kind === 'generic'
              ? CompletionItemKind.TypeParameter
              : entry.kind === 'import'
                ? CompletionItemKind.Module
                : CompletionItemKind.Variable;
  return { label: entry.label, kind, detail: entry.detail, ...(entry.insertText ? { insertText: entry.insertText } : {}) };
}

export function toSymbolKind(symbol: VXSymbol): SymbolKind {
  if (symbol.kind === 'model' || symbol.kind === 'schema') return SymbolKind.Struct;
  if (symbol.kind === 'generic') return SymbolKind.TypeParameter;
  if (symbol.kind === 'import') return SymbolKind.Module;
  if (symbol.kind === 'action' || symbol.kind === 'effect' || symbol.kind === 'query') return SymbolKind.Function;
  if (symbol.kind === 'prop' || symbol.kind === 'parameter' || symbol.kind === 'field') return SymbolKind.Field;
  if (symbol.kind === 'context') return SymbolKind.Namespace;
  if (symbol.kind === 'role' || symbol.kind === 'part') return SymbolKind.Property;
  return SymbolKind.Variable;
}

export function toRange(span: { start: { line: number; column: number }; end: { line: number; column: number } }): Range {
  return Range.create(toPosition(span.start), toPosition(span.end));
}

export function toPosition(position: { line: number; column: number }): Position {
  return Position.create(Math.max(0, position.line - 1), Math.max(0, position.column - 1));
}



export function resolveWorkspaceRoot(params: { workspaceFolders?: { uri: string; name: string }[] | null; rootUri?: string | null }): string | undefined {
  if (params.workspaceFolders && params.workspaceFolders.length > 0) {
    const fileFolder = params.workspaceFolders.find(f => f.uri.startsWith('file://'));
    if (fileFolder) {
      return fileFolder.uri.replace(/^file:\/\//, '');
    }
    return undefined;
  }
  if (params.rootUri && params.rootUri.startsWith('file://')) {
    return params.rootUri.replace(/^file:\/\//, '');
  }
  return undefined;
}

function modifierBits(modifiers: readonly string[]): number {
  return modifiers.reduce((bits, modifier) => {
    const index = SEMANTIC_TOKEN_MODIFIERS.indexOf(modifier as typeof SEMANTIC_TOKEN_MODIFIERS[number]);
    return index >= 0 ? bits | (1 << index) : bits;
  }, 0);
}
