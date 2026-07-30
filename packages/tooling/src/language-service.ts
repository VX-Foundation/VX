import { analyze } from '@vx/compiler/core';
import { DiagnosticCodes, parse } from '@vx/language';
import type { Diagnostic, SourceSpan } from '@vx/types';
import { formatVX } from './formatter.js';
import { collectReferences, collectSymbols, wordAtOffset } from './symbols.js';
import { collectSemanticTokens } from './semantic.js';
import { createCallHierarchy, createTypeHierarchy } from './hierarchy.js';
import type { CallHierarchyNode, CodeAction, CompletionEntry, InlayHintEntry, SemanticTokenEntry, SymbolReference, TextEdit, TypeHierarchyNode, VXDocumentSnapshot, VXSymbol } from './types.js';

const KEYWORDS: CompletionEntry[] = [
  ['#script', 'VX behavior and contract region'], ['#view', 'VX declarative view region'],
  ['import', 'Static component or module import'], ['export', 'Public headless declaration'],
  ['schema', 'Shared client/server validation contract'], ['form', 'Typed form controller and submission contract'],
  ['prop', 'Typed component input'], ['state', 'Local reactive source'], ['const', 'Immutable value'],
  ['derive', 'Pure reactive computation'], ['query', 'Managed external read'], ['action', 'Mutation boundary'],
  ['effect', 'External synchronization boundary'], ['store', 'Shared state acquisition'],
  ['output', 'Typed component event'], ['content', 'Named projected content'], ['part', 'Public visual part'],
  ['generic', 'Component type parameter'], ['model', 'Controlled or uncontrolled component value'],
  ['provide', 'Typed context provider'], ['inject', 'Typed context consumer'],
  ['forward', 'Declare a forwarded component capability'],
  ['if', 'Conditional visual branch'], ['when', 'Pattern matching visual branch'], ['for', 'Keyed visual collection']
].map(([label, detail]) => ({ label: label!, kind: 'keyword', detail: detail! }));


const DATA_POLICY_COMPLETIONS: CompletionEntry[] = [
  ['stale', 'Duration before cached query data becomes stale'],
  ['retain', 'Duration to retain an unobserved query'],
  ['retry', 'Maximum retry count'],
  ['retryDelay', 'Base retry delay'],
  ['backoff', 'Fixed or exponential retry backoff'],
  ['execute', 'Universal, client, or server execution'],
  ['network', 'Online, always, or offlineFirst network policy'],
  ['deduplicate', 'Share equal in-flight query work'],
  ['refreshOnFocus', 'Revalidate when the document regains focus'],
  ['refreshOnReconnect', 'Revalidate when connectivity returns'],
  ['refreshInterval', 'Polling interval'],
  ['structuralSharing', 'Preserve equal nested data identity'],
  ['persist', 'Opt in to durable cache persistence'],
  ['tags', 'Static cache invalidation tags'],
  ['enabled', 'Reactive query activation expression']
].map(([label, detail]) => ({ label: label!, kind: 'keyword', detail: detail! }));

const WIDGETS = ['View', 'Text', 'Title', 'Button', 'Input', 'Image', 'Link', 'List', 'Form', 'Content', 'Dynamic', 'Portal', 'Self']
  .map((label): CompletionEntry => ({ label, kind: 'widget', detail: `VX ${label} visual primitive` }));

export class VXLanguageService {
  readonly #documents = new Map<string, InternalDocument>();

  open(uri: string, source: string, version = 1): VXDocumentSnapshot {
    return this.update(uri, source, version);
  }

  update(uri: string, source: string, version: number, signal?: AbortSignal): VXDocumentSnapshot {
    if (signal?.aborted) throw signal.reason ?? new Error('VX analysis was cancelled.');
    const existing = this.#documents.get(uri);
    if (existing?.source === source && existing.version === version) return snapshot(existing);
    const parsed = parse(source, uri);
    if (signal?.aborted) throw signal.reason ?? new Error('VX analysis was cancelled.');
    const analysis = analyze(parsed.ast);
    const symbols = collectSymbols(parsed.ast, source);
    const document: InternalDocument = {
      uri, source, version, ast: parsed.ast, diagnostics: [...parsed.diagnostics, ...analysis.diagnostics], symbols,
      references: collectReferences(parsed.ast, source, symbols)
    };
    this.#documents.set(uri, document);
    return snapshot(document);
  }

