interface NodePath {
  relative?: (from: string, to: string) => string;
  posix?: {
    relative?: (from: string, to: string) => string;
  };
}

function getNodePath(): NodePath | null {
  try {
    if (typeof process !== 'undefined' && process.versions?.node) {
      if (typeof process.getBuiltinModule === 'function') {
        const pathMod = process.getBuiltinModule('node:path');
        if (pathMod) return pathMod as unknown as NodePath;
      }
      const fn = new Function('m', 'try { return typeof require !== "undefined" ? require(m) : (typeof process !== "undefined" && process.mainModule ? process.mainModule.require(m) : null); } catch { return null; }');
      return (fn('node:path') ?? fn('path')) as NodePath | null;
    }
    return null;
  } catch {
    return null;
  }
}

const path = {
  relative: (from: string, to: string) => {
    const np = getNodePath();
    if (np?.posix?.relative) return np.posix.relative(from, to);
    if (np?.relative) return np.relative(from, to);
    const f = from.replace(/\/$/, '');
    if (to.startsWith(`${f}/`)) return to.slice(f.length + 1);
    return to;
  },
  sep: '/'
};
import type { ApplicationGraph, EndpointRecord, RouteRecord } from '../types.js';

export interface GeneratedApplicationModules {
  client: string;
  endpoints: string;
  server: string;
  manifest: string;
}

export function generateApplicationModules(graph: ApplicationGraph): GeneratedApplicationModules {
  const clientRoutes = graph.routes.map((route) => emitRuntimeRoute(route, graph.rootDir)).join(',\n');
  const endpoints = graph.endpoints.map((endpoint) => emitRuntimeEndpoint(endpoint, graph.rootDir)).join(',\n');
  const client = [
    `import { createApplicationRouter, createRouteCatalog } from '@vx-foundation/router';`,
    `export const routes = Object.freeze([${clientRoutes}]);`,
    `export const routeById = Object.freeze(Object.fromEntries(routes.map((route) => [route.id, route])));`,
    `export const routeCatalog = createRouteCatalog(routes);`,
    `export const route = routeCatalog.byName;`,
    `export function createVXApplication(root, options = {}) {`,
    `  return createApplicationRouter({ root, routes, ...options });`,
    `}`,
    `export default async function mountVXApplication(root, options = {}) {`,
    `  const router = createVXApplication(root, options);`,
    `  await router.start();`,
    `  return () => router.dispose();`,
    `}`
  ].join('\n');
  const endpointModule = [
    `export const endpoints = Object.freeze([${endpoints}]);`,
    `export const endpointById = Object.freeze(Object.fromEntries(endpoints.map((endpoint) => [endpoint.id, endpoint])));`
  ].join('\n');
  const server = [
    `import { createServerApplication } from '@vx-foundation/server';`,
    `export const routes = Object.freeze([${clientRoutes}]);`,
    `export const endpoints = Object.freeze([${endpoints}]);`,
    `export function createVXServerApplication(options = {}) {`,
    `  return createServerApplication({ routes, endpoints, ...options });`,
    `}`,
    `export default createVXServerApplication;`
  ].join('\n');
  return { client, endpoints: endpointModule, server, manifest: JSON.stringify(serializableGraph(graph), null, 2) };
}

export function serializableGraph(graph: ApplicationGraph): Record<string, unknown> {
  return {
    version: graph.version,
    routes: graph.routes.map((route) => stripRoutePaths(route, graph.rootDir)),
    endpoints: graph.endpoints.map((endpoint) => stripEndpointPaths(endpoint, graph.rootDir))
  };
}

function emitRuntimeRoute(route: RouteRecord, rootDir: string): string {
  const serializable = stripRoutePaths(route, rootDir);
  const loaders = [
    route.pagePath ? `loadPage: () => import(${JSON.stringify(importSpecifier(route.pagePath, rootDir))})` : '',
    `loadLayouts: [${route.layoutPaths.map((filePath) => `() => import(${JSON.stringify(importSpecifier(filePath, rootDir))})`).join(', ')}]`,
    route.loaderPaths?.length ? `loadLoaders: [${route.loaderPaths.map((entry) => `() => import(${JSON.stringify(importSpecifier(entry.modulePath, rootDir))})`).join(', ')}]` : '',
    route.middlewarePaths?.length ? `loadMiddleware: [${route.middlewarePaths.map((entry) => `() => import(${JSON.stringify(importSpecifier(entry.modulePath, rootDir))})`).join(', ')}]` : '',
    route.boundaries.loading ? `loadLoading: () => import(${JSON.stringify(importSpecifier(route.boundaries.loading, rootDir))})` : '',
    route.boundaries.error ? `loadError: () => import(${JSON.stringify(importSpecifier(route.boundaries.error, rootDir))})` : '',
    route.boundaries.notFound ? `loadNotFound: () => import(${JSON.stringify(importSpecifier(route.boundaries.notFound, rootDir))})` : ''
  ].filter(Boolean);
  return `{ ...${JSON.stringify(serializable)}, ${loaders.join(', ')} }`;
}

function emitRuntimeEndpoint(endpoint: EndpointRecord, rootDir: string): string {
  const serializable = stripEndpointPaths(endpoint, rootDir);
  const middleware = endpoint.middlewarePaths?.length
    ? `, loadMiddleware: [${endpoint.middlewarePaths.map((entry) => `() => import(${JSON.stringify(importSpecifier(entry.modulePath, rootDir))})`).join(', ')}]`
    : '';
  return `{ ...${JSON.stringify(serializable)}, load: () => import(${JSON.stringify(importSpecifier(endpoint.modulePath, rootDir))})${middleware} }`;
}

function stripRoutePaths(route: RouteRecord, rootDir: string): Record<string, unknown> {
  return {
    ...route,
    ...(route.pagePath ? { pagePath: projectPath(route.pagePath, rootDir) } : {}),
    layoutPaths: route.layoutPaths.map((filePath) => projectPath(filePath, rootDir)),
    ...(route.loaderPaths ? { loaderPaths: route.loaderPaths.map((entry) => ({ ...entry, modulePath: projectPath(entry.modulePath, rootDir) })) } : {}),
    ...(route.middlewarePaths ? { middlewarePaths: route.middlewarePaths.map((entry) => ({ ...entry, modulePath: projectPath(entry.modulePath, rootDir) })) } : {}),
    boundaries: Object.fromEntries(Object.entries(route.boundaries).map(([name, filePath]) => [name, projectPath(filePath, rootDir)])),
    queries: route.queries.map((query) => ({ ...query, modulePath: projectPath(query.modulePath, rootDir) })),
    actions: route.actions.map((action) => ({ ...action, modulePath: projectPath(action.modulePath, rootDir) })),
    ...(route.forms ? { forms: route.forms.map((form) => ({ ...form, modulePath: projectPath(form.modulePath, rootDir) })) } : {})
  };
}

function stripEndpointPaths(endpoint: EndpointRecord, rootDir: string): Record<string, unknown> {
  return {
    ...endpoint,
    modulePath: projectPath(endpoint.modulePath, rootDir),
    ...(endpoint.middlewarePaths ? { middlewarePaths: endpoint.middlewarePaths.map((entry) => ({ ...entry, modulePath: projectPath(entry.modulePath, rootDir) })) } : {})
  };
}

function importSpecifier(filePath: string, rootDir: string): string {
  const relative = projectPath(filePath, rootDir);
  return relative.startsWith('/') ? relative : `/${relative}`;
}

function projectPath(filePath: string, rootDir: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join('/');
}
