export type RouteParameterKind = 'string' | 'integer' | 'number' | 'boolean' | 'uuid' | 'slug' | 'path';
export type RouteRenderPolicy = 'client' | 'server' | 'static';
export type RoutePreloadPolicy = 'none' | 'intent' | 'visible' | 'eager';
export type RouteHydrationPolicy = 'full' | 'islands' | 'none';
export type RouteStreamingPolicy = 'blocking' | 'stream';
export type RouteGenerationMode = 'dynamic' | 'static' | 'incremental';
export type RouteModuleKind = 'page' | 'layout' | 'loading' | 'error' | 'not-found' | 'endpoint' | 'loader' | 'middleware';
export type RouteTrailingSlashPolicy = 'preserve' | 'always' | 'never';
export type RouteNavigationKind = 'push' | 'replace' | 'pop' | 'reload';

export interface RouteParameter {
  name: string;
  kind: RouteParameterKind;
  catchAll: boolean;
  optional: boolean;
  source: string;
}

export interface RouteSegment {
  kind: 'static' | 'parameter' | 'catch-all';
  value: string;
  parameter?: RouteParameter;
}

export interface RouteSearchParameter {
  name: string;
  kind: Exclude<RouteParameterKind, 'path'>;
  required: boolean;
  repeat: boolean;
  defaultValue?: string | number | boolean;
}

export interface RouteAlternateLanguage {
  language: string;
  href: string;
}

export interface RouteOpenGraphMetadata {
  title?: string;
  description?: string;
  type?: string;
  url?: string;
  siteName?: string;
  locale?: string;
  images?: readonly string[];
}

export interface RouteTwitterMetadata {
  card?: 'summary' | 'summary_large_image' | 'app' | 'player';
  site?: string;
  creator?: string;
  title?: string;
  description?: string;
  images?: readonly string[];
}

export interface RouteMetadata {
  title?: string;
  titleTemplate?: string;
  description?: string;
  language?: string;
  robots?: string;
  canonical?: string;
  image?: string;
  alternates?: readonly RouteAlternateLanguage[];
  openGraph?: RouteOpenGraphMetadata;
  twitter?: RouteTwitterMetadata;
  structuredData?: Readonly<Record<string, unknown>> | readonly Readonly<Record<string, unknown>>[];
  custom?: Readonly<Record<string, string>>;
}

export interface RouteRedirect {
  to: string;
  status: 301 | 302 | 303 | 307 | 308;
  replace: boolean;
}

export interface RoutePreservationPolicy {
  state: boolean;
  scroll: boolean;
  focus: boolean;
}

export interface RouteNavigationPolicy {
  trailingSlash: RouteTrailingSlashPolicy;
  caseSensitive: boolean;
  announce: boolean;
  viewTransition: boolean;
}

export interface RouteGenerationPolicy {
  mode: RouteGenerationMode;
  revalidateSeconds?: number;
  entries: readonly Readonly<Record<string, string | number | boolean>>[];
}

export interface RoutePolicy {
  render: RouteRenderPolicy;
  preload: RoutePreloadPolicy;
  hydration: RouteHydrationPolicy;
  streaming: RouteStreamingPolicy;
  generation: RouteGenerationPolicy;
  metadata: RouteMetadata;
  preserve: RoutePreservationPolicy;
  navigation?: RouteNavigationPolicy;
  search?: readonly RouteSearchParameter[];
  redirect?: RouteRedirect;
}

export interface RouteDataDeclaration {
  name: string;
  side: 'client' | 'server' | 'universal';
  modulePath: string;
}

export interface RouteActionDeclaration {
  name: string;
  side: 'client' | 'server' | 'universal';
  modulePath: string;
}

export interface RouteFormDeclaration {
  name: string;
  modulePath: string;
}

export interface RouteLoaderDeclaration {
  modulePath: string;
  scope: 'layout' | 'page';
}

export interface RouteMiddlewareDeclaration {
  modulePath: string;
  scope: 'application' | 'group' | 'route';
}

export interface RouteBoundaryPaths {
  loading?: string;
  error?: string;
  notFound?: string;
}

export interface RouteRecord {
  id: string;
  name?: string;
  path: string;
  segments: RouteSegment[];
  parameters: RouteParameter[];
  pagePath?: string;
  layoutPaths: string[];
  loaderPaths?: RouteLoaderDeclaration[];
  middlewarePaths?: RouteMiddlewareDeclaration[];
  boundaries: RouteBoundaryPaths;
  policy: RoutePolicy;
  queries: RouteDataDeclaration[];
  actions: RouteActionDeclaration[];
  forms?: RouteFormDeclaration[];
  score: number;
}

export type EndpointMethod = 'DELETE' | 'GET' | 'HEAD' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT';

export interface EndpointRecord {
  id: string;
  path: string;
  segments: RouteSegment[];
  parameters: RouteParameter[];
  modulePath: string;
  middlewarePaths?: RouteMiddlewareDeclaration[];
  methods: EndpointMethod[];
  score: number;
}

export type RouteDiagnosticSeverity = 'error' | 'warning';