  close(uri: string): void { this.#documents.delete(uri); }
  get(uri: string): VXDocumentSnapshot | undefined {
    const document = this.#documents.get(uri);
    return document ? snapshot(document) : undefined;
  }

  completions(uri: string, offset: number): CompletionEntry[] {
    const document = this.require(uri);
    const before = document.source.slice(Math.max(0, offset - 2), offset);
    const local = document.symbols.map((symbol): CompletionEntry => ({
      label: symbol.name,
      kind: symbol.kind,
      detail: symbol.detail ? `${symbol.kind} ${symbol.detail}` : `VX ${symbol.kind}`
    }));
    if (before.endsWith('@')) return roleCompletions(document);
    if (isInsideQueryPolicy(document.source, offset)) return dedupeCompletions([...local, ...DATA_POLICY_COMPLETIONS]);
    return dedupeCompletions([...local, ...KEYWORDS, ...WIDGETS]);
  }

  definition(uri: string, offset: number): VXSymbol | undefined {
    const document = this.require(uri);
    const word = wordAtOffset(document.source, offset);
    if (!word) return undefined;
    const reference = document.references.find((item) => item.span.start.offset <= offset && item.span.end.offset > offset && item.name === word.word);
    return reference?.symbol;
  }

  references(uri: string, offset: number, includeDeclaration = true): SymbolReference[] {
    const document = this.require(uri);
    const definition = this.definition(uri, offset);
    if (!definition) return [];
    return document.references.filter((reference) => reference.symbol === definition && (includeDeclaration || !reference.declaration));
  }

  rename(uri: string, offset: number, newName: string): TextEdit[] {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) throw new Error(`'${newName}' is not a valid VX identifier.`);
    const document = this.require(uri);
    const definition = this.definition(uri, offset);
    if (!definition) return [];
    if (document.symbols.some((symbol) => symbol.name === newName && symbol !== definition && scopesOverlap(symbol, definition))) {
      throw new Error(`Cannot rename '${definition.name}' to '${newName}' because that name is already declared.`);
    }
    return this.references(uri, offset, true).map((reference) => ({ span: reference.span, newText: newName }));
  }

  codeActions(uri: string): CodeAction[] {
    const document = this.require(uri);
    const actions: CodeAction[] = [];
    const formatted = formatVX(document.source, uri);
    if (formatted.changed && !formatted.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
      actions.push({
        title: 'Format VX document', kind: 'source', edits: [{ span: wholeDocumentSpan(uri, document.source), newText: formatted.code }]
      });
    }
    for (const diagnostic of document.diagnostics) {
      const edit = quickFixForDiagnostic(diagnostic, document.source);
      if (edit) actions.push({ title: edit.title, kind: 'quickfix', diagnostics: [diagnostic.code], edits: [edit.edit] });
    }
    return actions;
  }

  diagnostics(uri: string): Diagnostic[] { return [...this.require(uri).diagnostics]; }

  semanticTokens(uri: string): SemanticTokenEntry[] { return collectSemanticTokens(snapshot(this.require(uri))); }

  inlayHints(uri: string): InlayHintEntry[] {
    return this.require(uri).symbols.flatMap((symbol) => {
      if (!symbol.detail || symbol.kind === 'import' || symbol.kind === 'role' || symbol.kind === 'part') return [];
      return [{ position: symbol.selectionSpan.end, label: `: ${symbol.detail}`, kind: 'type' as const, tooltip: `Inferred VX ${symbol.kind} type` }];
    });
  }

  workspaceSymbols(query = '', limit = 500): Array<{ uri: string; symbol: VXSymbol }> {
    const normalized = query.trim().toLowerCase();
    const matches: Array<{ uri: string; symbol: VXSymbol }> = [];
    for (const document of this.#documents.values()) {
      for (const symbol of document.symbols) {
        if (!normalized || symbol.name.toLowerCase().includes(normalized) || symbol.kind.includes(normalized)) matches.push({ uri: document.uri, symbol });
        if (matches.length >= limit) return matches;
      }
    }
    return matches.sort((left, right) => left.symbol.name.localeCompare(right.symbol.name));
  }

