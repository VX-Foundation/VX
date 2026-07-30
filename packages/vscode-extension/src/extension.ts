import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import {
  commands,
  debug,
  DebugAdapterInlineImplementation,
  EventEmitter,
  languages,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  ViewColumn,
  window,
  workspace,
  type DebugAdapter,
  type DebugAdapterDescriptor,
  type DebugAdapterDescriptorFactory,
  type DebugConfiguration,
  type DebugConfigurationProvider,
  type ExtensionContext,
  type OutputChannel,
  type ProviderResult,
  type TreeDataProvider,
  type WorkspaceFolder
} from 'vscode';
import { LanguageClient, TransportKind, type LanguageClientOptions, type ServerOptions } from 'vscode-languageclient/node.js';

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace DebugProtocol {
  export interface ProtocolMessage { seq: number; type: string; }
  export interface Request extends ProtocolMessage { command: string; arguments?: Record<string, unknown>; }
  export interface Response extends ProtocolMessage { request_seq: number; success: boolean; command: string; message?: string; body?: unknown; }
  export interface Event extends ProtocolMessage { event: string; body?: unknown; }
}

let client: LanguageClient | undefined;
let inspectionOutput: OutputChannel | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const serverModule = resolveLanguageServer(context);
  const serverOptions: ServerOptions = { run: { module: serverModule, transport: TransportKind.ipc }, debug: { module: serverModule, transport: TransportKind.ipc, options: { execArgv: ['--nolazy', '--inspect=6011'] } } };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'vx' }, { scheme: 'untitled', language: 'vx' }],
    synchronize: { fileEvents: [workspace.createFileSystemWatcher('**/*.vx'), workspace.createFileSystemWatcher('**/vx.config.{ts,js}'), workspace.createFileSystemWatcher('**/package.json'), workspace.createFileSystemWatcher('**/vx.lock')] }
  };
  inspectionOutput = window.createOutputChannel('VX Inspector');
  client = new LanguageClient('vxLanguageServer', 'VX Language Server', serverOptions, clientOptions);

  const componentProvider = new VXTreeProvider('components');
  const graphProvider = new VXTreeProvider('graph');
  const routeProvider = new VXTreeProvider('routes');
  context.subscriptions.push(
    inspectionOutput!,
    window.registerTreeDataProvider('vx.components', componentProvider),
    window.registerTreeDataProvider('vx.graph', graphProvider),
    window.registerTreeDataProvider('vx.routes', routeProvider),
    commands.registerCommand('vx.restartLanguageServer', restartLanguageServer),
    commands.registerCommand('vx.inspectCurrentFile', inspectCurrentFile),
    commands.registerCommand('vx.openPreview', openPreview),
    commands.registerCommand('vx.showGeneratedOutput', showGeneratedOutput),
    commands.registerCommand('vx.showGraph', showGraph),
    commands.registerCommand('vx.inspectComponent', inspectComponent),
    commands.registerCommand('vx.refreshExplorers', () => { componentProvider.refresh(); graphProvider.refresh(); routeProvider.refresh(); }),
    workspace.onDidSaveTextDocument((document) => { if (document.languageId === 'vx') { componentProvider.refresh(); graphProvider.refresh(); } }),
    languages.registerDocumentLinkProvider({ language: 'vx' }, { provideDocumentLinks: () => [] })
  );

  const debugProvider = new VXDebugConfigurationProvider();
  const debugFactory = new VXDebugAdapterFactory();
  context.subscriptions.push(
    workspace.onDidChangeConfiguration((event) => { if (event.affectsConfiguration('vx')) void client?.sendNotification('workspace/didChangeConfiguration', { settings: workspace.getConfiguration('vx') }); }),
    // Registered under the official VX debug type.
    // The adapter verifies VX source breakpoints and owns the development process lifecycle.
    debug.registerDebugConfigurationProvider('vx', debugProvider),
    debug.registerDebugAdapterDescriptorFactory('vx', debugFactory)
  );
  await client.start();
}

export function deactivate(): PromiseLike<void> | undefined { return client?.stop(); }