export interface RouteDiagnostic {
  code: string;
  severity: RouteDiagnosticSeverity;
  message: string;
  filePath: string;
  suggestion?: string;
}

export interface ApplicationGraph {
  version: 1;
  rootDir: string;
  pagesDir: string;
  routes: RouteRecord[];
  endpoints: EndpointRecord[];
  diagnostics: RouteDiagnostic[];
}

export interface VXRouteComponentInstance {
  node: DocumentFragment;
  ctx: Record<string, unknown>;
  mount?(): void;
  dispose(): void;
}

export interface VXRouteComponentModule {
  createComponent?: (
    props?: Readonly<Record<string, unknown>>,
    runtime?: Readonly<Record<string, unknown>>,
    outputs?: Readonly<Record<string, unknown>>,
    content?: Readonly<Record<string, unknown>>
  ) => VXRouteComponentInstance;
  setup?: (
    props?: Readonly<Record<string, unknown>>,
    runtime?: Readonly<Record<string, unknown>>,
    outputs?: Readonly<Record<string, unknown>>
  ) => Record<string, unknown>;
}

export interface RouteLoaderContext {
  location: RouteLocation;
  params: Readonly<Record<string, unknown>>;
  search: Readonly<Record<string, unknown>>;
  parentData: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
  request?: Request;
  locals?: Readonly<Record<string, unknown>>;
  runtime?: object;
}

export interface RouteLoaderModule {
  load?: (context: RouteLoaderContext) => unknown | Promise<unknown>;
}

export interface RouteMiddlewareContext {
  request?: Request;
  location: RouteLocation;
  params: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
  locals?: Readonly<Record<string, unknown>>;
  runtime?: object;
  data?: Readonly<Record<string, unknown>>;
}

export type RouteMiddlewareResult = void | boolean | Response | RouteRedirectResult;
export interface RouteRedirectResult { redirect: string; status?: 301 | 302 | 303 | 307 | 308; replace?: boolean; }
export type RouteMiddleware = (context: RouteMiddlewareContext, next: () => Promise<RouteMiddlewareResult>) => RouteMiddlewareResult | Promise<RouteMiddlewareResult>;
export interface RouteMiddlewareModule { middleware?: RouteMiddleware; default?: RouteMiddleware; }

export interface RuntimeRouteRecord extends RouteRecord {
  loadPage?: () => Promise<VXRouteComponentModule>;
  loadLayouts: Array<() => Promise<VXRouteComponentModule>>;
  loadLoaders?: Array<() => Promise<RouteLoaderModule>>;
  loadMiddleware?: Array<() => Promise<RouteMiddlewareModule>>;
  loadLoading?: () => Promise<VXRouteComponentModule>;
  loadError?: () => Promise<VXRouteComponentModule>;
  loadNotFound?: () => Promise<VXRouteComponentModule>;
}

export interface RuntimeEndpointRecord extends EndpointRecord {
  load: () => Promise<Record<string, unknown>>;
  loadMiddleware?: Array<() => Promise<RouteMiddlewareModule>>;
}

export interface VXServerRouteComponentModule {
  __vxComponent?: Readonly<{ id: string; interactive: boolean }>;
  renderComponent?: (
    props: Readonly<Record<string, unknown>>,
    context: unknown,
    content?: Readonly<Record<string, unknown>>
  ) => string | Promise<string>;
}

export interface RuntimeServerRouteRecord extends RouteRecord {
  loadPage?: () => Promise<VXServerRouteComponentModule>;
  loadLayouts: Array<() => Promise<VXServerRouteComponentModule>>;
  loadLoaders?: Array<() => Promise<RouteLoaderModule>>;
  loadMiddleware?: Array<() => Promise<RouteMiddlewareModule>>;
  loadLoading?: () => Promise<VXServerRouteComponentModule>;
  loadError?: () => Promise<VXServerRouteComponentModule>;
  loadNotFound?: () => Promise<VXServerRouteComponentModule>;
}

export interface RuntimeServerEndpointRecord extends EndpointRecord {
  load: () => Promise<Record<string, unknown>>;
  loadMiddleware?: Array<() => Promise<RouteMiddlewareModule>>;
}

export interface RouteLocation<TParams extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
  id: string;
  name?: string;
  path: string;
  pathname: string;
  search: URLSearchParams;
  searchValues?: Readonly<Record<string, unknown>>;
  hash: string;
  params: TParams;
  url: URL;
}

export interface NavigationSnapshot {
  key: string;
  scrollX: number;
  scrollY: number;
  focusedId?: string;
  selectionStart?: number;
  selectionEnd?: number;
}

export interface RouteReference<TParams extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
  id: string;
  name: string;
  path: string;
  build(params?: TParams, options?: RouteHrefOptions): string;
}

export interface RouteHrefOptions {
  query?: Readonly<Record<string, string | number | boolean | readonly (string | number | boolean)[] | undefined>>;
  hash?: string;
}

export interface RouteCatalog {
  readonly byId: Readonly<Record<string, RouteReference>>;
  readonly byName: Readonly<Record<string, RouteReference>>;
  get(idOrName: string): RouteReference;
}
