import type { CallHierarchyNode, HierarchyItem, SymbolReference, TypeHierarchyNode, VXDocumentSnapshot, VXSymbol } from './types.js';

export function createCallHierarchy(uri: string, symbol: VXSymbol, documents: readonly WorkspaceDocument[]): CallHierarchyNode {
  const callable = new Set(['action', 'effect', 'query', 'derive']);
  const outgoing: HierarchyItem[] = [];
  const incoming: HierarchyItem[] = [];
  if (callable.has(symbol.kind)) {
    const owner = documents.find((document) => document.uri === uri);
    for (const reference of owner?.references ?? []) {
      if (!reference.declaration && reference.symbol && callable.has(reference.symbol.kind) && reference.span.start.offset >= symbol.span.start.offset && reference.span.end.offset <= symbol.span.end.offset) {
        pushUnique(outgoing, { uri, symbol: reference.symbol });
      }
    }
    for (const document of documents) {
      for (const candidate of document.symbols.filter((item) => callable.has(item.kind))) {
        const references = document.references.filter((reference) => reference.symbol?.name === symbol.name && !reference.declaration && reference.span.start.offset >= candidate.span.start.offset && reference.span.end.offset <= candidate.span.end.offset);
        if (references.length > 0) pushUnique(incoming, { uri: document.uri, symbol: candidate });
      }
    }
  }
  return { uri, symbol, incoming, outgoing };
}

export function createTypeHierarchy(uri: string, symbol: VXSymbol, documents: readonly WorkspaceDocument[]): TypeHierarchyNode {
  const typeKinds = new Set(['model', 'schema', 'generic']);
  const children: HierarchyItem[] = [];
  const parents: HierarchyItem[] = [];
  if (typeKinds.has(symbol.kind)) {
    for (const document of documents) {
      for (const candidate of document.symbols.filter((item) => typeKinds.has(item.kind) && item !== symbol)) {
        if (candidate.detail?.includes(symbol.name)) pushUnique(children, { uri: document.uri, symbol: candidate });
        if (symbol.detail?.includes(candidate.name)) pushUnique(parents, { uri: document.uri, symbol: candidate });
      }
    }
  }
  return { uri, symbol, parents, children };
}

export interface WorkspaceDocument extends VXDocumentSnapshot { references: readonly SymbolReference[]; }
function pushUnique(items: HierarchyItem[], value: HierarchyItem): void {
  if (!items.some((item) => item.uri === value.uri && item.symbol.name === value.symbol.name && item.symbol.selectionSpan.start.offset === value.symbol.selectionSpan.start.offset)) items.push(value);
}
