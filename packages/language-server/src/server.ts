import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  CodeActionKind,
  CompletionItemKind,
  DiagnosticSeverity,
  DidChangeConfigurationNotification,
  Location,
  Position,
  ProposedFeatures,
  Range,
  SymbolKind,
  TextDocumentSyncKind,
  TextDocuments,
  TextEdit,
  createConnection
} from 'vscode-languageserver/node.js';
import type { CompletionItem, Diagnostic, DocumentSymbol, InitializeParams, InitializeResult, WorkspaceEdit } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { inspectVX } from '@vx-foundation/tooling/inspect';
import { VXLanguageService, indexVXWorkspaceAsync } from '@vx-foundation/tooling';
import type { CompletionEntry, HierarchyItem, SemanticTokenEntry, VXSymbol, WorkspaceIndexResult } from '@vx-foundation/tooling';

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const service = new VXLanguageService();
const semanticTokenTypes = ['keyword', 'type', 'class', 'function', 'variable', 'property', 'parameter', 'namespace', 'string', 'number', 'comment'] as const;
let workspaceRoot: string | undefined;
let workspaceStatus: WorkspaceIndexResult = { indexedFiles: 0, skippedFiles: 0, truncated: false, diagnostics: [] };

connection.onInitialize((params: InitializeParams): InitializeResult => {
  workspaceRoot = resolveWorkspaceRoot(params);
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: false, triggerCharacters: ['#', '@', '.'] },
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      renameProvider: { prepareProvider: true },
      codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix, CodeActionKind.Refactor, CodeActionKind.Source] },
      documentFormattingProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      semanticTokensProvider: { legend: { tokenTypes: [...semanticTokenTypes], tokenModifiers: ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'async'] }, full: true },
      inlayHintProvider: true,
      callHierarchyProvider: true,
      typeHierarchyProvider: true
    }
  };
});

connection.onInitialized(() => {
  connection.client.register(DidChangeConfigurationNotification.type, undefined);
  if (workspaceRoot) void reindexWorkspace();
});

documents.onDidOpen((event) => scheduleValidation(event.document));
documents.onDidChangeContent((event) => scheduleValidation(event.document));
documents.onDidClose((event) => { pendingAnalysis.get(event.document.uri)?.abort(); pendingAnalysis.delete(event.document.uri); service.close(event.document.uri); connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }); });

connection.onCompletion((params): CompletionItem[] => withDocument(params.textDocument.uri, (document) => service.completions(document.uri, document.offsetAt(params.position)).map(toCompletionItem), []));
connection.onHover((params) => withDocument(params.textDocument.uri, (document) => {
  const symbol = service.definition(document.uri, document.offsetAt(params.position));
  if (!symbol) return null;
  const detail = symbol.detail ? `: ${symbol.detail}` : '';
  return { contents: { kind: 'markdown', value: `**${symbol.kind}** \`${symbol.name}${detail}\`` }, range: toRange(symbol.selectionSpan) };
}, null));
connection.onDefinition((params): Location | null => withDocument(params.textDocument.uri, (document) => {
  const symbol = service.definition(document.uri, document.offsetAt(params.position));
  return symbol ? Location.create(document.uri, toRange(symbol.selectionSpan)) : null;
}, null));
connection.onReferences((params): Location[] => withDocument(params.textDocument.uri, (document) => service.references(document.uri, document.offsetAt(params.position), params.context.includeDeclaration).map((reference) => Location.create(document.uri, toRange(reference.span))), []));
connection.onPrepareRename((params): Range | null => withDocument(params.textDocument.uri, (document) => {
  const symbol = service.definition(document.uri, document.offsetAt(params.position));
  return symbol ? toRange(symbol.selectionSpan) : null;
}, null));
connection.onRenameRequest((params): WorkspaceEdit | null => withDocument(params.textDocument.uri, (document) => ({ changes: { [document.uri]: service.rename(document.uri, document.offsetAt(params.position), params.newName).map((edit) => TextEdit.replace(toRange(edit.span), edit.newText)) } }), null));
connection.onCodeAction((params) => withDocument(params.textDocument.uri, (document) => service.codeActions(document.uri).map((action) => ({
  title: action.title,
  kind: action.kind === 'source' ? CodeActionKind.Source : action.kind === 'refactor' ? CodeActionKind.Refactor : CodeActionKind.QuickFix,
  diagnostics: params.context.diagnostics.filter((diagnostic: Diagnostic) => action.diagnostics?.includes(String(diagnostic.code))),
  edit: { changes: { [document.uri]: action.edits.map((edit) => TextEdit.replace(toRange(edit.span), edit.newText)) } }
})), []));
connection.onDocumentFormatting((params) => withDocument(params.textDocument.uri, (document) => service.codeActions(document.uri).find((candidate) => candidate.title === 'Format VX document')?.edits.map((edit) => TextEdit.replace(toRange(edit.span), edit.newText)) ?? [], []));
connection.onDocumentSymbol((params): DocumentSymbol[] => withDocument(params.textDocument.uri, (document) => service.get(document.uri)?.symbols.map((symbol) => ({ name: symbol.name, detail: symbol.detail ?? symbol.kind, kind: toSymbolKind(symbol), range: toRange(symbol.span), selectionRange: toRange(symbol.selectionSpan) })) ?? [], []));

