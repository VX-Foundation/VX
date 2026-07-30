/**
 * Vite integration for complete VX component and application graphs. Component
 * modules remain compiler-owned while virtual application entries expose the
 * convention-discovered route graph with native route-level code splitting.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ComponentArtifact, Diagnostic } from '@vx/types';
import { compareHMRSignatures, createHMRSignature, type HMRSignature } from '@vx/tooling/hmr';
import { compileComponentProject } from '@vx/compiler/project';
import { buildApplicationGraph, generateApplicationModules, type ApplicationGraph, type GeneratedApplicationModules } from '@vx/router';
import type { Plugin, ResolvedConfig } from 'vite';

const PUBLIC_COMPONENT_PREFIX = 'virtual:vx-component/';
const INTERNAL_COMPONENT_PREFIX = '\0vx-component:';
const PUBLIC_APP_ID = 'virtual:vx-app';
const PUBLIC_BROWSER_APP_ID = 'virtual:vx-browser-app';
const PUBLIC_SERVER_APP_ID = 'virtual:vx-server-app';
const PUBLIC_EDGE_APP_ID = 'virtual:vx-edge-app';
const PUBLIC_NODE_APP_ID = 'virtual:vx-node-app';
const PUBLIC_ENDPOINTS_ID = 'virtual:vx-endpoints';
const PUBLIC_MANIFEST_ID = 'virtual:vx-route-manifest';
const INTERNAL_APP_ID = '\0vx-app';
const INTERNAL_BROWSER_APP_ID = '\0vx-browser-app';
const INTERNAL_SERVER_APP_ID = '\0vx-server-app';
const INTERNAL_EDGE_APP_ID = '\0vx-edge-app';
const INTERNAL_NODE_APP_ID = '\0vx-node-app';
const INTERNAL_ENDPOINTS_ID = '\0vx-endpoints';
const INTERNAL_MANIFEST_ID = '\0vx-route-manifest';

export interface VXPluginOptions {
  root?: string;
  pagesDir?: string;
  frameworkVersion?: string;
  maxModules?: number;
  maxDepth?: number;
  maxFileBytes?: number;
  maxRoutes?: number;
}

interface CachedArtifact {
  artifact: ComponentArtifact;
  clientCode: string;
  serverCode: string;
  signature: HMRSignature;
}

interface ApplicationCache {
  graph: ApplicationGraph;
  modules: GeneratedApplicationModules;
  files: Set<string>;
}

export function vitePluginVX(options: VXPluginOptions = {}): Plugin {
  let config: ResolvedConfig | undefined;
  let application: ApplicationCache | undefined;
  const artifacts = new Map<string, CachedArtifact>();
  const sourceToComponentId = new Map<string, string>();
  const sourceToEntryPath = new Map<string, string>();

  return {
    name: 'vite-plugin-vx',
    enforce: 'pre',

    configResolved(resolved) {
      config = resolved;
    },

    resolveId(source) {
      if (source === PUBLIC_APP_ID) return INTERNAL_APP_ID;
      if (source === PUBLIC_BROWSER_APP_ID) return INTERNAL_BROWSER_APP_ID;
      if (source === PUBLIC_SERVER_APP_ID) return INTERNAL_SERVER_APP_ID;
      if (source === PUBLIC_EDGE_APP_ID) return INTERNAL_EDGE_APP_ID;
      if (source === PUBLIC_NODE_APP_ID) return INTERNAL_NODE_APP_ID;
      if (source === PUBLIC_ENDPOINTS_ID) return INTERNAL_ENDPOINTS_ID;
      if (source === PUBLIC_MANIFEST_ID) return INTERNAL_MANIFEST_ID;
      if (source.startsWith(PUBLIC_COMPONENT_PREFIX)) {
        return `${INTERNAL_COMPONENT_PREFIX}${source.slice(PUBLIC_COMPONENT_PREFIX.length)}`;
      }
      return null;
    },

    load(id, loadOptions) {
      if (id === INTERNAL_APP_ID || id === INTERNAL_BROWSER_APP_ID || id === INTERNAL_SERVER_APP_ID || id === INTERNAL_EDGE_APP_ID || id === INTERNAL_NODE_APP_ID || id === INTERNAL_ENDPOINTS_ID || id === INTERNAL_MANIFEST_ID) {
        const cached = ensureApplication();
        for (const filePath of cached.files) this.addWatchFile(filePath);
        if (id === INTERNAL_APP_ID) return cached.modules.client;
        if (id === INTERNAL_BROWSER_APP_ID) return browserEntryModule(path.relative(resolvedRoot(), path.resolve(resolvedRoot(), options.pagesDir ?? 'src/pages')));
        if (id === INTERNAL_SERVER_APP_ID) return cached.modules.server;
        if (id === INTERNAL_EDGE_APP_ID) return edgeEntryModule(cached.modules.server);
        if (id === INTERNAL_NODE_APP_ID) return nodeStandaloneEntryModule();
        if (id === INTERNAL_ENDPOINTS_ID) return cached.modules.endpoints;
        return `export default ${cached.modules.manifest};`;
      }
      if (!id.startsWith(INTERNAL_COMPONENT_PREFIX)) return null;
      const moduleId = id.slice(INTERNAL_COMPONENT_PREFIX.length);
      const cached = artifacts.get(moduleId);
      if (!cached) throw new Error(`VX virtual component '${moduleId}' is not available in the current graph.`);
      return {
        code: loadOptions?.ssr === true ? cached.serverCode : cached.clientCode,
        map: null,
        meta: visualSourceMeta(cached.artifact)
      };
    },

    transform(_code, id, transformOptions) {
      if (!id.endsWith('.vx')) return null;
      const root = resolvedRoot();
      const result = compileComponentProject(id, {
        rootDir: root,
        ...(options.frameworkVersion ? { frameworkVersion: options.frameworkVersion } : {}),
        ...(options.maxModules !== undefined ? { maxModules: options.maxModules } : {}),
        ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
        ...(options.maxFileBytes !== undefined ? { maxFileBytes: options.maxFileBytes } : {})
      });
      throwFirstDiagnostic(result.diagnostics);

      for (const artifact of result.artifacts.values()) {
        this?.addWatchFile?.(artifact.filePath);
        const normalized = rewriteArtifactImports(artifact.clientCode, result.artifacts);
        const normalizedServer = rewriteArtifactImports(artifact.serverCode, result.artifacts);
        const source = fs.readFileSync(artifact.filePath, 'utf8');
        artifacts.set(artifact.id, { artifact, clientCode: normalized, serverCode: normalizedServer, signature: createHMRSignature(source, artifact.contract) });
        sourceToComponentId.set(artifact.filePath, artifact.id);
        sourceToEntryPath.set(artifact.filePath, id);
      }

      const entry = artifacts.get(result.entryId);
      if (!entry) throw new Error(`VX compiler did not emit entry component '${id}'.`);
      return {
        code: transformOptions?.ssr === true ? entry.serverCode : entry.clientCode,
        map: null,
        meta: visualSourceMeta(entry.artifact)
      };
    },

    handleHotUpdate(context) {
      const affected = [];
      if (application?.files.has(context.file) || isInsidePages(context.file)) {
        application = undefined;
        for (const virtualId of [INTERNAL_APP_ID, INTERNAL_BROWSER_APP_ID, INTERNAL_SERVER_APP_ID, INTERNAL_EDGE_APP_ID, INTERNAL_NODE_APP_ID, INTERNAL_ENDPOINTS_ID, INTERNAL_MANIFEST_ID]) {
          const module = context.server.moduleGraph.getModuleById(virtualId);
          if (module) {
            context.server.moduleGraph.invalidateModule(module);
            affected.push(module);
          }
        }
      }

      const componentId = sourceToComponentId.get(context.file);
      const entryPath = sourceToEntryPath.get(context.file);
      if (componentId && entryPath) {
        const previous = artifacts.get(componentId);
        const nextBuild = compileComponentProject(entryPath, {
          rootDir: resolvedRoot(),
          ...(options.frameworkVersion ? { frameworkVersion: options.frameworkVersion } : {}),
          ...(options.maxModules !== undefined ? { maxModules: options.maxModules } : {}),
          ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
          ...(options.maxFileBytes !== undefined ? { maxFileBytes: options.maxFileBytes } : {})
        });
        const compileError = nextBuild.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
        const nextArtifact = compileError ? undefined : nextBuild.artifacts.get(componentId);
        const nextSource = nextArtifact ? fs.readFileSync(nextArtifact.filePath, 'utf8') : undefined;
        const compatibility = previous && nextArtifact && nextSource
          ? compareHMRSignatures(previous.signature, createHMRSignature(nextSource, nextArtifact.contract))
          : undefined;
        context.server.ws.send({
          type: 'custom',
          event: 'vx:hmr-contract',
          data: {
            file: context.file,
            compatible: compatibility?.compatible ?? false,
            preserveState: compatibility?.preserveState ?? false,
            reasons: compatibility?.reasons ?? [compileError ? `[${compileError.code}] ${compileError.message}` : 'The updated component could not be compiled safely.']
          }
        });
        if (!compatibility?.compatible) {
          context.server.ws.send({ type: 'full-reload', path: '*' });
          return [];
        }
        for (const artifact of nextBuild.artifacts.values()) {
          const source = fs.readFileSync(artifact.filePath, 'utf8');
          artifacts.set(artifact.id, {
            artifact,
            clientCode: rewriteArtifactImports(artifact.clientCode, nextBuild.artifacts),
            serverCode: rewriteArtifactImports(artifact.serverCode, nextBuild.artifacts),
            signature: createHMRSignature(source, artifact.contract)
          });
          sourceToComponentId.set(artifact.filePath, artifact.id);
          sourceToEntryPath.set(artifact.filePath, entryPath);
          const virtualModule = context.server.moduleGraph.getModuleById(`${INTERNAL_COMPONENT_PREFIX}${artifact.id}`);
          if (virtualModule) {
            context.server.moduleGraph.invalidateModule(virtualModule);
            affected.push(virtualModule);
          }
        }
        for (const module of context.server.moduleGraph.getModulesByFile(context.file) ?? []) {
          context.server.moduleGraph.invalidateModule(module);
          affected.push(module);
        }
      }
      return affected.length > 0 ? affected : undefined;
    }
  };

  function ensureApplication(): ApplicationCache {
    if (application) return application;
    const root = resolvedRoot();
    const pagesDir = path.resolve(root, options.pagesDir ?? 'src/pages');
    const graph = buildApplicationGraph({ dir: pagesDir, rootDir: root, ...(options.maxRoutes !== undefined ? { maxRoutes: options.maxRoutes } : {}) });
    throwFirstRouteDiagnostic(graph);
    application = { graph, modules: generateApplicationModules(graph), files: collectRouteFiles(pagesDir) };
    return application;
  }

  function resolvedRoot(): string {
    const root = options.root ?? config?.root;
    if (!root) throw new Error('VX Vite plugin requires a resolved project root.');
    return path.resolve(root);
  }

  function isInsidePages(filePath: string): boolean {
    const pagesDir = path.resolve(resolvedRoot(), options.pagesDir ?? 'src/pages');
    const relative = path.relative(pagesDir, filePath);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }
}

function collectRouteFiles(directory: string): Set<string> {
  const files = new Set<string>();
  if (!fs.existsSync(directory)) return files;
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile()) files.add(fullPath);
    }
  }
  return files;
}

function visualSourceMeta(artifact: ComponentArtifact): Record<string, unknown> {
  return { vx: { sourceFile: artifact.filePath, viewSourceMap: artifact.viewSourceMap } };
}

function rewriteArtifactImports(code: string, graph: ReadonlyMap<string, ComponentArtifact>): string {
  let output = code;
  for (const artifact of graph.values()) {
    const relativeSpecifier = `./${artifact.outputFileName}`;
    const virtualSpecifier = `${PUBLIC_COMPONENT_PREFIX}${artifact.id}`;
    output = output.replaceAll(JSON.stringify(relativeSpecifier), JSON.stringify(virtualSpecifier));
  }
  return output;
}

function throwFirstDiagnostic(diagnostics: readonly Diagnostic[]): void {
  const first = diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (!first) return;
  const error = new Error(`[${first.code}] ${first.message}`);
  (error as Error & { loc?: { file: string; line: number; column: number } }).loc = {
    file: first.span.filePath,
    line: first.span.start.line,
    column: first.span.start.column
  };
  throw error;
}

function throwFirstRouteDiagnostic(graph: ApplicationGraph): void {
  const first = graph.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
  if (!first) return;
  const error = new Error(`[${first.code}] ${first.message}`);
  (error as Error & { loc?: { file: string; line: number; column: number } }).loc = {
    file: first.filePath,
    line: 1,
    column: 1
  };
  throw error;
}

function browserEntryModule(pagesDir: string): string {
  const normalized = pagesDir.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const sourceDirectory = normalized.endsWith('/pages') ? normalized.slice(0, -'/pages'.length) : normalized;
  const pattern = `/${sourceDirectory || 'src'}/**/*.vx`;
  return [
    `import { createVXApplication } from 'virtual:vx-app';`,
    `import { QueryClient, StoreRegistry, hydrateQueryClient, hydrateIslands, readHydrationState } from '@vx/runtime/client';`,
    `const root = document.getElementById('vx-app');`,
    `if (!root) throw new Error('VX application root was not found.');`,
    `const state = readHydrationState(document);`,
    `const hotData = import.meta.hot?.data;`,
    `const queryClient = hotData?.queryClient ?? new QueryClient();`,
    `const stores = hotData?.stores ?? new StoreRegistry();`,
    `if (state?.queries) hydrateQueryClient(queryClient, state.queries);`,
    `const runtime = Object.freeze({ queryClient, stores });`,
    `let hmrCompatibility;`,
    `let disposeIslands = () => undefined;`,
    `let islandsActive = state?.hydration === 'islands';`,
    `const releaseIslands = () => { if (!islandsActive) return; islandsActive = false; disposeIslands(); };`,
    `const router = createVXApplication(root, { runtime, adoptServerDocument: islandsActive, onBeforeNavigate: () => releaseIslands() });`,
    `if (islandsActive) {`,
    `  const modules = import.meta.glob(${JSON.stringify(pattern)});`,
    `  disposeIslands = await hydrateIslands({ root, state, modules, runtime, onError: (error) => console.error('[VX] Island hydration failed.', error) });`,
    `}`,
    `await router.start();`,
    `const dispose = (data) => {`,
    `  router.dispose(); releaseIslands();`,
    `  if (hmrCompatibility?.preserveState) { data.queryClient = queryClient; data.stores = stores; return; }`,
    `  queryClient.dispose(); stores.dispose();`,
    `};`,
    `if (import.meta.hot) {`,
    `  import.meta.hot.on('vx:hmr-contract', (payload) => { hmrCompatibility = payload; });`,
    `  import.meta.hot.dispose(dispose);`,
    `  import.meta.hot.accept();`,
    `}`
  ].join('\n');
}


function edgeEntryModule(serverModule: string): string {
  return serverModule.replace(`from '@vx/server'`, `from '@vx/router/server'`);
}

function nodeStandaloneEntryModule(): string {
  return `import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStaticFileHandler, startNodeServer } from '@vx/server/node';
