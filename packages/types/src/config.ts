// Config and Integrations
export type OfficialAdapterName =
  | 'node'
  | 'node-standalone'
  | 'docker'
  | 'static'
  | 'cloudflare-workers'
  | 'cloudflare-pages'
  | 'vercel'
  | 'netlify'
  | 'aws-lambda'
  | 'serverless'
  | 'generic-serverless'
  | 'bun'
  | 'deno'
  | 'edge'
  | 'edge-runtime';
export type AdapterName = OfficialAdapterName | (string & {});
export interface AdapterConfig {
  name: AdapterName;
  options?: Readonly<Record<string, unknown>>;
}
export type BuildMode = 'development' | 'production';
export type BuildTarget = 'browser' | 'server' | 'edge' | 'static' | 'library';
export type SourceMapPolicy = false | 'hidden' | 'linked' | 'inline';
export interface ChunkPolicyConfig {
  maxInitialBytes?: number;
  maxAsyncBytes?: number;
  maxChunkBytes?: number;
  maxChunkCount?: number;
  minimumSharedBytes?: number;
  enforce?: boolean;
}
export interface DependencyOptimizationConfig {
  enabled?: boolean;
  include?: readonly string[];
  exclude?: readonly string[];
  force?: boolean;
}
export interface ResponsiveImageBuildConfig {
  source: string;
  widths: readonly number[];
  formats?: readonly ('avif' | 'webp' | 'png' | 'jpeg')[];
  quality?: number;
}
export interface AssetBuildConfig {
  publicDir?: string;
  publicAssetMode?: 'preserve' | 'hashed' | 'both';
  inlineLimitBytes?: number;
  integrity?: 'sha256' | 'sha384' | 'sha512' | false;
  preload?: boolean;
  prefetch?: boolean;
  optimize?: boolean;
  responsiveImages?: readonly ResponsiveImageBuildConfig[];
}
export interface LibraryBuildConfig {
  entry?: string | readonly string[];
  name?: string;
  formats?: readonly ('es' | 'cjs')[];
  fileName?: string;
  external?: readonly string[];
}
export interface BuildConfig {
  mode?: BuildMode;
  targets?: readonly BuildTarget[];
  sourceMaps?: SourceMapPolicy;
  incremental?: boolean;
  deterministic?: boolean;
  reproducible?: boolean;
  bundleAnalysis?: boolean;
  chunkPolicy?: ChunkPolicyConfig;
  dependencyOptimization?: DependencyOptimizationConfig;
  assets?: AssetBuildConfig;
  library?: LibraryBuildConfig;
}

export interface IntegrationRef {
  name: string;
  options?: Record<string, unknown>;
}

export interface PluginPolicyConfig {
  allowedCapabilities?: readonly PluginCapability[];
  allowedPermissions?: readonly PluginPermission[];
  publicKeys?: Readonly<Record<string, string>>;
  requireSignatures?: boolean;
  defaultTimeoutMs?: number;
}

export interface VXConfig {
  root: string;
  srcDir: string;
  outDir: string;
  adapter: AdapterName | AdapterConfig;
  integrations: IntegrationRef[];
  build?: BuildConfig;
  plugins?: PluginPolicyConfig;
  experimental?: Record<string, boolean>;
}

export interface AdapterRegistration {
  name: string;
  module: string;
}

export type PluginApiVersion = '1';
export type PluginCapability = 'config' | 'view-transform' | 'route-middleware' | 'build' | 'emit-file' | 'adapter';
export type PluginPermission = 'read-project' | 'write-output';
export type PluginHookName = 'configResolved' | 'devServerStart' | 'buildStart' | 'buildEnd' | 'close';

export interface PluginManifest {
  name: string;
  version: string;
  apiVersion: PluginApiVersion;
  capabilities: readonly PluginCapability[];
  permissions: readonly PluginPermission[];
  deterministic: boolean;
  timeoutMs?: number;
  cacheVersion?: string;
  integrity?: string;
  signatureAlgorithm?: 'ed25519';
  signature?: string;
  signer?: string;
}

export interface PluginDiagnostic {
  plugin: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestion?: string;
}

export interface PluginHookContext {
  root: string;
  outDir?: string;
  mode?: BuildMode;
  targets?: readonly BuildTarget[];
  adapter?: string;
  signal: AbortSignal;
  metadata: Readonly<Record<string, unknown>>;
}

export type PluginHook = (context: PluginHookContext) => void | Promise<void>;

export interface IntegrationContext {
  root: string;
  addRouteMiddleware(identifier: string): void;
  transformView(identifier: string): void;
  registerAdapter(adapter: AdapterRegistration): void;
  registerHook(name: PluginHookName, hook: PluginHook): void;
  addDiagnostic(diagnostic: Omit<PluginDiagnostic, 'plugin'>): void;
  emitFile(relativePath: string, content: string | Uint8Array): void;
  readProjectFile(relativePath: string): Promise<string>;
  cache<T>(key: string, factory: () => T | Promise<T>): Promise<T>;
}

export interface Integration {
  name: string;
  manifest?: PluginManifest;
  setup(context: IntegrationContext): void | Promise<void>;
  dispose?(): void | Promise<void>;
}