connection.onRequest('workspace/symbol', (params: { query: string }) => service.workspaceSymbols(params.query).map(({ uri, symbol }) => ({ name: symbol.name, kind: toSymbolKind(symbol), location: Location.create(uri, toRange(symbol.selectionSpan)), containerName: symbol.kind })));
connection.onRequest('textDocument/semanticTokens/full', (params: { textDocument: { uri: string } }) => withDocument(params.textDocument.uri, (document) => ({ data: encodeSemanticTokens(service.semanticTokens(document.uri)) }), { data: [] }));
connection.onRequest('textDocument/inlayHint', (params: { textDocument: { uri: string } }) => withDocument(params.textDocument.uri, (document) => service.inlayHints(document.uri).map((hint) => ({ position: toPosition(hint.position), label: hint.label, kind: hint.kind === 'type' ? 1 : 2, tooltip: hint.tooltip })), []));
connection.onRequest('textDocument/prepareCallHierarchy', (params: PositionParams) => hierarchyPrepare(params, 'call'));
connection.onRequest('callHierarchy/incomingCalls', (params: { item: HierarchyLspItem }) => hierarchyCalls(params.item, 'incoming'));
connection.onRequest('callHierarchy/outgoingCalls', (params: { item: HierarchyLspItem }) => hierarchyCalls(params.item, 'outgoing'));
connection.onRequest('textDocument/prepareTypeHierarchy', (params: PositionParams) => hierarchyPrepare(params, 'type'));
connection.onRequest('typeHierarchy/supertypes', (params: { item: HierarchyLspItem }) => typeHierarchyItems(params.item, 'parents'));
connection.onRequest('typeHierarchy/subtypes', (params: { item: HierarchyLspItem }) => typeHierarchyItems(params.item, 'children'));

connection.onRequest('vx/inspect', (params: { uri: string }) => inspectDocument(params.uri, true));
connection.onRequest('vx/generated', (params: { uri: string }) => inspectDocument(params.uri, true));
connection.onRequest('vx/graph', (params: { uri: string }) => {
  const inspection = inspectDocument(params.uri, false) as Record<string, unknown>;
  return { reactive: inspection['reactive'], visual: inspection['visual'], boundaries: inspection['boundaries'], sourceMap: inspection['sourceMap'] };
});
connection.onRequest('vx/routes', () => readRoutes());
connection.onRequest('vx/workspaceStatus', () => workspaceStatus);
connection.onRequest('vx/reindexWorkspace', async (_params: unknown, token?: CancellationLike) => reindexWorkspace(token));

const pendingAnalysis = new Map<string, AbortController>();