import createVXServerApplication from 'virtual:vx-server-app';
const clientDirectory = fileURLToPath(new URL('../client/', import.meta.url));
const staticFiles = createStaticFileHandler({ root: clientDirectory, prefix: '/', immutablePrefix: '/assets/' });
const assetManifest = readJson(new URL('../client/vx.assets.json', import.meta.url));
const hintManifest = readJson(new URL('../client/vx.hints.json', import.meta.url));
const assetRecords = Array.isArray(assetManifest?.assets) ? assetManifest.assets : [];
const clientAsset = assetRecords.find((asset) => asset.kind === 'script' && /^\\/assets\\/vx-client-[A-Za-z0-9_-]+\\.js$/.test(asset.publicPath));
const clientEntry = clientAsset?.publicPath ?? '/assets/vx-client.js';
const entryHints = Array.isArray(hintManifest?.entry) ? hintManifest.entry : [];
const styleAssets = assetRecords.filter((asset) => asset.kind === 'css' && asset.critical === true && typeof asset.publicPath === 'string').map((asset) => ({ href: asset.publicPath, ...(asset.integrity ? { integrity: asset.integrity, crossOrigin: 'anonymous' } : {}) }));
const application = createVXServerApplication({
  clientEntry,
  ...(clientAsset?.integrity ? { clientEntryIntegrity: clientAsset.integrity } : {}),
  ...(styleAssets.length ? { styleAssets } : {}),
  ...(entryHints.length ? { resourceHints: entryHints } : {}),
  csrfSecret: process.env.VX_CSRF_SECRET,
  platform: {
    requestTimeoutMs: positiveInteger(process.env.VX_REQUEST_TIMEOUT_MS, 120_000),
    security: { contentSecurityPolicy: true, strictTransportSecurity: process.env.NODE_ENV === 'production' ? 'max-age=31536000; includeSubDomains' : false }
  }
});
const fetchApplication = {
  async handle(request) { return await staticFiles(request) ?? application.handle(request); },
  waitForBackgroundWork: () => application.waitForBackgroundWork()
};
const running = await startNodeServer(fetchApplication, {
  hostname: process.env.HOST ?? '0.0.0.0',
  port: positiveInteger(process.env.PORT, 3000),
  requestBodyLimitBytes: positiveInteger(process.env.VX_REQUEST_BODY_LIMIT, 16 * 1024 * 1024),
  gracefulShutdownMs: positiveInteger(process.env.VX_SHUTDOWN_TIMEOUT_MS, 10_000),
  compression: process.env.VX_COMPRESSION !== 'false',
  onListen: ({ hostname, port }) => console.log(\`[VX] Node server listening on http://\${hostname}:\${port}\`),
  onError: (error) => console.error('[VX] Node adapter failure.', error)
});
let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.info(\`[VX] Received \${signal}; draining requests.\`);
  try { await running.close(); process.exitCode = 0; }
  catch (error) { console.error('[VX] Graceful shutdown failed.', error); process.exitCode = 1; }
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
function positiveInteger(value, fallback) { const parsed = Number(value); return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback; }
function readJson(url) { try { return JSON.parse(readFileSync(url, 'utf8')); } catch { return undefined; } }
`;
}