class VXTreeProvider implements TreeDataProvider<VXTreeNode> {
  readonly #change = new EventEmitter<VXTreeNode | undefined>();
  readonly onDidChangeTreeData = this.#change.event;
  constructor(private readonly kind: 'components' | 'graph' | 'routes') {}
  refresh(): void { this.#change.fire(undefined); }
  getTreeItem(element: VXTreeNode): TreeItem { return element; }
  async getChildren(): Promise<VXTreeNode[]> {
    if (!client) return [];
    if (this.kind === 'routes') {
      const result = await client.sendRequest<{ routes?: Array<Record<string, unknown>> }>('vx/routes');
      return (result.routes ?? []).map((route) => new VXTreeNode(String(route['pathname'] ?? route['id'] ?? 'route'), String(route['id'] ?? ''), 'route'));
    }
    const editor = window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'vx') return [];
    const inspection = await client.sendRequest<VXInspection>('vx/inspect', { uri: editor.document.uri.toString() });
    if (this.kind === 'components') return inspection.visual.nodes.map((node) => new VXTreeNode(node.widget, `${node.id}${node.roles.length ? ` · ${node.roles.join(', ')}` : ''}`, 'component'));
    return inspection.reactiveGraph.map((node) => new VXTreeNode(node.name, `${node.kind} ← ${node.dependencies.join(', ') || 'root'}`, 'graph'));
  }
}

class VXTreeNode extends TreeItem {
  constructor(label: string, description: string, kind: 'route' | 'component' | 'graph') {
    super(label, TreeItemCollapsibleState.None);
    this.description = description;
    this.iconPath = new ThemeIcon(kind === 'route' ? 'route' : kind === 'component' ? 'symbol-class' : 'references');
    this.contextValue = `vx.${kind}`;
  }
}

async function restartLanguageServer(): Promise<void> { if (client) { await client.restart(); await window.showInformationMessage('VX Language Server restarted.'); } }
async function inspectCurrentFile(): Promise<void> {
  const inspection = await requestActiveInspection('vx/inspect');
  if (!inspection || !inspectionOutput) return;
  inspectionOutput.clear(); inspectionOutput.appendLine(JSON.stringify(inspection, null, 2)); inspectionOutput.show(true);
}
async function inspectComponent(): Promise<void> {
  const inspection = await requestActiveInspection('vx/inspect'); if (!inspection) return;
  const panel = window.createWebviewPanel('vxComponentInspector', 'VX Component Inspector', ViewColumn.Beside, { enableScripts: false, retainContextWhenHidden: true });
  panel.webview.html = inspectorHtml('Component Inspector', { visual: inspection.visual, boundaries: inspection.boundaries });
}
async function showGraph(): Promise<void> {
  const inspection = await requestActiveInspection('vx/graph'); if (!inspection) return;
  const panel = window.createWebviewPanel('vxGraph', 'VX Graph Viewer', ViewColumn.Beside, { enableScripts: false });
  panel.webview.html = inspectorHtml('Reactive and Visual Graph', inspection);
}
async function showGeneratedOutput(): Promise<void> {
  const inspection = await requestActiveInspection('vx/generated');
  const generated = inspection?.generated;
  if (!generated) { await window.showWarningMessage('Generated output is unavailable while the document contains compiler errors.'); return; }
  const content = `// VX generated client\n${generated.client}\n\n// VX generated server\n${generated.server}\n\n// Source map\n${JSON.stringify(generated.sourceMap, null, 2)}\n`;
  const document = await workspace.openTextDocument({ language: 'typescript', content });
  await window.showTextDocument(document, ViewColumn.Beside, true);
}
async function openPreview(): Promise<void> {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) { await window.showWarningMessage('Open a workspace before starting VX preview.'); return; }
  const terminal = window.createTerminal({ name: 'VX Preview', cwd: folder.uri.fsPath });
  terminal.show(); terminal.sendText('vx dev', true);
}
async function requestActiveInspection(method: 'vx/inspect' | 'vx/generated' | 'vx/graph'): Promise<VXInspection | undefined> {
  const editor = window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'vx') { await window.showWarningMessage('Open a VX file first.'); return undefined; }
  if (!client) { await window.showErrorMessage('VX Language Server is not running.'); return undefined; }
  try { return await client.sendRequest<VXInspection>(method, { uri: editor.document.uri.toString() }); }
  catch (error) { await window.showErrorMessage(error instanceof Error ? error.message : 'VX inspection failed.'); return undefined; }
}

