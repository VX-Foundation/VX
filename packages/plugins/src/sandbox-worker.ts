import processModule from 'node:process';
import { parentPort, workerData } from 'node:worker_threads';
import type { Integration, IntegrationContext, PluginDiagnostic, PluginHook, PluginHookContext, PluginHookName, PluginManifest } from '@vx/types';

interface WorkerData { moduleSpecifier: string; root: string; sourceIntegrity: string; declaredManifest?: PluginManifest; options?: Record<string, unknown>; }
type Operation =
  | { kind: 'route-middleware'; identifier: string }
  | { kind: 'view-transform'; identifier: string }
  | { kind: 'adapter'; adapter: { name: string; module: string } }
  | { kind: 'diagnostic'; diagnostic: Omit<PluginDiagnostic, 'plugin'> }
  | { kind: 'emit-file'; path: string; content: string | Uint8Array };
interface RequestMessage { type: 'setup' | 'hook' | 'dispose' | 'response'; id: number; name?: PluginHookName; context?: Omit<PluginHookContext, 'signal'>; value?: unknown; error?: string; }

if (!parentPort) throw new Error('VX plugin sandbox requires a parent port.');
const data = workerData as WorkerData;
const hooks = new Map<PluginHookName, PluginHook[]>();
const cache = new Map<string, Promise<unknown>>();
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
let requestSequence = 0;
let integration: Integration;
let manifest: PluginManifest;
let operations: Operation[] = [];

hardenGlobals();
hardenDeterministicGlobals();
try {
  const loaded = await import(data.moduleSpecifier);
  const candidate = unwrapDefault(loaded);
  const resolved = typeof candidate === 'function' ? await candidate(data.options ?? {}) : candidate;
  if (!resolved || typeof resolved !== 'object' || typeof (resolved as Partial<Integration>).name !== 'string' || typeof (resolved as Partial<Integration>).setup !== 'function') throw new TypeError('Plugin module must export an Integration or integration factory.');
  integration = resolved as Integration;
  const runtimeManifest = integration.manifest ?? { name: integration.name, version: '0.0.0-legacy', apiVersion: '1', capabilities: ['config'], permissions: [], deterministic: false };
  if (runtimeManifest.integrity !== undefined || runtimeManifest.signature !== undefined || runtimeManifest.signer !== undefined) {
    throw new Error(`Plugin '${runtimeManifest.name}' must keep integrity and signatures in vx.plugin.json, not executable code.`);
  }
  if (data.declaredManifest) {
    if (data.declaredManifest.integrity !== data.sourceIntegrity) throw new Error(`Plugin '${data.declaredManifest.name}' source integrity mismatch.`);
    assertRuntimeContract(runtimeManifest, data.declaredManifest, integration.name);
    manifest = data.declaredManifest;
  } else {
    manifest = runtimeManifest;
  }
  parentPort.postMessage({ type: 'ready', name: integration.name, manifest });
} catch (cause) {
  parentPort.postMessage({ type: 'fatal', error: message(cause) });
  processModule.exit(1);
}

parentPort.on('message', (messageValue: RequestMessage) => { void receive(messageValue); });

async function receive(messageValue: RequestMessage): Promise<void> {
  if (messageValue.type === 'response') {
    const waiter = pending.get(messageValue.id);
    if (!waiter) return;
    pending.delete(messageValue.id);
    if (messageValue.error) waiter.reject(new Error(messageValue.error)); else waiter.resolve(messageValue.value);
    return;
  }
  try {
    if (messageValue.type === 'dispose') { await integration.dispose?.(); parentPort!.postMessage({ type: 'result', id: messageValue.id, operations: [] }); parentPort!.close(); return; }
    operations = [];
    if (messageValue.type === 'setup') await integration.setup(createContext());
    else if (messageValue.type === 'hook' && messageValue.name && messageValue.context) {
      const controller = new AbortController();
      const context: PluginHookContext = { ...messageValue.context, signal: controller.signal };
      for (const hook of hooks.get(messageValue.name) ?? []) await hook(context);
    }
    parentPort!.postMessage({ type: 'result', id: messageValue.id, operations, hooks: messageValue.type === 'setup' ? [...hooks.keys()] : undefined });
  } catch (cause) {
    parentPort!.postMessage({ type: 'result', id: messageValue.id, operations, error: message(cause) });
  }
}

