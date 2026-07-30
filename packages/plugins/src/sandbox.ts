import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Integration, IntegrationContext, PluginDiagnostic, PluginHookContext, PluginHookName, PluginManifest } from '@vx/types';
import { markIsolatedIntegration } from './isolation.js';
import { snapshotPluginSource } from './source-integrity.js';

export interface IsolatedPluginOptions { root: string; timeoutMs?: number; }
type Operation =
  | { kind: 'route-middleware'; identifier: string }
  | { kind: 'view-transform'; identifier: string }
  | { kind: 'adapter'; adapter: { name: string; module: string } }
  | { kind: 'diagnostic'; diagnostic: Omit<PluginDiagnostic, 'plugin'> }
  | { kind: 'emit-file'; path: string; content: string | Uint8Array };
interface SandboxResult { operations: Operation[]; hooks?: PluginHookName[]; }

export async function loadIsolatedIntegration(moduleSpecifier: string, pluginOptions: Record<string, unknown> | undefined, options: IsolatedPluginOptions): Promise<Integration> {
  validatePluginOptions(pluginOptions);
  const sandbox = await PluginSandbox.create(moduleSpecifier, pluginOptions, options);
  const integration: Integration = {
    name: sandbox.name,
    manifest: sandbox.manifest,
    async setup(context) {
      const setup = await sandbox.request('setup');
      applyOperations(context, setup.operations);
      for (const name of setup.hooks ?? []) {
        context.registerHook(name, async (hookContext) => {
          const result = await sandbox.request('hook', name, serializableHookContext(hookContext));
          applyOperations(context, result.operations);
          if (name === 'close') await sandbox.dispose();
        });
      }
    },
    dispose: () => sandbox.dispose()
  };
  return markIsolatedIntegration(integration, { sourceIntegrity: sandbox.sourceIntegrity, moduleSpecifier });
}

