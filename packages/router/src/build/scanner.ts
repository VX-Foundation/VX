import type * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  ApplicationGraph,
  EndpointMethod,
  EndpointRecord,
  RouteBoundaryPaths,
  RouteDiagnostic,
  RouteLoaderDeclaration,
  RouteMiddlewareDeclaration,
  RoutePolicy,
  RouteRecord
} from '../types.js';
import { DEFAULT_ROUTE_POLICY, mergeRoutePolicy, readRouteConfig } from './config.js';
import { compareRouteSpecificity } from './segments.js';
import {
  analyzeLayout,
  analyzeVXModule,
  createFileSystem,
  detectEndpointConflicts,
  detectRouteConflicts,
  detectRouteNameConflicts,
  emptyData,
  exclusiveReservedFile,
  isRouteGroup,
  mergeModuleData,
  message,
  readSource,
  reserveGraphEntry,
  routeId,
  routeName,
  safeParsePath,
  validateRouteActionNames,
  validateServerPolicies,
  validateUtilityModule,
  type ModuleData
} from './scanner-analysis.js';

export interface RouteDef {
  path: string;
  componentPath: string;
  isDynamic: boolean;
  isCatchAll: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ScannerFileSystem {
  readdirSync(path: fs.PathLike, options?: any): any;
  statSync(path: fs.PathLike, options?: any): any;
  readFileSync(path: fs.PathOrFileDescriptor, options?: any): any;
  realpathSync(path: fs.PathLike, options?: any): any;
}

export interface ScannerOptions {
  dir: string;
  rootDir?: string;
  extensions?: string[];
  fsModule?: Partial<ScannerFileSystem>;
  maxRoutes?: number;
  maxDepth?: number;
}

interface WalkContext {
  routeParts: string[];
  layouts: string[];
  loaders: RouteLoaderDeclaration[];
  middleware: RouteMiddlewareDeclaration[];
  boundaries: RouteBoundaryPaths;
  policy: RoutePolicy;
  depth: number;
}

const BOUNDARY_NAMES = new Map<string, keyof RouteBoundaryPaths>([
  ['loading.vx', 'loading'], ['_loading.vx', 'loading'], ['+loading.vx', 'loading'],
  ['error.vx', 'error'], ['_error.vx', 'error'], ['+error.vx', 'error'],
  ['not-found.vx', 'notFound'], ['_not-found.vx', 'notFound'], ['+not-found.vx', 'notFound']
]);
const LAYOUT_NAMES = new Set(['layout.vx', '_layout.vx', '+layout.vx']);
const PAGE_NAMES = new Set(['page.vx']);
const ROUTE_CONFIG_NAMES = ['route.json', '_route.json', '+route.json'];
const LOADER_NAMES = ['loader.ts', 'loader.js', 'loader.mjs', '_loader.ts', '_loader.js', '_loader.mjs', '+loader.ts', '+loader.js', '+loader.mjs'];
const MIDDLEWARE_NAMES = ['middleware.ts', 'middleware.js', 'middleware.mjs', '_middleware.ts', '_middleware.js', '_middleware.mjs', '+middleware.ts', '+middleware.js', '+middleware.mjs'];
const RESERVED_VX_NAMES = new Set([...LAYOUT_NAMES, ...PAGE_NAMES, ...BOUNDARY_NAMES.keys()]);
const ENDPOINT_PATTERN = /^(.*)\.endpoint\.(?:ts|js|mjs)$/;
const DIRECTORY_ENDPOINTS = new Set(['endpoint.ts', 'endpoint.js', 'endpoint.mjs', '_endpoint.ts', '_endpoint.js', '_endpoint.mjs', '+endpoint.ts', '+endpoint.js', '+endpoint.mjs']);
const HTTP_METHODS: EndpointMethod[] = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT'];

/** Builds the complete convention-owned application graph. */
export function buildApplicationGraph(options: ScannerOptions): ApplicationGraph {
  const resolveDir = (p: string) => (p.startsWith('/') && !p.match(/^[a-zA-Z]:/) ? path.posix.resolve(p) : path.resolve(p).replace(/\\/g, '/'));
  const joinPath = (dir: string, file: string) => (dir.startsWith('/') ? path.posix.join(dir, file) : path.join(dir, file)).replace(/\\/g, '/');
  const rootDir = resolveDir(options.rootDir ?? path.dirname(path.dirname(options.dir)));
  const pagesDir = resolveDir(options.dir);
  const diagnostics: RouteDiagnostic[] = [];
  const routes: RouteRecord[] = [];
  const endpoints: EndpointRecord[] = [];
  const fileSystem = createFileSystem(options.fsModule);
  const maxRoutes = options.maxRoutes ?? 5000;
  const maxDepth = options.maxDepth ?? 64;
  const extensions = new Set(options.extensions ?? ['.vx']);
  const layoutDataCache = new Map<string, ModuleData>();
  const validatedUtilityModules = new Set<string>();
  const visitedDirectories = new Set<string>();

  walkDirectory(pagesDir, { routeParts: [], layouts: [], loaders: [], middleware: [], boundaries: {}, policy: DEFAULT_ROUTE_POLICY, depth: 0 });
  detectRouteConflicts(routes, diagnostics);
  detectEndpointConflicts(endpoints, diagnostics);
  detectRouteNameConflicts(routes, diagnostics);
  validateServerPolicies(routes, diagnostics);
  routes.sort(compareRouteSpecificity);
  endpoints.sort(compareRouteSpecificity);

  return { version: 1, rootDir, pagesDir, routes, endpoints, diagnostics };

  function walkDirectory(directory: string, parent: WalkContext): void {
    let canonicalDirectory: string;
    try { canonicalDirectory = fileSystem.realpathSync(directory) as string; }
    catch (cause) {
      diagnostics.push({ code: 'VX_ROUTE_DIRECTORY_READ', severity: 'error', message: `Unable to resolve route directory: ${message(cause)}`, filePath: directory });
      return;
    }
    if (visitedDirectories.has(canonicalDirectory)) {
      diagnostics.push({
        code: 'VX_ROUTE_DIRECTORY_CYCLE', severity: 'error',
        message: 'Route directory resolves to an already visited location, which indicates a symbolic-link cycle or duplicate route root.',
        filePath: directory
      });
      return;
    }
    visitedDirectories.add(canonicalDirectory);
    if (parent.depth > maxDepth) {
      diagnostics.push({ code: 'VX_ROUTE_GRAPH_DEPTH', severity: 'error', message: `Route directory depth exceeds ${maxDepth}.`, filePath: directory });
      return;
    }

    let names: string[];
    try {
      names = (fileSystem.readdirSync(directory) as Array<string | Buffer>).map(String).sort();
    } catch (cause) {
      diagnostics.push({ code: 'VX_ROUTE_DIRECTORY_READ', severity: 'error', message: `Unable to read route directory: ${message(cause)}`, filePath: directory });
      return;
    }

    const nameSet = new Set(names);
    const directoryConfigPath = exclusiveReservedFile(nameSet, directory, ROUTE_CONFIG_NAMES, 'VX_ROUTE_CONFIG_COLLISION', diagnostics);
    const directoryConfig = directoryConfigPath ? readRouteConfig(directoryConfigPath, fileSystem, diagnostics) : undefined;
    const policy = mergeRoutePolicy(parent.policy, directoryConfig);
    const layoutPath = exclusiveReservedFile(nameSet, directory, [...LAYOUT_NAMES], 'VX_ROUTE_LAYOUT_COLLISION', diagnostics);
    const layouts = layoutPath ? [...parent.layouts, layoutPath] : parent.layouts;
    const loaderPath = exclusiveReservedFile(nameSet, directory, LOADER_NAMES, 'VX_ROUTE_LOADER_COLLISION', diagnostics);
    if (loaderPath) validateUtilityModule(loaderPath, 'loader', fileSystem, diagnostics, validatedUtilityModules);
    const loaders = loaderPath ? [...parent.loaders, { modulePath: loaderPath, scope: 'layout' as const }] : parent.loaders;
    const middlewarePath = exclusiveReservedFile(nameSet, directory, MIDDLEWARE_NAMES, 'VX_ROUTE_MIDDLEWARE_COLLISION', diagnostics);
    if (middlewarePath) validateUtilityModule(middlewarePath, 'middleware', fileSystem, diagnostics, validatedUtilityModules);
    const middleware = middlewarePath ? [...parent.middleware, { modulePath: middlewarePath, scope: parent.depth === 0 ? 'application' as const : 'group' as const }] : parent.middleware;
    const boundaries = { ...parent.boundaries };

    for (const [fileName, boundaryName] of BOUNDARY_NAMES) {
      if (!nameSet.has(fileName)) continue;
      if (boundaries[boundaryName] && path.dirname(boundaries[boundaryName]!) === directory) {
        diagnostics.push({ code: 'VX_ROUTE_BOUNDARY_COLLISION', severity: 'error', message: `Directory defines more than one ${boundaryName} boundary.`, filePath: joinPath(directory, fileName) });
      } else {
        boundaries[boundaryName] = joinPath(directory, fileName);
      }
    }

    const pageBases = new Set<string>();
    if (nameSet.has('page.vx') && [...extensions].some((extension) => nameSet.has(`index${extension}`))) {
      diagnostics.push({ code: 'VX_ROUTE_PAGE_COLLISION', severity: 'error', message: 'Directory defines both canonical page.vx and legacy index.vx.', filePath: directory, suggestion: 'Keep only page.vx or index.vx for the directory route.' });
    }
    for (const name of names) {
      const fullPath = joinPath(directory, name);
      let stat: fs.Stats;
      try { stat = fileSystem.statSync(fullPath) as fs.Stats; }
      catch (cause) {
        diagnostics.push({ code: 'VX_ROUTE_ENTRY_STAT', severity: 'error', message: `Unable to inspect route entry: ${message(cause)}`, filePath: fullPath });
        continue;
      }
      if (!stat.isFile()) continue;

      const extension = path.extname(name);
      if (PAGE_NAMES.has(name)) {
        pageBases.add('index');
        addPage(fullPath, 'index', policy, layouts, loaders, middleware, boundaries, parent.routeParts, nameSet, directory, directoryConfig?.name);
        continue;
      }
      if (extensions.has(extension) && !RESERVED_VX_NAMES.has(name)) {
        const base = path.basename(name, extension);
        if (base.startsWith('_') || base.startsWith('+')) continue;
        pageBases.add(base);
        addPage(fullPath, base, policy, layouts, loaders, middleware, boundaries, parent.routeParts, nameSet, directory);
        continue;
      }

      const endpointMatch = name.match(ENDPOINT_PATTERN);
      if (endpointMatch) {
        addEndpoint(fullPath, endpointMatch[1]!, parent.routeParts, middleware);
      } else if (DIRECTORY_ENDPOINTS.has(name)) {
        addEndpoint(fullPath, 'index', parent.routeParts, middleware);
      }
    }

    addRedirectOnlyRoutes(directory, names, pageBases, policy, layouts, loaders, middleware, boundaries, parent.routeParts);

    for (const name of names) {
      const fullPath = joinPath(directory, name);
      let stat: fs.Stats;
      try { stat = fileSystem.statSync(fullPath) as fs.Stats; } catch { continue; }
      if (!stat.isDirectory() || name.startsWith('.') || name.startsWith('_')) continue;
      const routeParts = isRouteGroup(name) ? parent.routeParts : [...parent.routeParts, name];
      walkDirectory(fullPath, { routeParts, layouts, loaders, middleware, boundaries, policy, depth: parent.depth + 1 });
    }
  }

  function addPage(
    filePath: string,
    base: string,
    inheritedPolicy: RoutePolicy,
    layouts: string[],
    inheritedLoaders: RouteLoaderDeclaration[],
    inheritedMiddleware: RouteMiddlewareDeclaration[],
    boundaries: RouteBoundaryPaths,
    parentParts: string[],
    names: Set<string>,
    directory: string,
    directoryRouteName?: string
  ): void {
    if (!reserveGraphEntry(routes.length, maxRoutes, 'routes', filePath, diagnostics)) return;
    const routeParts = base === 'index' ? parentParts : [...parentParts, base];
    const parsed = safeParsePath(routeParts, filePath, diagnostics);
    if (!parsed) return;
    const configCandidates = base === 'index' ? ['page.route.json', 'index.route.json'] : [`${base}.route.json`];
    const configPath = exclusiveReservedFile(names, directory, configCandidates, 'VX_ROUTE_PAGE_CONFIG_COLLISION', diagnostics);
    const localConfig = configPath ? readRouteConfig(configPath, fileSystem, diagnostics) : undefined;
    const loaderCandidates = base === 'index'
      ? ['page.loader.ts', 'page.loader.js', 'page.loader.mjs', 'index.loader.ts', 'index.loader.js', 'index.loader.mjs']
      : [`${base}.loader.ts`, `${base}.loader.js`, `${base}.loader.mjs`];
    const pageLoaderPath = exclusiveReservedFile(names, directory, loaderCandidates, 'VX_ROUTE_PAGE_LOADER_COLLISION', diagnostics);
    if (pageLoaderPath) validateUtilityModule(pageLoaderPath, 'loader', fileSystem, diagnostics, validatedUtilityModules);
    const loaderPaths = pageLoaderPath ? [...inheritedLoaders, { modulePath: pageLoaderPath, scope: 'page' as const }] : [...inheritedLoaders];
    const middlewareCandidates = base === 'index'
      ? ['page.middleware.ts', 'page.middleware.js', 'page.middleware.mjs', 'index.middleware.ts', 'index.middleware.js', 'index.middleware.mjs']
      : [`${base}.middleware.ts`, `${base}.middleware.js`, `${base}.middleware.mjs`];
    const pageMiddlewarePath = exclusiveReservedFile(names, directory, middlewareCandidates, 'VX_ROUTE_PAGE_MIDDLEWARE_COLLISION', diagnostics);
    if (pageMiddlewarePath) validateUtilityModule(pageMiddlewarePath, 'middleware', fileSystem, diagnostics, validatedUtilityModules);
    const middlewarePaths = pageMiddlewarePath ? [...inheritedMiddleware, { modulePath: pageMiddlewarePath, scope: 'route' as const }] : [...inheritedMiddleware];
    const policy = mergeRoutePolicy(inheritedPolicy, localConfig);
    const source = readSource(filePath, fileSystem, diagnostics);
    const pageData = source === undefined ? emptyData() : analyzeVXModule(filePath, source, parsed.parameters, false, diagnostics);
    const layoutData = layouts.map((layout) => analyzeLayout(layout, fileSystem, diagnostics, layoutDataCache));
    const data = mergeModuleData([...layoutData, pageData]);
    validateRouteActionNames(data.actions, filePath, diagnostics);
    routes.push({
      id: routeId(parsed.path),
      name: localConfig?.name ?? (base === 'index' ? directoryRouteName : undefined) ?? routeName(parsed.path),
      path: parsed.path,
      segments: parsed.segments,
      parameters: parsed.parameters,
      pagePath: filePath,
      layoutPaths: [...layouts],
      loaderPaths,
      middlewarePaths,
      boundaries: { ...boundaries },
      policy,
      queries: data.queries,
      actions: data.actions,
      forms: data.forms,
      score: parsed.score
    });
  }

  function addEndpoint(filePath: string, base: string, parentParts: string[], middleware: RouteMiddlewareDeclaration[]): void {
    if (!reserveGraphEntry(endpoints.length, maxRoutes, 'endpoints', filePath, diagnostics)) return;
    const routeParts = base === 'index' || base === '' ? parentParts : [...parentParts, base];
    const parsed = safeParsePath(routeParts, filePath, diagnostics);
    if (!parsed) return;
    const source = readSource(filePath, fileSystem, diagnostics) ?? '';
    const methods = HTTP_METHODS.filter((method) => new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${method}\\b`).test(source));
    if (methods.length === 0) {
      diagnostics.push({
        code: 'VX_ROUTE_ENDPOINT_EMPTY', severity: 'error',
        message: 'Endpoint module does not export a supported HTTP method.', filePath,
        suggestion: `Export one or more of ${HTTP_METHODS.join(', ')}.`
      });
    }
    endpoints.push({ id: `endpoint:${parsed.path}`, path: parsed.path, segments: parsed.segments, parameters: parsed.parameters, modulePath: filePath, middlewarePaths: [...middleware], methods, score: parsed.score });
  }

  function addRedirectOnlyRoutes(
    directory: string,
    names: string[],
    pageBases: Set<string>,
    inheritedPolicy: RoutePolicy,
    layouts: string[],
    loaders: RouteLoaderDeclaration[],
    middleware: RouteMiddlewareDeclaration[],
    boundaries: RouteBoundaryPaths,
    parentParts: string[]
  ): void {
    for (const name of names) {
      if (!name.endsWith('.route.json') || ROUTE_CONFIG_NAMES.includes(name)) continue;
      const base = name.slice(0, -'.route.json'.length);
      if (pageBases.has(base)) continue;
      const filePath = joinPath(directory, name);
      if (!reserveGraphEntry(routes.length, maxRoutes, 'routes', filePath, diagnostics)) continue;
      const config = readRouteConfig(filePath, fileSystem, diagnostics);
      if (!config?.redirect) continue;
      const routeParts = base === 'index' || base === 'page' ? parentParts : [...parentParts, base];
      const parsed = safeParsePath(routeParts, filePath, diagnostics);
      if (!parsed) continue;
      routes.push({
        id: routeId(parsed.path), name: config.name ?? routeName(parsed.path), path: parsed.path, segments: parsed.segments, parameters: parsed.parameters,
        layoutPaths: [...layouts], loaderPaths: [...loaders], middlewarePaths: [...middleware], boundaries: { ...boundaries }, policy: mergeRoutePolicy(inheritedPolicy, config),
        queries: [], actions: [], forms: [], score: parsed.score
      });
    }
  }
}

/** Compatibility API retained for packages that only need page path matching. */
export function scanRoutes(options: ScannerOptions): RouteDef[] {
  return buildApplicationGraph(options).routes
    .filter((route): route is RouteRecord & { pagePath: string } => Boolean(route.pagePath))
    .map((route) => ({
      path: route.path,
      componentPath: route.pagePath,
      isDynamic: route.parameters.length > 0,
      isCatchAll: route.parameters.some((parameter) => parameter.catchAll)
    }));
}