function createContext(): IntegrationContext {
  return {
    root: data.root,
    addRouteMiddleware(identifier) { operations.push({ kind: 'route-middleware', identifier }); },
    transformView(identifier) { operations.push({ kind: 'view-transform', identifier }); },
    registerAdapter(adapter) { operations.push({ kind: 'adapter', adapter }); },
    registerHook(name, hook) { const registered = hooks.get(name) ?? []; registered.push(hook); hooks.set(name, registered); },
    addDiagnostic(diagnostic) { operations.push({ kind: 'diagnostic', diagnostic }); },
    emitFile(path, content) { operations.push({ kind: 'emit-file', path, content }); },
    readProjectFile(relativePath) { return requestParent<string>('read-project-file', { relativePath }); },
    cache<T>(key: string, factory: () => T | Promise<T>): Promise<T> {
      if (!manifest.deterministic) return Promise.resolve(factory());
      const existing = cache.get(key);
      if (existing) return existing as Promise<T>;
      const value = (async () => {
        const stored = await requestParent<{ hit: boolean; value?: T }>('cache-get', { key });
        if (stored.hit) return stored.value as T;
        const created = await factory();
        await requestParent<boolean>('cache-set', { key, value: created });
        return created;
      })();
      cache.set(key, value);
      value.catch(() => cache.delete(key));
      return value;
    }
  };
}
function requestParent<T>(method: string, value: unknown): Promise<T> {
  const id = ++requestSequence;
  parentPort!.postMessage({ type: 'request', id, method, value });
  return new Promise<T>((resolve, reject) => pending.set(id, { resolve: (result) => resolve(result as T), reject }));
}
function hardenGlobals(): void {
  const safeProcess = Object.freeze({ env: Object.freeze({ NODE_ENV: processModule.env['NODE_ENV'] ?? 'production' }), platform: processModule.platform, arch: processModule.arch, versions: Object.freeze({ node: processModule.versions.node }), cwd: () => '/', nextTick: processModule.nextTick.bind(processModule) });
  Object.defineProperty(globalThis, 'process', { value: safeProcess, configurable: false, enumerable: false, writable: false });
  Object.defineProperty(globalThis, 'fetch', { value: undefined, configurable: false, enumerable: false, writable: false });
  Object.defineProperty(globalThis, 'WebSocket', { value: undefined, configurable: false, enumerable: false, writable: false });
}

function hardenDeterministicGlobals(): void {
  Object.defineProperty(Math, 'random', { value: () => { throw new Error('Deterministic VX plugins cannot use Math.random().'); }, configurable: false, writable: false });
  const originalDate = Date;
  class DeterministicDate extends originalDate {
    constructor(value?: string | number | Date) {
      if (value === undefined) throw new Error('Deterministic VX plugins must not read the current time.');
      super(value instanceof Date ? value.getTime() : value);
    }
    static override now(): number { throw new Error('Deterministic VX plugins cannot use Date.now().'); }
  }
  Object.defineProperty(globalThis, 'Date', { value: DeterministicDate, configurable: false, enumerable: false, writable: false });
  if (typeof globalThis.crypto !== 'undefined') {
    const safeCrypto = Object.freeze({ subtle: globalThis.crypto.subtle, randomUUID: () => { throw new Error('Deterministic VX plugins cannot generate random UUIDs.'); }, getRandomValues: () => { throw new Error('Deterministic VX plugins cannot use random values.'); } });
    Object.defineProperty(globalThis, 'crypto', { value: safeCrypto, configurable: false, enumerable: false, writable: false });
  }
}


function assertRuntimeContract(runtime: PluginManifest, declared: PluginManifest, integrationName: string): void {
  const comparable = (value: PluginManifest): string => JSON.stringify({
    name: value.name,
    version: value.version,
    apiVersion: value.apiVersion,
    capabilities: [...value.capabilities].sort(),
    permissions: [...value.permissions].sort(),
    deterministic: value.deterministic,
    cacheVersion: value.cacheVersion ?? null,
    timeoutMs: value.timeoutMs ?? null
  });
  if (integrationName !== declared.name || comparable(runtime) !== comparable(declared)) {
    throw new Error(`Plugin '${integrationName}' runtime contract does not match vx.plugin.json.`);
  }
}

function unwrapDefault(value: unknown): unknown { return value && typeof value === 'object' && 'default' in value ? (value as { default: unknown }).default : value; }
function message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }
