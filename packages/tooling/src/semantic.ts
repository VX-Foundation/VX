import type { SemanticTokenEntry, SemanticTokenType, VXDocumentSnapshot, VXSymbol } from './types.js';

const KEYWORDS = new Set(['import', 'export', 'schema', 'form', 'prop', 'state', 'const', 'derive', 'query', 'action', 'effect', 'store', 'output', 'content', 'part', 'generic', 'model', 'provide', 'inject', 'forward', 'if', 'when', 'for', 'as', 'from', 'policy']);

export function collectSemanticTokens(snapshot: VXDocumentSnapshot): SemanticTokenEntry[] {
  const tokens: SemanticTokenEntry[] = [];
  const occupied = new Set<string>();
  for (const symbol of snapshot.symbols) {
    const start = symbol.selectionSpan.start;
    const entry: SemanticTokenEntry = {
      line: start.line - 1,
      character: start.column - 1,
      length: Math.max(1, symbol.selectionSpan.end.offset - symbol.selectionSpan.start.offset),
      tokenType: tokenType(symbol),
      modifiers: symbol.exported ? ['declaration', 'definition'] : ['declaration']
    };
    tokens.push(entry);
    occupied.add(`${entry.line}:${entry.character}:${entry.length}`);
  }
  const pattern = /#[A-Za-z]+|\b[A-Za-z_][A-Za-z0-9_]*\b|\b\d+(?:\.\d+)?\b|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\/[^\n]*/g;
  for (const match of snapshot.source.matchAll(pattern)) {
    const text = match[0];
    const offset = match.index ?? 0;
    const position = offsetToPosition(snapshot.source, offset);
    const key = `${position.line}:${position.character}:${text.length}`;
    if (occupied.has(key)) continue;
    const type = classify(text);
    if (!type) continue;
    tokens.push({ ...position, length: text.length, tokenType: type, modifiers: [] });
  }
  return tokens.sort((left, right) => left.line - right.line || left.character - right.character || left.length - right.length);
}

function tokenType(symbol: VXSymbol): SemanticTokenType {
  if (symbol.kind === 'model' || symbol.kind === 'schema' || symbol.kind === 'generic') return 'type';
  if (symbol.kind === 'action' || symbol.kind === 'effect' || symbol.kind === 'query') return 'function';
  if (symbol.kind === 'part' || symbol.kind === 'role' || symbol.kind === 'field' || symbol.kind === 'prop') return 'property';
  if (symbol.kind === 'parameter') return 'parameter';
  if (symbol.kind === 'context' || symbol.kind === 'import') return 'namespace';
  return 'variable';
}
function classify(text: string): SemanticTokenType | undefined {
  if (text.startsWith('//')) return 'comment';
  if (text.startsWith('"') || text.startsWith("'")) return 'string';
  if (/^\d/.test(text)) return 'number';
  if (text.startsWith('#') || KEYWORDS.has(text)) return 'keyword';
  return undefined;
}
function offsetToPosition(source: string, offset: number): { line: number; character: number } {
  let line = 0; let character = 0;
  for (let index = 0; index < offset; index += 1) {
    if (source[index] === '\n') { line += 1; character = 0; } else character += 1;
  }
  return { line, character };
}
