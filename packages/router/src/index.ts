export { buildApplicationGraph, scanRoutes } from './build/scanner.js';
export type { RouteDef, ScannerOptions, ScannerFileSystem } from './build/scanner.js';
export { generateApplicationModules, serializableGraph } from './build/codegen.js';
export type { GeneratedApplicationModules } from './build/codegen.js';
export { parseRoutePath, parseSegment, compareRouteSpecificity } from './build/segments.js';
export { DEFAULT_ROUTE_POLICY, mergeRoutePolicy, readRouteConfig } from './build/config.js';
export type { RouteConfigFile } from './build/config.js';

export { matchRoute, matchEndpoint, executeMatch, createRouteLocation, createRouteMatcher } from './runtime/matcher.js';
export type { MatchedRoute, RouteMatcher } from './runtime/matcher.js';
export { buildRoutePath, buildRouteHref, decodeRouteParameter, encodeRouteParameter } from './runtime/params.js';
export type { RouteParameterValues } from './runtime/params.js';
export { decodeRouteSearch, normalizeRoutePathname } from './runtime/search.js';
export { createRouteCatalog } from './runtime/catalog.js';
export { executeRoutePipeline, executeRouteLoaders, composeMiddleware, isRedirectResult } from './runtime/lifecycle.js';
export type { ExecuteRoutePipelineOptions, RoutePipelineResult } from './runtime/lifecycle.js';
export { applyRouteMetadata, renderRouteMetadata, resolveRouteTitle } from './runtime/metadata.js';
export { loadRouteModules, mountRouteModules, mountBoundary, preloadRouteData, routeActions } from './runtime/module.js';
export type { LoadedRouteModules, MountedRouteBranch } from './runtime/module.js';
export { createApplicationRouter, initRouter } from './runtime/client.js';
export type {
  ApplicationRouter,
  ApplicationRouterConfig,
  BeforeNavigationContext,
  NavigationBlocker,
  NavigationOptions,
  RouterConfig
} from './runtime/client.js';

export type {
  ApplicationGraph,
  EndpointMethod,
  EndpointRecord,
  NavigationSnapshot,
  RouteActionDeclaration,
  RouteFormDeclaration,
  RouteAlternateLanguage,
  RouteBoundaryPaths,
  RouteCatalog,
  RouteDataDeclaration,
  RouteDiagnostic,
  RouteDiagnosticSeverity,
  RouteHrefOptions,
  RouteHydrationPolicy,
  RouteLoaderContext,
  RouteLoaderDeclaration,
  RouteLoaderModule,
  RouteLocation,
  RouteMetadata,
  RouteMiddleware,
  RouteMiddlewareContext,
  RouteMiddlewareDeclaration,
  RouteMiddlewareModule,
  RouteMiddlewareResult,
  RouteModuleKind,
  RouteNavigationKind,
  RouteNavigationPolicy,
  RouteOpenGraphMetadata,
  RouteParameter,
  RouteParameterKind,
  RoutePolicy,
  RoutePreloadPolicy,
  RouteGenerationMode,
  RouteGenerationPolicy,
  RoutePreservationPolicy,
  RouteRecord,
  RouteRedirect,
  RouteRedirectResult,
  RouteReference,
  RouteRenderPolicy,
  RouteSearchParameter,
  RouteSegment,
  RouteStreamingPolicy,
  RouteTrailingSlashPolicy,
  RouteTwitterMetadata,
  RuntimeEndpointRecord,
  RuntimeServerEndpointRecord,
  RuntimeServerRouteRecord,
  VXServerRouteComponentModule,
  RuntimeRouteRecord,
  VXRouteComponentInstance,
  VXRouteComponentModule
} from './types.js';
