import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import type {
  AdapterRegistration, Integration, IntegrationContext, PluginCapability, PluginDiagnostic,
  PluginHook, PluginHookContext, PluginHookName, PluginManifest, PluginPermission
} from '@vx/types';
import { isolatedIntegrationMetadata } from './isolation.js';

export interface PluginHostPolicy {
  allowedCapabilities?: readonly PluginCapability[];
  allowedPermissions?: readonly PluginPermission[];
  publicKeys?: Readonly<Record<string, string>>;
  requireSignatures?: boolean;
  defaultTimeoutMs?: number;
  allowInProcess?: boolean;
  maxDiagnostics?: number;
  maxEmittedBytes?: number;
  cacheDirectory?: string;
}

export interface PluginExecutionContext extends Omit<PluginHookContext, 'signal' | 'metadata'> { metadata?: Readonly<Record<string, unknown>>; }
interface RegisteredHook { manifest: PluginManifest; hook: PluginHook; timeoutMs: number; }
interface EmittedFile { bytes: Uint8Array; plugin: string; }

const DEFAULT_CAPABILITIES: readonly PluginCapability[] = ['config', 'view-transform', 'route-middleware', 'build', 'emit-file', 'adapter'];
const DEFAULT_PERMISSIONS: readonly PluginPermission[] = ['read-project', 'write-output'];
const INTEGRITY = /^(?:sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}$/;
const SECRET_SEGMENTS = new Set(['.git', '.ssh', '.gnupg', 'node_modules']);
const SECRET_FILES = /^(?:\.env(?:\..+)?|\.npmrc|\.yarnrc(?:\.yml)?|\.pypirc|credentials(?:\.json)?|.*\.(?:pem|key|p12|pfx))$/i;

export class PluginHost implements IntegrationContext {
  readonly routeMiddlewares: string[] = [];
  readonly viewTransformers: string[] = [];
  readonly diagnostics: PluginDiagnostic[] = [];
  readonly installed: PluginManifest[] = [];
  adapter?: AdapterRegistration;
  #active: PluginManifest | undefined;
  readonly #hooks = new Map<PluginHookName, RegisteredHook[]>();
  readonly #memoryCache = new Map<string, Promise<unknown>>();
  readonly #emitted = new Map<string, EmittedFile>();
  readonly #disposers: Array<() => void | Promise<void>> = [];
  readonly #policy: Required<Pick<PluginHostPolicy, 'requireSignatures' | 'defaultTimeoutMs' | 'allowInProcess' | 'maxDiagnostics' | 'maxEmittedBytes' | 'cacheDirectory'>> & PluginHostPolicy;
  #emittedBytes = 0;