function scheduleValidation(document: TextDocument): void {
  pendingAnalysis.get(document.uri)?.abort();
  const controller = new AbortController();
  pendingAnalysis.set(document.uri, controller);
  queueMicrotask(() => {
    if (controller.signal.aborted) return;
    validateTextDocument(document, controller.signal);
    if (pendingAnalysis.get(document.uri) === controller) pendingAnalysis.delete(document.uri);
  });
}

function validateTextDocument(document: TextDocument, signal?: AbortSignal): void {
  try {
    const snapshot = service.update(document.uri, document.getText(), document.version, signal);
    connection.sendDiagnostics({ uri: document.uri, diagnostics: snapshot.diagnostics.map(toLspDiagnostic) });
  } catch (error: unknown) {
    if (signal?.aborted) return;
    connection.sendDiagnostics({ uri: document.uri, diagnostics: [{ severity: DiagnosticSeverity.Error, range: Range.create(0, 0, 0, 1), message: error instanceof Error ? error.message : 'Unexpected VX language-server failure.', source: 'vx-lsp' }] });
  }
}

async function reindexWorkspace(token?: CancellationLike): Promise<WorkspaceIndexResult> {
  if (!workspaceRoot) return workspaceStatus;
  const controller = new AbortController();
  const disposable = token?.onCancellationRequested?.(() => controller.abort(new Error('VX workspace indexing was cancelled.')));
  if (token?.isCancellationRequested) controller.abort(new Error('VX workspace indexing was cancelled.'));
  try {
    workspaceStatus = await indexVXWorkspaceAsync(service, workspaceRoot, { signal: controller.signal, maxFiles: 20_000, maxFileBytes: 2 * 1024 * 1024 });
    for (const diagnostic of workspaceStatus.diagnostics) connection.console.warn(diagnostic.message);
    return workspaceStatus;
  } finally { disposable?.dispose(); }
}