  callHierarchy(uri: string, offset: number): CallHierarchyNode | undefined {
    const symbol = this.definition(uri, offset);
    return symbol ? createCallHierarchy(uri, symbol, [...this.#documents.values()]) : undefined;
  }

  typeHierarchy(uri: string, offset: number): TypeHierarchyNode | undefined {
    const symbol = this.definition(uri, offset);
    return symbol ? createTypeHierarchy(uri, symbol, [...this.#documents.values()]) : undefined;
  }

  documentUris(): string[] { return [...this.#documents.keys()]; }

  private require(uri: string): InternalDocument {
    const document = this.#documents.get(uri);
    if (!document) throw new Error(`VX document '${uri}' is not open.`);
    return document;
  }
}

interface InternalDocument extends VXDocumentSnapshot {
  ast: ReturnType<typeof parse>['ast'];
  references: SymbolReference[];
}

function snapshot(document: InternalDocument): VXDocumentSnapshot {
  return { uri: document.uri, source: document.source, version: document.version, diagnostics: [...document.diagnostics], symbols: [...document.symbols] };
}

function isInsideQueryPolicy(source: string, offset: number): boolean {
  const prefix = source.slice(0, Math.max(0, Math.min(offset, source.length)));
  const match = /\bpolicy\s*\{/g;
  let start = -1;
  for (const candidate of prefix.matchAll(match)) start = candidate.index ?? start;
  if (start < 0) return false;
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  for (let index = start; index < prefix.length; index += 1) {
    const character = prefix[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'" || character === '`') { quote = character; continue; }
    if (character === '{') depth += 1;
    else if (character === '}') depth -= 1;
  }
  return depth > 0;
}

function roleCompletions(document: InternalDocument): CompletionEntry[] {
  const componentDirectives: CompletionEntry[] = [
    { label: 'forward', kind: 'keyword', detail: 'Select the native forwarding target' },
    { label: 'mount', kind: 'keyword', detail: 'Component mount lifecycle' },
    { label: 'update', kind: 'keyword', detail: 'Component reactive update lifecycle' },
    { label: 'unmount', kind: 'keyword', detail: 'Component unmount lifecycle' }
  ];
  const builtIn = ['grid', 'row', 'column', 'stack', 'scroll', 'title', 'subtitle', 'primary', 'danger']
    .map((label): CompletionEntry => ({ label, kind: 'role', detail: 'VX visual role' }));
  const local = document.symbols.filter((symbol) => symbol.kind === 'role')
    .map((symbol): CompletionEntry => ({ label: symbol.name, kind: 'role', detail: 'Local visual role' }));
  return dedupeCompletions([...componentDirectives, ...local, ...builtIn]);
}

function dedupeCompletions(entries: readonly CompletionEntry[]): CompletionEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => seen.has(entry.label) ? false : (seen.add(entry.label), true));
}

function scopesOverlap(left: VXSymbol, right: VXSymbol): boolean {
  const leftScope = left.scopeSpan ?? left.span;
  const rightScope = right.scopeSpan ?? right.span;
  return leftScope.start.offset <= rightScope.end.offset && rightScope.start.offset <= leftScope.end.offset;
}

function wholeDocumentSpan(uri: string, source: string): SourceSpan {
  const lines = source.split('\n');
  return {
    filePath: uri,
    start: { line: 1, column: 1, offset: 0 },
    end: { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1, offset: source.length }
  };
}

function quickFixForDiagnostic(diagnostic: Diagnostic, source: string): { title: string; edit: TextEdit } | undefined {
  if (diagnostic.code === DiagnosticCodes.UnterminatedBlock) {
    const block = diagnostic.message.includes("'#script'") ? 'script' : diagnostic.message.includes("'#view'") ? 'view' : undefined;
    if (!block) return undefined;
    const prefix = source.endsWith('\n') ? '' : '\n';
    return { title: `Insert '#end ${block}'`, edit: { span: endSpan(diagnostic.span.filePath, source), newText: `${prefix}#end ${block}\n` } };
  }
  return undefined;
}

function endSpan(uri: string, source: string): SourceSpan {
  const lines = source.split('\n');
  const position = { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1, offset: source.length };
  return { filePath: uri, start: position, end: position };
}