  constructor(readonly root: string, policy: PluginHostPolicy = {}) {
    this.#policy = {
      ...policy,
      requireSignatures: policy.requireSignatures ?? false,
      defaultTimeoutMs: bounded(policy.defaultTimeoutMs ?? 10_000, 1, 120_000, 'defaultTimeoutMs'),
      allowInProcess: policy.allowInProcess ?? false,
      maxDiagnostics: bounded(policy.maxDiagnostics ?? 2_000, 1, 100_000, 'maxDiagnostics'),
      maxEmittedBytes: bounded(policy.maxEmittedBytes ?? 64 * 1024 * 1024, 1, 1024 * 1024 * 1024, 'maxEmittedBytes'),
      cacheDirectory: policy.cacheDirectory ?? '.vx/cache/plugins'
    };
  }

  async install(plugin: Integration): Promise<void> {
    const isolated = isolatedIntegrationMetadata(plugin);
    if (!isolated && !this.#policy.allowInProcess) throw new Error(`VX plugin '${plugin.name}' must run through loadIsolatedIntegration(). Use installTrusted() only for audited first-party code.`);
    await this.installWithFailureDisposal(plugin, isolated?.sourceIntegrity);
  }

  async installTrusted(plugin: Integration): Promise<void> { await this.installWithFailureDisposal(plugin, undefined); }

  async runHook(name: PluginHookName, context: PluginExecutionContext): Promise<void> {
    const failures: unknown[] = [];
    for (const entry of this.#hooks.get(name) ?? []) {
      const controller = new AbortController();
      const hookContext: PluginHookContext = {
        root: context.root,
        ...(context.outDir ? { outDir: context.outDir } : {}),
        ...(context.mode ? { mode: context.mode } : {}),
        ...(context.targets ? { targets: Object.freeze([...context.targets]) } : {}),
        ...(context.adapter ? { adapter: context.adapter } : {}),
        signal: controller.signal,
        metadata: freezeSerializable(context.metadata ?? {})
      };
      this.#active = entry.manifest;
      try { await this.withTimeout(Promise.resolve(entry.hook(hookContext)), entry.timeoutMs, entry.manifest.name, name, controller); }
      catch (cause) {
        this.pushDiagnostic({ plugin: entry.manifest.name, code: 'VX_PLUGIN_HOOK_FAILED', severity: 'error', message: `Plugin hook '${name}' failed: ${message(cause)}` });
        if (name !== 'close') throw cause;
        failures.push(cause);
      } finally { this.#active = undefined; }
    }
    if (name === 'buildEnd' && context.outDir) this.flushEmittedFiles(context.outDir);
    if (name === 'close') {
      for (const dispose of this.#disposers.splice(0).reverse()) {
        try { await dispose(); }
        catch (cause) { failures.push(cause); this.pushDiagnostic({ plugin: 'vx:host', code: 'VX_PLUGIN_DISPOSE_FAILED', severity: 'error', message: `Plugin disposal failed: ${message(cause)}` }); }
      }
      this.#memoryCache.clear();
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, `VX plugin lifecycle '${name}' failed.`);
  }

  addRouteMiddleware(identifier: string): void {
    this.requireCapability('route-middleware');
    const normalized = safeIdentifier(identifier, 'Route middleware');
    if (!this.routeMiddlewares.includes(normalized)) this.routeMiddlewares.push(normalized);
  }
  transformView(identifier: string): void {
    this.requireCapability('view-transform');
    const normalized = safeIdentifier(identifier, 'View transformer');
    if (!this.viewTransformers.includes(normalized)) this.viewTransformers.push(normalized);
  }
  registerAdapter(adapter: AdapterRegistration): void {
    this.requireCapability('adapter');
    if (!adapter || !safeIdentifier(adapter.name, 'Adapter name') || !safeModuleSpecifier(adapter.module)) throw new TypeError('Plugin adapter registration is invalid.');
    if (this.adapter) throw new Error(`Adapter '${this.adapter.name}' is already registered.`);
    this.adapter = Object.freeze({ ...adapter });
  }
  registerHook(name: PluginHookName, hook: PluginHook): void {
    this.requireCapability('build');
    if (typeof hook !== 'function') throw new TypeError(`Plugin hook '${name}' must be callable.`);
    const plugin = this.requireActive();
    const hooks = this.#hooks.get(name) ?? [];
    if (hooks.length >= 256) throw new Error(`Plugin lifecycle '${name}' exceeds the hook limit.`);
    hooks.push({ manifest: plugin, hook, timeoutMs: plugin.timeoutMs ?? this.#policy.defaultTimeoutMs });
    this.#hooks.set(name, hooks);
  }
  addDiagnostic(diagnostic: Omit<PluginDiagnostic, 'plugin'>): void {
    const plugin = this.requireActive();
    validateDiagnostic(diagnostic);
    this.pushDiagnostic({ plugin: plugin.name, ...diagnostic });
  }
  emitFile(relativePath: string, content: string | Uint8Array): void {
    this.requireCapability('emit-file'); this.requirePermission('write-output');
    const plugin = this.requireActive();
    const normalized = safeRelativePath(relativePath);
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : Uint8Array.from(content);
    if (bytes.byteLength > 32 * 1024 * 1024) throw new Error(`Plugin output '${normalized}' exceeds 32 MiB.`);
    const existing = this.#emitted.get(normalized);
    if (existing && !equal(existing.bytes, bytes)) throw new Error(`Plugins '${existing.plugin}' and '${plugin.name}' emitted different content for '${normalized}'.`);
    if (!existing) {
      if (this.#emittedBytes + bytes.byteLength > this.#policy.maxEmittedBytes) throw new Error(`Plugin outputs exceed ${this.#policy.maxEmittedBytes} bytes.`);
      this.#emittedBytes += bytes.byteLength;
      this.#emitted.set(normalized, { bytes, plugin: plugin.name });
    }
  }
  async readProjectFile(relativePath: string): Promise<string> {
    this.requirePermission('read-project');
    const normalized = safeProjectReadPath(relativePath);
    const projectRoot = canonicalRoot(this.root);
    const target = resolve(projectRoot, normalized);
    assertWithin(target, projectRoot, `Plugin read path '${relativePath}' escapes the project root.`);
    if (!existsSync(target)) throw new Error(`Plugin read target '${relativePath}' does not exist.`);
    const stats = lstatSync(target);
    if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Plugin read target '${relativePath}' must be a regular file.`);
    const real = realpathSync(target);
    assertWithin(real, projectRoot, `Plugin read target '${relativePath}' resolves outside the project root.`);
    if (statSync(real).size > 8 * 1024 * 1024) throw new Error(`Plugin read target '${relativePath}' exceeds 8 MiB.`);
    return readFileSync(real, 'utf8');
  }
  cache<T>(key: string, factory: () => T | Promise<T>): Promise<T> {
    const plugin = this.requireActive();
    if (!plugin.deterministic) return Promise.resolve(factory());
    if (!key || key.length > 2048 || /[\0\r\n]/.test(key)) throw new TypeError('Plugin cache key is invalid.');
    const scoped = cacheKey(plugin, key);
    const existing = this.#memoryCache.get(scoped);
    if (existing) return existing as Promise<T>;
    const value = this.loadOrCreateCache(plugin, scoped, factory);
    this.#memoryCache.set(scoped, value);
    value.catch(() => this.#memoryCache.delete(scoped));
    return value;
  }

  private async installWithFailureDisposal(plugin: Integration, sourceIntegrity: string | undefined): Promise<void> {
    try { await this.installInternal(plugin, sourceIntegrity); }
    catch (cause) {
      if (!plugin.dispose) throw cause;
      try { await Promise.resolve(plugin.dispose()); }
      catch (disposeCause) {
        throw new AggregateError([cause, disposeCause], `Plugin '${plugin.name}' installation and disposal both failed.`);
      }
      throw cause;
    }
  }

  private async installInternal(plugin: Integration, sourceIntegrity: string | undefined): Promise<void> {
    const manifest = plugin.manifest ?? legacyManifest(plugin.name);
    validateManifest(manifest);
    this.assertPolicy(manifest);
    if (manifest.integrity && sourceIntegrity && !constantEqual(manifest.integrity, sourceIntegrity)) throw new Error(`Plugin '${manifest.name}' source integrity does not match its signed manifest.`);
    if (manifest.signature && !sourceIntegrity) throw new Error(`Signed plugin '${manifest.name}' must be loaded through the isolated module loader.`);
    this.verifyManifestSignature(manifest);
    if (this.installed.some((item) => item.name === manifest.name)) throw new Error(`VX plugin '${manifest.name}' is already installed.`);
    this.#active = manifest;
    try { await this.withTimeout(Promise.resolve(plugin.setup(this)), manifest.timeoutMs ?? this.#policy.defaultTimeoutMs, manifest.name, 'setup'); }
    finally { this.#active = undefined; }
    if (plugin.dispose) this.#disposers.push(() => plugin.dispose!());
    this.installed.push(freezeManifest(manifest));
  }

  private async loadOrCreateCache<T>(plugin: PluginManifest, scoped: string, factory: () => T | Promise<T>): Promise<T> {
    const path = this.cachePath(scoped);
    if (existsSync(path)) {
      try {
        const stats = lstatSync(path);
        if (!stats.isSymbolicLink() && stats.isFile() && stats.size <= 2 * 1024 * 1024) return JSON.parse(readFileSync(path, 'utf8')) as T;
      } catch { /* rebuild corrupted cache */ }
    }
    const value = await factory();
    const serialized = stableJson(value);
    if (serialized.length > 2 * 1024 * 1024) throw new Error(`Plugin '${plugin.name}' cache value exceeds 2 MiB.`);
    mkdirSync(dirname(path), { recursive: true });
    assertNoSymlinkAncestors(canonicalRoot(this.root), path);
    writeFileSync(path, `${serialized}\n`, { encoding: 'utf8', mode: 0o600 });
    return value;
  }
  private cachePath(scoped: string): string {
    const root = canonicalRoot(this.root);
    const cacheRoot = resolve(root, this.#policy.cacheDirectory);
    assertWithin(cacheRoot, root, 'Plugin cache directory must stay inside the project root.');
    return resolve(cacheRoot, `${scoped}.json`);
  }
  private flushEmittedFiles(outDir: string): void {
    const projectRoot = canonicalRoot(this.root);
    const outputRoot = resolve(projectRoot, outDir);
    assertWithin(outputRoot, projectRoot, 'Plugin build output must stay inside the project root.');
    for (const [relativePath, emitted] of this.#emitted) {
      const target = resolve(outputRoot, relativePath);
      assertWithin(target, outputRoot, `Plugin output '${relativePath}' escapes the build directory.`);
      assertNoSymlinkAncestors(projectRoot, target);
      if (existsSync(target) && lstatSync(target).isSymbolicLink()) throw new Error(`Plugin output '${relativePath}' targets a symbolic link.`);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, emitted.bytes, { mode: 0o644 });
    }
    this.#emitted.clear(); this.#emittedBytes = 0;
  }
  private assertPolicy(manifest: PluginManifest): void {
    const capabilities = new Set(this.#policy.allowedCapabilities ?? DEFAULT_CAPABILITIES);
    const permissions = new Set(this.#policy.allowedPermissions ?? DEFAULT_PERMISSIONS);
    for (const capability of manifest.capabilities) if (!capabilities.has(capability)) throw new Error(`Plugin '${manifest.name}' capability '${capability}' is not allowed.`);
    for (const permission of manifest.permissions) if (!permissions.has(permission)) throw new Error(`Plugin '${manifest.name}' permission '${permission}' is not allowed.`);
    if (this.#policy.requireSignatures && (!manifest.signature || !manifest.signer || !manifest.integrity)) throw new Error(`Plugin '${manifest.name}' must be signed and include source integrity.`);
  }
  private verifyManifestSignature(manifest: PluginManifest): void {
    if (!manifest.signature && !manifest.signer && !manifest.signatureAlgorithm) return;
    if (!manifest.signature || !manifest.signer || !manifest.integrity || (manifest.signatureAlgorithm ?? 'ed25519') !== 'ed25519') throw new Error(`Plugin '${manifest.name}' has incomplete signature metadata.`);
    const publicKey = this.#policy.publicKeys?.[manifest.signer];
    if (!publicKey) throw new Error(`Plugin signer '${manifest.signer}' is not trusted.`);
    const signature = Buffer.from(manifest.signature, 'base64');
    if (signature.length !== 64) throw new Error(`Plugin '${manifest.name}' signature has an invalid length.`);
    const valid = verify(null, new TextEncoder().encode(canonicalManifest(manifest)), createPublicKey(publicKey), signature);
    if (!valid) throw new Error(`Plugin '${manifest.name}' signature is invalid.`);
  }
  private requireCapability(capability: PluginCapability): void { const plugin = this.requireActive(); if (!plugin.capabilities.includes(capability)) throw new Error(`Plugin '${plugin.name}' did not declare capability '${capability}'.`); }
  private requirePermission(permission: PluginPermission): void { const plugin = this.requireActive(); if (!plugin.permissions.includes(permission)) throw new Error(`Plugin '${plugin.name}' did not declare permission '${permission}'.`); }
  private requireActive(): PluginManifest { if (!this.#active) throw new Error('Plugin API can only be used during setup or an active lifecycle hook.'); return this.#active; }
  private pushDiagnostic(diagnostic: PluginDiagnostic): void { if (this.diagnostics.length >= this.#policy.maxDiagnostics) throw new Error(`Plugin diagnostics exceed ${this.#policy.maxDiagnostics} entries.`); this.diagnostics.push(Object.freeze({ ...diagnostic })); }
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, plugin: string, stage: string, controller?: AbortController): Promise<T> {
    const timeout = bounded(timeoutMs, 1, 120_000, `Plugin '${plugin}' timeout`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller?.abort(new Error(`Plugin '${plugin}' ${stage} timed out.`)); reject(new Error(`Plugin '${plugin}' ${stage} timed out after ${timeout}ms.`)); }, timeout); });
    try { return await Promise.race([promise, deadline]); } finally { if (timer) clearTimeout(timer); }
  }
}

export function canonicalPluginManifest(manifest: PluginManifest): string { return canonicalManifest(manifest); }

function safeProjectReadPath(value: string): string {
  if (!value || value.length > 4096 || value.includes('\0') || value.includes('\\') || value.startsWith('/') || value.split('/').includes('..')) throw new Error(`Unsafe plugin read path '${value}'.`);
  const segments = value.split('/');
  if (segments.some((segment) => SECRET_SEGMENTS.has(segment)) || SECRET_FILES.test(segments.at(-1) ?? '')) throw new Error(`Plugin read path '${value}' targets protected project data.`);
  return value.replace(/^\.\//, '');
}
function legacyManifest(name: string): PluginManifest { return { name, version: '0.0.0-legacy', apiVersion: '1', capabilities: ['config'], permissions: [], deterministic: false }; }
function validateManifest(manifest: PluginManifest): void {
  if (manifest.apiVersion !== '1') throw new Error(`Plugin '${manifest.name}' uses unsupported API version '${String(manifest.apiVersion)}'.`);
  if (!/^(?:@[a-z0-9._-]+\/[a-z0-9._-]+|[a-z0-9][a-z0-9._-]*)$/.test(manifest.name)) throw new Error(`Invalid plugin name '${manifest.name}'.`);
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.version)) throw new Error(`Plugin '${manifest.name}' has invalid version '${manifest.version}'.`);
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length) throw new Error(`Plugin '${manifest.name}' declares duplicate capabilities.`);
  if (new Set(manifest.permissions).size !== manifest.permissions.length) throw new Error(`Plugin '${manifest.name}' declares duplicate permissions.`);
  if (manifest.integrity !== undefined && !INTEGRITY.test(manifest.integrity)) throw new Error(`Plugin '${manifest.name}' has invalid source integrity.`);
  if (manifest.cacheVersion !== undefined && (!manifest.cacheVersion.trim() || manifest.cacheVersion.length > 128 || /[\0\r\n]/.test(manifest.cacheVersion))) throw new Error(`Plugin '${manifest.name}' has invalid cacheVersion.`);
  if ((manifest.signature === undefined) !== (manifest.signer === undefined)) throw new Error(`Plugin '${manifest.name}' has incomplete signature metadata.`);
}
function canonicalManifest(manifest: PluginManifest): string {
  const { signature: _signature, ...unsigned } = manifest;
  return JSON.stringify(sort({ ...unsigned, capabilities: [...manifest.capabilities].sort(), permissions: [...manifest.permissions].sort(), signatureAlgorithm: manifest.signatureAlgorithm ?? (manifest.signer ? 'ed25519' : undefined) }));
}
function freezeManifest(manifest: PluginManifest): PluginManifest { return Object.freeze({ ...manifest, capabilities: Object.freeze([...manifest.capabilities]), permissions: Object.freeze([...manifest.permissions]) }); }
function cacheKey(plugin: PluginManifest, key: string): string { return createHash('sha256').update(`${plugin.name}\0${plugin.version}\0${plugin.cacheVersion ?? '1'}\0${plugin.integrity ?? 'unsigned'}\0${key}`).digest('hex'); }
function stableJson(value: unknown): string { return JSON.stringify(sortSerializable(value)); }
function sortSerializable(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError('Plugin cache values cannot contain non-finite numbers.'); return value; }
  if (Array.isArray(value)) return value.map((item) => sortSerializable(item, seen));
  if (!value || typeof value !== 'object' || value instanceof Uint8Array) throw new TypeError('Plugin cache values must be JSON-serializable.');
  if (seen.has(value)) throw new TypeError('Plugin cache values cannot contain cycles.');
  seen.add(value);
  const output = Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => [key, sortSerializable((value as Record<string, unknown>)[key], seen)]));
  seen.delete(value);
  return output;
}
function freezeSerializable<T extends Readonly<Record<string, unknown>>>(value: T): T { return Object.freeze(sortSerializable(value) as T); }
function sort(value: unknown): unknown { if (Array.isArray(value)) return value.map(sort); if (!value || typeof value !== 'object') return value; const record = value as Record<string, unknown>; return Object.fromEntries(Object.keys(record).sort().filter((key) => record[key] !== undefined).map((key) => [key, sort(record[key])])); }
function safeRelativePath(value: string): string { const normalized = value.replaceAll('\\', '/').replace(/^\.\//, ''); if (!normalized || normalized.length > 4096 || normalized.startsWith('/') || normalized.split('/').includes('..') || /[\0\r\n]/.test(normalized)) throw new Error(`Unsafe plugin output path '${value}'.`); return normalized; }
function safeIdentifier(value: string, label: string): string { const normalized = value.trim(); if (!normalized || normalized.length > 512 || /[\0\r\n]/.test(normalized)) throw new TypeError(`${label} identifier is invalid.`); return normalized; }
function safeModuleSpecifier(value: string): boolean { return Boolean(value) && value.length <= 2048 && !/[\0\r\n\\]/.test(value) && !/^(?:https?|data|file):/.test(value); }
function validateDiagnostic(value: Omit<PluginDiagnostic, 'plugin'>): void { if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(value.code) || !value.message.trim() || value.message.length > 4096 || /[\0]/.test(value.message) || (value.suggestion !== undefined && (!value.suggestion.trim() || value.suggestion.length > 4096))) throw new TypeError('Plugin diagnostic is invalid.'); }
function canonicalRoot(root: string): string { const resolved = resolve(root); return existsSync(resolved) ? realpathSync(resolved) : resolved; }
function assertWithin(path: string, root: string, error: string): void { if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error(error); }
function assertNoSymlinkAncestors(root: string, target: string): void { let current = target; const paths: string[] = []; while (current !== root) { paths.push(current); const parent = dirname(current); if (parent === current || !parent.startsWith(root)) break; current = parent; } for (const path of paths.reverse()) if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Plugin path contains symbolic link '${path}'.`); }
function bounded(value: number, min: number, max: number, label: string): number { if (!Number.isSafeInteger(value) || value < min || value > max) throw new TypeError(`${label} must be between ${min} and ${max}.`); return value; }
function equal(left: Uint8Array, right: Uint8Array): boolean { return left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right)); }
function constantEqual(left: string, right: string): boolean { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
function message(value: unknown): string { return value instanceof Error ? value.message : String(value); }
