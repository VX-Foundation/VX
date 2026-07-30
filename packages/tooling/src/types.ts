import type { Diagnostic, SourceSpan } from '@vx/types';

export interface TextEdit {
  span: SourceSpan;
  newText: string;
}

export type SymbolKind =
  | 'model'
  | 'schema'
  | 'form'
  | 'field'
  | 'generic'
  | 'context'
  | 'import'
  | 'prop'
  | 'const'
  | 'state'
  | 'derive'
  | 'query'
  | 'action'
  | 'effect'
  | 'store'
  | 'output'
  | 'content'
  | 'part'
  | 'role'
  | 'parameter'
  | 'binding';

export interface VXSymbol {
  name: string;
  kind: SymbolKind;
  span: SourceSpan;
  selectionSpan: SourceSpan;
  scopeSpan?: SourceSpan;
  detail?: string;
  side?: 'client' | 'server';
  exported?: boolean;
}

export interface SymbolReference {
  name: string;
  span: SourceSpan;
  declaration: boolean;
  symbol?: VXSymbol;
}

export interface CompletionEntry {
  label: string;
  kind: SymbolKind | 'keyword' | 'widget' | 'role';
  detail: string;
  insertText?: string;
}

export interface CodeAction {
  title: string;
  kind: 'quickfix' | 'refactor' | 'source';
  diagnostics?: string[];
  edits: TextEdit[];
}

export interface VXDocumentSnapshot {
  uri: string;
  source: string;
  version: number;
  diagnostics: Diagnostic[];
  symbols: VXSymbol[];
}

export type SemanticTokenType = 'keyword' | 'type' | 'class' | 'function' | 'variable' | 'property' | 'parameter' | 'namespace' | 'string' | 'number' | 'comment';
export interface SemanticTokenEntry {
  line: number;
  character: number;
  length: number;
  tokenType: SemanticTokenType;
  modifiers: readonly ('declaration' | 'definition' | 'readonly' | 'static' | 'deprecated' | 'async')[];
}

export interface InlayHintEntry {
  position: SourceSpan['end'];
  label: string;
  kind: 'type' | 'parameter';
  tooltip?: string;
}

export interface HierarchyItem {
  uri: string;
  symbol: VXSymbol;
}

export interface CallHierarchyNode extends HierarchyItem {
  incoming: readonly HierarchyItem[];
  outgoing: readonly HierarchyItem[];
}

export interface TypeHierarchyNode extends HierarchyItem {
  parents: readonly HierarchyItem[];
  children: readonly HierarchyItem[];
}

export interface WorkspaceIndexOptions {
  maxFiles?: number;
  maxFileBytes?: number;
  exclude?: readonly string[];
  signal?: AbortSignal;
}

export interface WorkspaceIndexResult {
  indexedFiles: number;
  skippedFiles: number;
  truncated: boolean;
  diagnostics: readonly Diagnostic[];
}