class VXDebugConfigurationProvider implements DebugConfigurationProvider {
  resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration): ProviderResult<DebugConfiguration> {
    return { type: 'vx', request: 'launch', name: (config['name'] as string | undefined) || 'Debug VX Application', cwd: (config['cwd'] as string | undefined) || folder?.uri.fsPath || workspace.workspaceFolders?.[0]?.uri.fsPath, command: (config['command'] as string | undefined) || 'vx', args: (config['args'] as string[] | undefined) || ['dev'], stopOnEntry: config['stopOnEntry'] === true };
  }
}
class VXDebugAdapterFactory implements DebugAdapterDescriptorFactory { createDebugAdapterDescriptor(_session: unknown): ProviderResult<DebugAdapterDescriptor> { return new DebugAdapterInlineImplementation(new VXDebugAdapter()); } }
class VXDebugAdapter implements DebugAdapter {
  readonly #messages = new EventEmitter<DebugProtocol.ProtocolMessage>();
  readonly onDidSendMessage = this.#messages.event;
  #sequence = 1;
  #child?: ChildProcessWithoutNullStreams;
  handleMessage(message: DebugProtocol.ProtocolMessage): void {
    if (message.type !== 'request') return;
    const request = message as DebugProtocol.Request;
    const respond = (body?: unknown): void => this.#messages.fire({ type: 'response', seq: this.#sequence++, request_seq: request.seq, command: request.command, success: true, ...(body !== undefined ? { body } : {}) } as DebugProtocol.Response);
    if (request.command === 'initialize') { respond({ supportsConfigurationDoneRequest: true, supportsTerminateRequest: true, supportsRestartRequest: true }); this.event('initialized'); return; }
    if (request.command === 'launch') {
      const args = request.arguments as { cwd?: string; command?: string; args?: string[] };
      const command = args.command || 'vx';
      const commandArgs = Array.isArray(args.args) ? args.args.filter((item): item is string => typeof item === 'string') : ['dev'];
      this.#child = spawn(command, commandArgs, { cwd: args.cwd, shell: false, env: { ...process.env, VX_DEBUG: '1' } });
      this.#child.stdout.on('data', (chunk) => this.event('output', { category: 'stdout', output: String(chunk) }));
      this.#child.stderr.on('data', (chunk) => this.event('output', { category: 'stderr', output: String(chunk) }));
      this.#child.on('error', (error) => this.event('output', { category: 'stderr', output: `${error.message}\n` }));
      this.#child.on('exit', (code) => { this.event('exited', { exitCode: code ?? 1 }); this.event('terminated'); });
      respond();
      this.event('process', { name: command, systemProcessId: this.#child.pid, isLocalProcess: true, startMethod: 'launch' });
      return;
    }
    if (request.command === 'setBreakpoints') {
      const args = request.arguments as { source?: { path?: string }; breakpoints?: Array<{ line: number; column?: number }> };
      const verified = Boolean(args.source?.path && existsSync(args.source.path) && args.source.path.endsWith('.vx'));
      respond({ breakpoints: (args.breakpoints ?? []).map((point, index) => ({ id: index + 1, verified, line: point.line, column: point.column, message: verified ? undefined : 'VX breakpoints require a local .vx source file.' })) }); return;
    }
    if (request.command === 'threads') { respond({ threads: [{ id: 1, name: 'VX Runtime' }] }); return; }
    if (request.command === 'stackTrace') { respond({ stackFrames: [], totalFrames: 0 }); return; }
    if (request.command === 'scopes') { respond({ scopes: [] }); return; }
    if (request.command === 'variables') { respond({ variables: [] }); return; }
    if (request.command === 'continue') { respond({ allThreadsContinued: true }); this.event('continued', { threadId: 1, allThreadsContinued: true }); return; }
    if (request.command === 'disconnect' || request.command === 'terminate') { this.#child?.kill(); respond(); this.event('terminated'); return; }
    respond();
  }
  dispose(): void { this.#child?.kill(); this.#messages.dispose(); }
  private event(event: string, body?: unknown): void { this.#messages.fire({ type: 'event', seq: this.#sequence++, event, ...(body !== undefined ? { body } : {}) } as DebugProtocol.Event); }
}

function inspectorHtml(title: string, value: unknown): string {
  const payload = escapeHtml(JSON.stringify(value, null, 2));
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);padding:16px}pre{white-space:pre-wrap;word-break:break-word;border:1px solid var(--vscode-panel-border);padding:12px}</style></head><body><h1>${escapeHtml(title)}</h1><pre>${payload}</pre></body></html>`;
}
function escapeHtml(value: string): string { return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }
function resolveLanguageServer(context: ExtensionContext): string { const candidates = [context.asAbsolutePath(path.join('server', 'server.js')), context.asAbsolutePath(path.join('..', 'language-server', 'dist', 'server.js'))]; const module = candidates.find(existsSync); if (!module) throw new Error('VX Language Server build was not found.'); return module; }

interface VXInspection {
  diagnostics: unknown[];
  reactiveGraph: Array<{ name: string; kind: string; dependencies: string[] }>;
  visual: { nodes: Array<{ id: string; widget: string; roles: string[] }>; roleNames: string[]; cssText: string };
  boundaries: unknown[];
  generated?: { client: string; server: string; sourceMap: unknown[] };
}
