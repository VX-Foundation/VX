import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
function resolveWorkspaceRoot(params) {
    const uri = params.workspaceFolders?.[0]?.uri ?? params.rootUri ?? undefined;
    return uri?.startsWith('file:') ? fileURLToPath(uri) : undefined;
}
import { CodeActionKind, DiagnosticSeverity, DidChangeConfigurationNotification, Location, ProposedFeatures, Range, TextDocumentSyncKind, TextDocuments, TextEdit, createConnection } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { inspectVX } from '@vx-foundation/tooling/inspect';
import { VXLanguageService, indexVXWorkspaceAsync } from '@vx-foundation/tooling';
import { encodeSemanticTokens, SEMANTIC_TOKEN_TYPES, toCompletionItem, toLspDiagnostic, toPosition, toRange, toSymbolKind } from './protocol-adapters.js';
const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const service = new VXLanguageService();
let workspaceRoot;
let workspaceStatus = { indexedFiles: 0, skippedFiles: 0, truncated: false, diagnostics: [] };
connection.onInitialize((params) => {
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
            semanticTokensProvider: { legend: { tokenTypes: [...SEMANTIC_TOKEN_TYPES], tokenModifiers: ['declaration', 'definition', 'readonly', 'static', 'deprecated', 'async'] }, full: true },
            inlayHintProvider: true,
            callHierarchyProvider: true,
            typeHierarchyProvider: true
        }
    };
});
connection.onInitialized(() => {
    connection.client.register(DidChangeConfigurationNotification.type, undefined);
    if (workspaceRoot)
        void reindexWorkspace();
});
documents.onDidOpen((event) => scheduleValidation(event.document));
documents.onDidChangeContent((event) => scheduleValidation(event.document));
documents.onDidClose((event) => { pendingAnalysis.get(event.document.uri)?.abort(); pendingAnalysis.delete(event.document.uri); service.close(event.document.uri); connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] }); });
connection.onCompletion((params) => withDocument(params.textDocument.uri, (document) => service.completions(document.uri, document.offsetAt(params.position)).map(toCompletionItem), []));
connection.onHover((params) => withDocument(params.textDocument.uri, (document) => {
    const symbol = service.definition(document.uri, document.offsetAt(params.position));
    if (!symbol)
        return null;
    const detail = symbol.detail ? `: ${symbol.detail}` : '';
    return { contents: { kind: 'markdown', value: `**${symbol.kind}** \`${symbol.name}${detail}\`` }, range: toRange(symbol.selectionSpan) };
}, null));
connection.onDefinition((params) => withDocument(params.textDocument.uri, (document) => {
    const symbol = service.definition(document.uri, document.offsetAt(params.position));
    return symbol ? Location.create(document.uri, toRange(symbol.selectionSpan)) : null;
}, null));
connection.onReferences((params) => withDocument(params.textDocument.uri, (document) => service.references(document.uri, document.offsetAt(params.position), params.context.includeDeclaration).map((reference) => Location.create(document.uri, toRange(reference.span))), []));
connection.onPrepareRename((params) => withDocument(params.textDocument.uri, (document) => {
    const symbol = service.definition(document.uri, document.offsetAt(params.position));
    return symbol ? toRange(symbol.selectionSpan) : null;
}, null));
connection.onRenameRequest((params) => withDocument(params.textDocument.uri, (document) => ({ changes: { [document.uri]: service.rename(document.uri, document.offsetAt(params.position), params.newName).map((edit) => TextEdit.replace(toRange(edit.span), edit.newText)) } }), null));
connection.onCodeAction((params) => withDocument(params.textDocument.uri, (document) => service.codeActions(document.uri).map((action) => ({
    title: action.title,
    kind: action.kind === 'source' ? CodeActionKind.Source : action.kind === 'refactor' ? CodeActionKind.Refactor : CodeActionKind.QuickFix,
    diagnostics: params.context.diagnostics.filter((diagnostic) => action.diagnostics?.includes(String(diagnostic.code))),
    edit: { changes: { [document.uri]: action.edits.map((edit) => TextEdit.replace(toRange(edit.span), edit.newText)) } }
})), []));
connection.onDocumentFormatting((params) => withDocument(params.textDocument.uri, (document) => service.codeActions(document.uri).find((candidate) => candidate.title === 'Format VX document')?.edits.map((edit) => TextEdit.replace(toRange(edit.span), edit.newText)) ?? [], []));
connection.onDocumentSymbol((params) => withDocument(params.textDocument.uri, (document) => service.get(document.uri)?.symbols.map((symbol) => ({ name: symbol.name, detail: symbol.detail ?? symbol.kind, kind: toSymbolKind(symbol), range: toRange(symbol.span), selectionRange: toRange(symbol.selectionSpan) })) ?? [], []));
connection.onRequest('workspace/symbol', (params) => service.workspaceSymbols(params.query).map(({ uri, symbol }) => ({ name: symbol.name, kind: toSymbolKind(symbol), location: Location.create(uri, toRange(symbol.selectionSpan)), containerName: symbol.kind })));
connection.onRequest('textDocument/semanticTokens/full', (params) => withDocument(params.textDocument.uri, (document) => ({ data: encodeSemanticTokens(service.semanticTokens(document.uri)) }), { data: [] }));
connection.onRequest('textDocument/inlayHint', (params) => withDocument(params.textDocument.uri, (document) => service.inlayHints(document.uri).map((hint) => ({ position: toPosition(hint.position), label: hint.label, kind: hint.kind === 'type' ? 1 : 2, tooltip: hint.tooltip })), []));
connection.onRequest('textDocument/prepareCallHierarchy', (params) => hierarchyPrepare(params, 'call'));
connection.onRequest('callHierarchy/incomingCalls', (params) => hierarchyCalls(params.item, 'incoming'));
connection.onRequest('callHierarchy/outgoingCalls', (params) => hierarchyCalls(params.item, 'outgoing'));
connection.onRequest('textDocument/prepareTypeHierarchy', (params) => hierarchyPrepare(params, 'type'));
connection.onRequest('typeHierarchy/supertypes', (params) => typeHierarchyItems(params.item, 'parents'));
connection.onRequest('typeHierarchy/subtypes', (params) => typeHierarchyItems(params.item, 'children'));
connection.onRequest('vx/inspect', (params) => inspectDocument(params.uri, true));
connection.onRequest('vx/generated', (params) => inspectDocument(params.uri, true));
connection.onRequest('vx/graph', (params) => {
    const inspection = inspectDocument(params.uri, false);
    return { reactive: inspection['reactive'], visual: inspection['visual'], boundaries: inspection['boundaries'], sourceMap: inspection['sourceMap'] };
});
connection.onRequest('vx/routes', () => readRoutes());
connection.onRequest('vx/workspaceStatus', () => workspaceStatus);
connection.onRequest('vx/reindexWorkspace', async (_params, token) => reindexWorkspace(token));
const pendingAnalysis = new Map();
function scheduleValidation(document) {
    pendingAnalysis.get(document.uri)?.abort();
    const controller = new AbortController();
    pendingAnalysis.set(document.uri, controller);
    queueMicrotask(() => {
        if (controller.signal.aborted)
            return;
        validateTextDocument(document, controller.signal);
        if (pendingAnalysis.get(document.uri) === controller)
            pendingAnalysis.delete(document.uri);
    });
}
function validateTextDocument(document, signal) {
    try {
        const snapshot = service.update(document.uri, document.getText(), document.version, signal);
        connection.sendDiagnostics({ uri: document.uri, diagnostics: snapshot.diagnostics.map(toLspDiagnostic) });
    }
    catch (error) {
        if (signal?.aborted)
            return;
        connection.sendDiagnostics({ uri: document.uri, diagnostics: [{ severity: DiagnosticSeverity.Error, range: Range.create(0, 0, 0, 1), message: error instanceof Error ? error.message : 'Unexpected VX language-server failure.', source: 'vx-lsp' }] });
    }
}
async function reindexWorkspace(token) {
    if (!workspaceRoot)
        return workspaceStatus;
    const controller = new AbortController();
    const disposable = token?.onCancellationRequested?.(() => controller.abort(new Error('VX workspace indexing was cancelled.')));
    if (token?.isCancellationRequested)
        controller.abort(new Error('VX workspace indexing was cancelled.'));
    try {
        workspaceStatus = await indexVXWorkspaceAsync(service, workspaceRoot, { signal: controller.signal, maxFiles: 20_000, maxFileBytes: 2 * 1024 * 1024 });
        for (const diagnostic of workspaceStatus.diagnostics)
            connection.console.warn(diagnostic.message);
        return workspaceStatus;
    }
    finally {
        disposable?.dispose();
    }
}
function withDocument(uri, action, fallback) {
    const document = documents.get(uri);
    if (!document)
        return fallback;
    if (!service.get(uri))
        service.open(uri, document.getText(), document.version);
    return action(document);
}
function inspectDocument(uri, generated) {
    const document = documents.get(uri);
    if (document)
        return inspectVX(document.getText(), document.uri, generated);
    if (uri.startsWith('file:'))
        return inspectVX(readFileSync(fileURLToPath(uri), 'utf8'), uri, generated);
    throw new Error(`VX document '${uri}' is unavailable.`);
}
function readRoutes() {
    if (!workspaceRoot)
        return { version: 1, routes: [], endpoints: [] };
    const path = resolve(workspaceRoot, 'dist', 'vx.routes.json');
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { version: 1, routes: [], endpoints: [] };
}
function hierarchyPrepare(params, kind) {
    return withDocument(params.textDocument.uri, (document) => {
        const offset = document.offsetAt(params.position);
        const hierarchy = kind === 'call' ? service.callHierarchy(document.uri, offset) : service.typeHierarchy(document.uri, offset);
        return hierarchy ? [toHierarchyItem({ uri: hierarchy.uri, symbol: hierarchy.symbol })] : [];
    }, []);
}
function hierarchyCalls(item, direction) {
    const hierarchy = service.callHierarchy(item.data.uri, item.data.offset);
    const entries = hierarchy?.[direction] ?? [];
    return entries.map((entry) => direction === 'incoming' ? { from: toHierarchyItem(entry), fromRanges: [toRange(entry.symbol.selectionSpan)] } : { to: toHierarchyItem(entry), fromRanges: [toRange(entry.symbol.selectionSpan)] });
}
function typeHierarchyItems(item, direction) {
    return (service.typeHierarchy(item.data.uri, item.data.offset)?.[direction] ?? []).map(toHierarchyItem);
}
function toHierarchyItem(item) {
    return { name: item.symbol.name, kind: toSymbolKind(item.symbol), uri: item.uri, range: toRange(item.symbol.span), selectionRange: toRange(item.symbol.selectionSpan), detail: item.symbol.detail ?? item.symbol.kind, data: { uri: item.uri, offset: item.symbol.selectionSpan.start.offset } };
}
documents.listen(connection);
connection.listen();
//# sourceMappingURL=server.js.map