class PluginSandbox {
  readonly #worker: Worker;
  readonly #root: string;
  readonly #timeoutMs: number;
  readonly #pending = new Map<number, { resolve(value: SandboxResult): void; reject(error: Error): void }>();
  #sequence = 0;
  #disposed = false;
  private constructor(worker: Worker, root: string, timeoutMs: number, readonly name: string, readonly manifest: PluginManifest, readonly sourceIntegrity: string) {
    this.#worker = worker; this.#root = realpathSync(root); this.#timeoutMs = timeoutMs;
    worker.on('message', (message) => this.receive(message));
    worker.on('error', (error) => this.rejectAll(error instanceof Error ? error : new Error(String(error))));
    worker.on('exit', (code) => {
      if (this.#pending.size > 0) this.rejectAll(new Error(`VX plugin sandbox exited with code ${code}.`));
      else if (!this.#disposed && code !== 0) this.rejectAll(new Error(`VX plugin sandbox exited with code ${code}.`));
    });
  }
  static async create(moduleSpecifier: string, pluginOptions: Record<string, unknown> | undefined, options: IsolatedPluginOptions): Promise<PluginSandbox> {
    const timeoutMs = validTimeout(options.timeoutMs ?? 10_000, 'Plugin sandbox');
    const workerEntry = new URL('./sandbox-worker.js', import.meta.url);
    const loader = new URL('./sandbox-loader.js', import.meta.url);
    const resolvedModule = resolveModuleSpecifier(moduleSpecifier, options.root);
    const source = snapshotPluginSource(resolvedModule, options.root);
    const worker = new Worker(workerEntry, {
      workerData: { moduleSpecifier: resolvedModule, root: options.root, sourceIntegrity: source.integrity, ...(source.manifest ? { declaredManifest: source.manifest } : {}), ...(pluginOptions ? { options: pluginOptions } : {}) },
      execArgv: ['--import', `data:text/javascript,${encodeURIComponent(`import { register } from 'node:module'; register(${JSON.stringify(loader.href)}, ${JSON.stringify(pathToFileURL(process.cwd()).href)});`)}`],
      env: {
        NODE_ENV: process.env['NODE_ENV'] ?? 'production',
        VX_PLUGIN_INTERNAL_ROOT: `${dirname(fileURLToPath(workerEntry))}${sep}`,
        VX_PLUGIN_ALLOWED_ROOTS: JSON.stringify(source.allowedRoots),
        VX_PLUGIN_ALLOWED_FILES: JSON.stringify(source.allowedFiles)
      },
      resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 }
    });
    let ready: { name: string; manifest: PluginManifest };
    try { ready = await waitForReady(worker, timeoutMs); }
    catch (cause) { await worker.terminate(); throw cause; }
    if (ready.manifest.integrity !== undefined && ready.manifest.integrity !== source.integrity) { await worker.terminate(); throw new Error(`Plugin '${ready.name}' source integrity does not match its manifest.`); }
    if (ready.manifest.signature && !ready.manifest.integrity) { await worker.terminate(); throw new Error(`Signed plugin '${ready.name}' must declare source integrity.`); }
    const effectiveTimeout = validTimeout(Math.min(timeoutMs, ready.manifest.timeoutMs ?? timeoutMs), `Plugin '${ready.name}'`);
    return new PluginSandbox(worker, options.root, effectiveTimeout, ready.name, ready.manifest, source.integrity);
  }
  request(type: 'setup' | 'hook', name?: PluginHookName, context?: Omit<PluginHookContext, 'signal'>): Promise<SandboxResult> {
    if (this.#disposed) throw new Error(`VX plugin sandbox '${this.name}' is closed.`);
    const id = ++this.#sequence;
    const result = new Promise<SandboxResult>((resolveRequest, reject) => this.#pending.set(id, { resolve: resolveRequest, reject }));
    this.#worker.postMessage({ type, id, ...(name ? { name } : {}), ...(context ? { context } : {}) });
    return withTimeout(result, this.#timeoutMs, () => this.#worker.terminate(), `Plugin '${this.name}' ${type}`);
  }
  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    const id = ++this.#sequence;
    const result = new Promise<SandboxResult>((resolveRequest, reject) => this.#pending.set(id, { resolve: resolveRequest, reject }));
    this.#worker.postMessage({ type: 'dispose', id });
    try { await withTimeout(result, this.#timeoutMs, () => this.#worker.terminate(), `Plugin '${this.name}' dispose`); }
    finally {
      await this.#worker.terminate();
      this.rejectAll(new Error(`VX plugin sandbox '${this.name}' was disposed.`));
    }
  }
  private receive(message: unknown): void {
    if (!record(message)) return;
    if (message['type'] === 'request' && typeof message['id'] === 'number') { void this.handleRequest(message); return; }
    if (message['type'] !== 'result' || typeof message['id'] !== 'number') return;
    const waiter = this.#pending.get(message['id']); if (!waiter) return; this.#pending.delete(message['id']);
    if (typeof message['error'] === 'string') waiter.reject(new Error(message['error']));
    else waiter.resolve({ operations: Array.isArray(message['operations']) ? message['operations'] as Operation[] : [], ...(Array.isArray(message['hooks']) ? { hooks: message['hooks'] as PluginHookName[] } : {}) });
  }
  private async handleRequest(message: Record<string, unknown>): Promise<void> {
    const id = message['id'] as number;
    try {
      if (!record(message['value'])) throw new Error('Unsupported plugin sandbox request.');
      if (message['method'] === 'read-project-file' && typeof message['value']['relativePath'] === 'string') {
        if (!this.manifest.permissions.includes('read-project')) throw new Error(`Plugin '${this.name}' did not declare permission 'read-project'.`);
        const value = readProjectFile(this.#root, message['value']['relativePath']);
        this.#worker.postMessage({ type: 'response', id, value });
        return;
      }
      if (message['method'] === 'cache-get' && typeof message['value']['key'] === 'string') {
        const value = readPluginCache(this.#root, this.manifest, this.sourceIntegrity, message['value']['key']);
        this.#worker.postMessage({ type: 'response', id, value });
        return;
      }
      if (message['method'] === 'cache-set' && typeof message['value']['key'] === 'string') {
        writePluginCache(this.#root, this.manifest, this.sourceIntegrity, message['value']['key'], message['value']['value']);
        this.#worker.postMessage({ type: 'response', id, value: true });
        return;
      }
      throw new Error('Unsupported plugin sandbox request.');
    } catch (cause) { this.#worker.postMessage({ type: 'response', id, error: cause instanceof Error ? cause.message : String(cause) }); }
  }
  private rejectAll(error: Error): void { for (const waiter of this.#pending.values()) waiter.reject(error); this.#pending.clear(); }
}

function applyOperations(context: IntegrationContext, operations: readonly Operation[]): void {
  for (const operation of operations) {
    if (operation.kind === 'route-middleware') context.addRouteMiddleware(operation.identifier);
    else if (operation.kind === 'view-transform') context.transformView(operation.identifier);
    else if (operation.kind === 'adapter') context.registerAdapter(operation.adapter);
    else if (operation.kind === 'diagnostic') context.addDiagnostic(operation.diagnostic);
    else context.emitFile(operation.path, operation.content);
  }
}
function serializableHookContext(context: PluginHookContext): Omit<PluginHookContext, 'signal'> { const { signal: _signal, ...rest } = context; return rest; }
function readProjectFile(root: string, relativePath: string): string {
  if (!relativePath || relativePath.length > 4096 || relativePath.includes('\0') || relativePath.includes('\\') || relativePath.startsWith('/') || relativePath.split('/').includes('..')) throw new Error(`Unsafe plugin read path '${relativePath}'.`);
  const segments = relativePath.replace(/^\.\//, '').split('/');
  const protectedFile = /^(?:\.env(?:\..+)?|\.npmrc|\.yarnrc(?:\.yml)?|credentials(?:\.json)?|.*\.(?:pem|key|p12|pfx))$/i;
  if (segments.some((segment) => ['.git', '.ssh', '.gnupg', 'node_modules'].includes(segment)) || protectedFile.test(segments.at(-1) ?? '')) throw new Error(`Plugin read path '${relativePath}' targets protected project data.`);
  const projectRoot = realpathSync(root);
  const target = resolve(projectRoot, relativePath);
  if (target !== projectRoot && !target.startsWith(`${projectRoot}${sep}`)) throw new Error(`Plugin read path '${relativePath}' escapes the project root.`);
  if (!existsSync(target)) throw new Error(`Plugin read target '${relativePath}' does not exist.`);
  const stats = lstatSync(target);
  if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Plugin read target '${relativePath}' must be a regular file.`);
  const real = realpathSync(target);
  if (real !== projectRoot && !real.startsWith(`${projectRoot}${sep}`)) throw new Error(`Plugin read target '${relativePath}' resolves outside the project root.`);
  if (statSync(real).size > 8 * 1024 * 1024) throw new Error(`Plugin read target '${relativePath}' exceeds 8 MiB.`);
  return readFileSync(real, 'utf8');
}

function resolveModuleSpecifier(specifier: string, root: string): string {
  const projectRoot = realpathSync(root);
  if (specifier.startsWith('file:') || specifier.startsWith('/') || specifier.includes('\0') || specifier.includes('\\')) {
    throw new Error(`Plugin module '${specifier}' must be a project-relative JavaScript file or installed package.`);
  }
  if (specifier.startsWith('.')) {
    const target = resolve(projectRoot, specifier);
    if (target !== projectRoot && !target.startsWith(`${projectRoot}${sep}`)) throw new Error(`Plugin module '${specifier}' escapes the project root.`);
    if (!existsSync(target)) throw new Error(`Plugin module '${specifier}' does not exist.`);
    const stats = lstatSync(target);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Plugin module '${specifier}' must be a regular file.`);
    if (!/\.(?:mjs|js|cjs)$/.test(target)) throw new Error(`Plugin module '${specifier}' must be built JavaScript.`);
    return pathToFileURL(realpathSync(target)).href;
  }
  if (specifier === '@vx/plugins/sitemap') return new URL('./sitemap/index.js', import.meta.url).href;
  return pathToFileURL(resolveInstalledPlugin(specifier, projectRoot)).href;
}

function resolveInstalledPlugin(specifier: string, projectRoot: string): string {
  if (!/^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9][a-z0-9._-]*)(?:\/[A-Za-z0-9._/-]+)?$/i.test(specifier)) throw new Error(`Invalid plugin package specifier '${specifier}'.`);
  const packageName = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]!;
  const subpath = specifier.slice(packageName.length).replace(/^\//, '');
  let directory = projectRoot;
  for (;;) {
    const candidate = resolve(directory, 'node_modules', ...packageName.split('/'));
    const manifestPath = resolve(candidate, 'package.json');
    if (existsSync(manifestPath)) {
      const packageRoot = realpathSync(candidate);
      const manifest = readJson(manifestPath);
      if (manifest['name'] !== packageName) throw new Error(`Plugin package '${packageName}' has mismatched metadata.`);
      const exported = pluginExportTarget(manifest['exports'], subpath ? `./${subpath}` : '.');
      if (exported === null) throw new Error(`Plugin package '${specifier}' explicitly blocks this export.`);
      const target = exported ?? (subpath ? `./${subpath}` : stringValue(manifest['module']) ?? stringValue(manifest['main']) ?? './index.js');
      if (!target.startsWith('./') || target.includes('\\') || target.split('/').includes('..')) throw new Error(`Plugin '${specifier}' exports an unsafe entrypoint.`);
      const entry = resolve(packageRoot, target);
      if (entry !== packageRoot && !entry.startsWith(`${packageRoot}${sep}`)) throw new Error(`Plugin '${specifier}' exports an unsafe entrypoint.`);
      for (const path of [entry, `${entry}.js`, `${entry}.mjs`, `${entry}.cjs`, resolve(entry, 'index.js'), resolve(entry, 'index.mjs')]) {
        if (existsSync(path) && lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink()) return realpathSync(path);
      }
      throw new Error(`Plugin '${specifier}' has no executable JavaScript entrypoint.`);
    }
    const parent = resolve(directory, '..');
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`Unable to resolve plugin package '${specifier}' from '${projectRoot}'.`);
}

function pluginExportTarget(exportsValue: unknown, subpath: string): string | null | undefined {
  if (exportsValue === null) return subpath === '.' ? null : undefined;
  if (typeof exportsValue === 'string') return subpath === '.' ? exportsValue : undefined;
  if (Array.isArray(exportsValue)) { for (const item of exportsValue) { const target = pluginExportTarget(item, subpath); if (target !== undefined) return target; } return undefined; }
  if (!record(exportsValue)) return undefined;
  const keys = Object.keys(exportsValue);
  const hasSubpaths = keys.some((key) => key.startsWith('.'));
  if (!hasSubpaths) return subpath === '.' ? pluginConditionTarget(exportsValue) : undefined;
  if (Object.prototype.hasOwnProperty.call(exportsValue, subpath)) return pluginConditionTarget(exportsValue[subpath]);
  for (const pattern of keys.filter((key) => key.includes('*')).sort((a, b) => b.length - a.length)) {
    const [prefix, suffix] = pattern.split('*');
    if (prefix === undefined || suffix === undefined || !subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const capture = subpath.slice(prefix.length, subpath.length - suffix.length);
    return pluginConditionTarget(exportsValue[pattern])?.replaceAll('*', capture);
  }
  return undefined;
}
function pluginConditionTarget(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) { const target = pluginConditionTarget(item); if (target !== undefined) return target; }
    return undefined;
  }
  if (!record(value)) return undefined;
  for (const condition of ['import', 'node', 'default']) {
    const target = pluginConditionTarget(value[condition]);
    if (target !== undefined) return target;
  }
  return undefined;
}
function readJson(path: string): Record<string, unknown> {
  const stats = statSync(path);
  if (!stats.isFile() || stats.size > 1024 * 1024) throw new Error(`Plugin manifest '${path}' is invalid.`);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!record(value)) throw new Error(`Plugin manifest '${path}' must be an object.`);
  return value;
}
function stringValue(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }

function readPluginCache(root: string, manifest: PluginManifest, sourceIntegrity: string, key: string): { hit: boolean; value?: unknown } {
  const path = pluginCachePath(root, manifest, sourceIntegrity, key);
  assertNoSymlinkAncestors(realpathSync(root), path);
  if (!existsSync(path)) return { hit: false };
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.size > 2 * 1024 * 1024) return { hit: false };
  try { return { hit: true, value: JSON.parse(readFileSync(path, 'utf8')) }; } catch { return { hit: false }; }
}
function writePluginCache(root: string, manifest: PluginManifest, sourceIntegrity: string, key: string, value: unknown): void {
  const path = pluginCachePath(root, manifest, sourceIntegrity, key);
  const serialized = JSON.stringify(sortSerializable(value));
  if (serialized.length > 2 * 1024 * 1024) throw new Error(`Plugin '${manifest.name}' cache value exceeds 2 MiB.`);
  mkdirSync(dirname(path), { recursive: true });
  assertNoSymlinkAncestors(realpathSync(root), path);
  writeFileSync(path, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 });
}
function pluginCachePath(root: string, manifest: PluginManifest, sourceIntegrity: string, key: string): string {
  if (!key || key.length > 2048 || /[\0\r\n]/.test(key)) throw new Error('Plugin cache key is invalid.');
  const projectRoot = realpathSync(root);
  const digest = createHash('sha256').update(`${manifest.name}\0${manifest.version}\0${manifest.cacheVersion ?? '1'}\0${sourceIntegrity}\0${key}`).digest('hex');
  const cacheRoot = resolve(projectRoot, '.vx', 'cache', 'plugins');
  const path = resolve(cacheRoot, `${digest}.json`);
  if (path !== cacheRoot && !path.startsWith(`${cacheRoot}${sep}`)) throw new Error('Plugin cache path escaped its boundary.');
  return path;
}
function assertNoSymlinkAncestors(root: string, target: string): void {
  let current = target;
  const paths: string[] = [];
  while (current !== root) {
    paths.push(current);
    const parent = dirname(current);
    if (parent === current || !parent.startsWith(root)) break;
    current = parent;
  }
  for (const path of paths.reverse()) {
    if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Plugin cache path contains symbolic link '${path}'.`);
  }
}

function sortSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('Plugin cache cannot store non-finite numbers.'); return value; }
  if (Array.isArray(value)) return value.map((item) => sortSerializable(item, seen));
  if (!value || typeof value !== 'object') throw new TypeError('Plugin cache values must be JSON-serializable.');
  if (seen.has(value)) throw new TypeError('Plugin cache values cannot contain cycles.');
  seen.add(value);
  const recordValue = value as Record<string, unknown>;
  const output = Object.fromEntries(Object.keys(recordValue).sort().map((key) => [key, sortSerializable(recordValue[key], seen)]));
  seen.delete(value);
  return output;
}
function validatePluginOptions(value: Record<string, unknown> | undefined): void {
  if (value === undefined) return;
  const serialized = JSON.stringify(sortSerializable(value));
  if (serialized.length > 1024 * 1024) throw new Error('Plugin options exceed 1 MiB.');
}

function validTimeout(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 1 || value > 120_000) throw new TypeError(`${label} timeout must be between 1 and 120000ms.`);
  return value;
}

function waitForReady(worker: Worker, timeoutMs: number): Promise<{ name: string; manifest: PluginManifest }> {
  const ready = new Promise<{ name: string; manifest: PluginManifest }>((resolveReady, reject) => {
    const onMessage = (message: unknown): void => {
      if (!record(message)) return;
      if (message['type'] === 'fatal') { cleanup(); reject(new Error(String(message['error'] ?? 'Plugin sandbox failed.'))); }
      else if (message['type'] === 'ready' && typeof message['name'] === 'string' && record(message['manifest'])) { cleanup(); resolveReady({ name: message['name'], manifest: message['manifest'] as unknown as PluginManifest }); }
    };
    const onError = (error: Error): void => { cleanup(); reject(error); };
    const cleanup = (): void => { worker.off('message', onMessage); worker.off('error', onError); };
    worker.on('message', onMessage); worker.on('error', onError);
  });
  return withTimeout(ready, timeoutMs, () => worker.terminate(), 'Plugin sandbox initialization');
}
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void | Promise<number>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { void onTimeout(); reject(new Error(`${label} timed out after ${timeoutMs}ms.`)); }, timeoutMs); });
  try { return await Promise.race([promise, timeout]); } finally { if (timer) clearTimeout(timer); }
}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