function withDocument<T>(uri: string, action: (document: TextDocument) => T, fallback: T): T {
  const document = documents.get(uri);
  if (!document) return fallback;
  if (!service.get(uri)) service.open(uri, document.getText(), document.version);
  return action(document);
}
function inspectDocument(uri: string, generated: boolean): unknown {
  const document = documents.get(uri);
  if (document) return inspectVX(document.getText(), document.uri, generated);
  if (uri.startsWith('file:')) return inspectVX(readFileSync(fileURLToPath(uri), 'utf8'), uri, generated);
  throw new Error(`VX document '${uri}' is unavailable.`);
}
function readRoutes(): unknown {
  if (!workspaceRoot) return { version: 1, routes: [], endpoints: [] };
  const path = resolve(workspaceRoot, 'dist', 'vx.routes.json');
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { version: 1, routes: [], endpoints: [] };
}
function hierarchyPrepare(params: PositionParams, kind: 'call' | 'type'): HierarchyLspItem[] {
  return withDocument(params.textDocument.uri, (document) => {
    const offset = document.offsetAt(params.position);
    const hierarchy = kind === 'call' ? service.callHierarchy(document.uri, offset) : service.typeHierarchy(document.uri, offset);
    return hierarchy ? [toHierarchyItem({ uri: hierarchy.uri, symbol: hierarchy.symbol })] : [];
  }, []);
}
function hierarchyCalls(item: HierarchyLspItem, direction: 'incoming' | 'outgoing'): unknown[] {
  const hierarchy = service.callHierarchy(item.data.uri, item.data.offset);
  const entries = hierarchy?.[direction] ?? [];
  return entries.map((entry) => direction === 'incoming' ? { from: toHierarchyItem(entry), fromRanges: [toRange(entry.symbol.selectionSpan)] } : { to: toHierarchyItem(entry), fromRanges: [toRange(entry.symbol.selectionSpan)] });
}
function typeHierarchyItems(item: HierarchyLspItem, direction: 'parents' | 'children'): HierarchyLspItem[] {
  return (service.typeHierarchy(item.data.uri, item.data.offset)?.[direction] ?? []).map(toHierarchyItem);
}
function toHierarchyItem(item: HierarchyItem): HierarchyLspItem {
  return { name: item.symbol.name, kind: toSymbolKind(item.symbol), uri: item.uri, range: toRange(item.symbol.span), selectionRange: toRange(item.symbol.selectionSpan), detail: item.symbol.detail ?? item.symbol.kind, data: { uri: item.uri, offset: item.symbol.selectionSpan.start.offset } };
}
function encodeSemanticTokens(tokens: readonly SemanticTokenEntry[]): number[] {
  const data: number[] = []; let previousLine = 0; let previousCharacter = 0;
  for (const token of tokens) {
    const deltaLine = token.line - previousLine;
    const deltaCharacter = deltaLine === 0 ? token.character - previousCharacter : token.character;
    data.push(deltaLine, deltaCharacter, token.length, semanticTokenTypes.indexOf(token.tokenType), modifierBits(token.modifiers));
    previousLine = token.line; previousCharacter = token.character;
  }
  return data;
}
function modifierBits(modifiers: readonly string[]): number { const names = ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'async']; return modifiers.reduce((bits, modifier) => { const index = names.indexOf(modifier); return index >= 0 ? bits | (1 << index) : bits; }, 0); }
function toLspDiagnostic(diagnostic: ReturnType<VXLanguageService['diagnostics']>[number]): Diagnostic { return { severity: diagnostic.severity === 'error' ? DiagnosticSeverity.Error : diagnostic.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Information, code: diagnostic.code, source: 'vx', message: diagnostic.suggestion ? `${diagnostic.message}\nSuggestion: ${diagnostic.suggestion}` : diagnostic.message, range: toRange(diagnostic.span) }; }
function toCompletionItem(entry: CompletionEntry): CompletionItem { const kind = entry.kind === 'keyword' ? CompletionItemKind.Keyword : entry.kind === 'widget' ? CompletionItemKind.Class : entry.kind === 'role' ? CompletionItemKind.Property : entry.kind === 'action' ? CompletionItemKind.Function : entry.kind === 'model' ? CompletionItemKind.Struct : entry.kind === 'generic' ? CompletionItemKind.TypeParameter : entry.kind === 'import' ? CompletionItemKind.Module : CompletionItemKind.Variable; return { label: entry.label, kind, detail: entry.detail, ...(entry.insertText ? { insertText: entry.insertText } : {}) }; }
function toSymbolKind(symbol: VXSymbol): SymbolKind { if (symbol.kind === 'model' || symbol.kind === 'schema') return SymbolKind.Struct; if (symbol.kind === 'generic') return SymbolKind.TypeParameter; if (symbol.kind === 'import') return SymbolKind.Module; if (symbol.kind === 'action' || symbol.kind === 'effect' || symbol.kind === 'query') return SymbolKind.Function; if (symbol.kind === 'prop' || symbol.kind === 'parameter' || symbol.kind === 'field') return SymbolKind.Field; if (symbol.kind === 'context') return SymbolKind.Namespace; if (symbol.kind === 'role' || symbol.kind === 'part') return SymbolKind.Property; return SymbolKind.Variable; }
function toRange(span: { start: { line: number; column: number }; end: { line: number; column: number } }): Range { return Range.create(toPosition(span.start), toPosition(span.end)); }
function toPosition(position: { line: number; column: number }): Position { return Position.create(Math.max(0, position.line - 1), Math.max(0, position.column - 1)); }
function resolveWorkspaceRoot(params: InitializeParams): string | undefined { const uri = params.workspaceFolders?.[0]?.uri ?? params.rootUri ?? undefined; return uri?.startsWith('file:') ? fileURLToPath(uri) : undefined; }

interface CancellationLike { isCancellationRequested: boolean; onCancellationRequested?(listener: () => void): { dispose(): void }; }
interface PositionParams { textDocument: { uri: string }; position: Position; }
interface HierarchyLspItem { name: string; kind: SymbolKind; uri: string; range: Range; selectionRange: Range; detail: string; data: { uri: string; offset: number }; }

documents.listen(connection);
connection.listen();
