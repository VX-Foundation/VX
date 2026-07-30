import type { EndpointRecord, RouteLocation, RouteParameter, RouteRecord, RouteSegment } from '../types.js';
import { decodeRouteParameter } from './params.js';

export interface MatchedRoute<T> {
  route: T;
  params: Readonly<Record<string, string | number | boolean | undefined>>;
}

export interface RouteMatcher<T> {
  match(urlPath: string): MatchedRoute<T> | null;
}

type MatchableRoute = {
  path: string;
  segments?: readonly RouteSegment[];
  parameters?: readonly RouteParameter[];
  policy?: { navigation?: { caseSensitive?: boolean } };
};

interface Terminal<T> {
  route: T;
  order: number;
}

interface ParameterEdge<T> {
  parameter: RouteParameter;
  node: TrieNode<T>;
}

interface TrieNode<T> {
  sensitive: Map<string, TrieNode<T>>;
  insensitive: Map<string, TrieNode<T>>;
  parameters: ParameterEdge<T>[];
  catchAll: ParameterEdge<T>[];
  terminals: Terminal<T>[];
}

const matcherCache = new WeakMap<readonly object[], RouteMatcher<unknown>>();

export function matchRoute<T extends MatchableRoute>(urlPath: string, routes: readonly T[]): MatchedRoute<T> | null {
  if (Object.isFrozen(routes)) {
    let matcher = matcherCache.get(routes as readonly object[]) as RouteMatcher<T> | undefined;
    if (!matcher) {
      matcher = createRouteMatcher(routes);
      matcherCache.set(routes as readonly object[], matcher as RouteMatcher<unknown>);
    }
    return matcher.match(urlPath);
  }
  return linearMatch(urlPath, routes);
}

export function createRouteMatcher<T extends MatchableRoute>(routes: readonly T[]): RouteMatcher<T> {
  const root = createTrieNode<T>();
  routes.forEach((route, order) => insertRoute(root, route, order));
  return Object.freeze({
    match(urlPath: string): MatchedRoute<T> | null {
      const pathname = normalizePathname(urlPath);
      const values = pathname.split('/').filter(Boolean);
      const matches: Array<{ terminal: Terminal<T>; params: Readonly<Record<string, string | number | boolean | undefined>> }> = [];
      traverse(root, values, 0, {}, matches);
      if (matches.length === 0) return null;
      matches.sort((left, right) => left.terminal.order - right.terminal.order);
      const winner = matches[0]!;
      return { route: winner.terminal.route, params: winner.params };
    }
  });
}

export function matchEndpoint<T extends Pick<EndpointRecord, 'path' | 'segments' | 'parameters'>>(
  urlPath: string,
  endpoints: readonly T[]
): MatchedRoute<T> | null {
  return matchRoute(urlPath, endpoints);
}

/** Compatibility matcher for the original :name and *name patterns. */
export function executeMatch(pattern: string, pathname: string): Record<string, string> | null {
  const patternParts = normalizePattern(pattern).split('/').filter(Boolean);
  const segments: RouteSegment[] = [];
  const parameters: RouteParameter[] = [];
  for (const part of patternParts) {
    if (part.startsWith(':')) {
      const parameter: RouteParameter = { name: part.slice(1), kind: 'string', catchAll: false, optional: false, source: part };
      segments.push({ kind: 'parameter', value: parameter.name, parameter });
      parameters.push(parameter);
    } else if (part.startsWith('*')) {
      const optional = part.endsWith('?');
      const name = part.slice(1, optional ? -1 : undefined);
      const parameter: RouteParameter = { name, kind: 'path', catchAll: true, optional, source: part };
      segments.push({ kind: 'catch-all', value: name, parameter });
      parameters.push(parameter);
    } else {
      segments.push({ kind: 'static', value: part });
    }
  }
  const result = executeRouteMatch(segments, parameters, normalizePathname(pathname));
  if (!result) return null;
  return Object.fromEntries(Object.entries(result).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

export function createRouteLocation<T extends Pick<RouteRecord, 'id' | 'name' | 'path'>>(
  route: T,
  url: URL,
  params: Readonly<Record<string, unknown>>
): RouteLocation {
  return { id: route.id, ...(route.name ? { name: route.name } : {}), path: route.path, pathname: url.pathname, search: url.searchParams, hash: url.hash, params, url };
}

function linearMatch<T extends MatchableRoute>(urlPath: string, routes: readonly T[]): MatchedRoute<T> | null {
  const pathname = normalizePathname(urlPath);
  for (const route of routes) {
    const params = route.segments && route.parameters
      ? executeRouteMatch(route.segments, route.parameters, pathname, route.policy?.navigation?.caseSensitive ?? true)
      : executeMatch(route.path, pathname);
    if (params) return { route, params };
  }
  return null;
}

function insertRoute<T extends MatchableRoute>(root: TrieNode<T>, route: T, order: number): void {
  if (!route.segments || !route.parameters) {
    const compatibility = compatibilityRoute(route.path);
    insertSegments(root, route, compatibility.segments, order, true);
    return;
  }
  insertSegments(root, route, route.segments, order, route.policy?.navigation?.caseSensitive ?? true);
}

function insertSegments<T extends MatchableRoute>(
  root: TrieNode<T>,
  route: T,
  segments: readonly RouteSegment[],
  order: number,
  caseSensitive: boolean
): void {
  let node = root;
  for (const segment of segments) {
    if (segment.kind === 'static') {
      const map = caseSensitive ? node.sensitive : node.insensitive;
      const key = caseSensitive ? segment.value : segment.value.toLocaleLowerCase();
      let child = map.get(key);
      if (!child) {
        child = createTrieNode<T>();
        map.set(key, child);
      }
      node = child;
      continue;
    }
    const parameter = segment.parameter;
    if (!parameter) throw new TypeError(`Route '${route.path}' has a dynamic segment without a parameter contract.`);
    const edges = segment.kind === 'catch-all' ? node.catchAll : node.parameters;
    let edge = edges.find((candidate) => equivalentParameter(candidate.parameter, parameter));
    if (!edge) {
      edge = { parameter, node: createTrieNode<T>() };
      edges.push(edge);
    }
    node = edge.node;
  }
  node.terminals.push({ route, order });
}

function traverse<T>(
  node: TrieNode<T>,
  values: readonly string[],
  cursor: number,
  params: Readonly<Record<string, string | number | boolean | undefined>>,
  matches: Array<{ terminal: Terminal<T>; params: Readonly<Record<string, string | number | boolean | undefined>> }>
): void {
  if (cursor === values.length) {
    for (const terminal of node.terminals) matches.push({ terminal, params: Object.freeze({ ...params }) });
    for (const edge of node.catchAll) {
      if (!edge.parameter.optional) continue;
      try {
        const value = decodeRouteParameter(edge.parameter, undefined);
        traverse(edge.node, values, values.length, { ...params, [edge.parameter.name]: value }, matches);
      } catch { /* invalid optional parameter cannot match */ }
    }
    return;
  }

  const raw = values[cursor]!;
  const decoded = safeDecode(raw);
  const sensitive = node.sensitive.get(decoded);
  if (sensitive) traverse(sensitive, values, cursor + 1, params, matches);
  const insensitive = node.insensitive.get(decoded.toLocaleLowerCase());
  if (insensitive && insensitive !== sensitive) traverse(insensitive, values, cursor + 1, params, matches);

  for (const edge of node.parameters) {
    try {
      const value = decodeRouteParameter(edge.parameter, raw);
      traverse(edge.node, values, cursor + 1, { ...params, [edge.parameter.name]: value }, matches);
    } catch { /* typed parameter does not match this segment */ }
  }
  for (const edge of node.catchAll) {
    try {
      const value = decodeRouteParameter(edge.parameter, values.slice(cursor).join('/'));
      traverse(edge.node, values, values.length, { ...params, [edge.parameter.name]: value }, matches);
    } catch { /* catch-all parameter does not match */ }
  }
}

function executeRouteMatch(
  segments: readonly RouteSegment[],
  parameters: readonly RouteParameter[],
  pathname: string,
  caseSensitive = true
): Readonly<Record<string, string | number | boolean | undefined>> | null {
  const values = pathname.split('/').filter(Boolean);
  const parameterMap = new Map(parameters.map((parameter) => [parameter.name, parameter]));
  const params: Record<string, string | number | boolean | undefined> = {};
  let cursor = 0;

  try {
    for (const segment of segments) {
      if (segment.kind === 'catch-all') {
        const parameter = parameterMap.get(segment.value)!;
        const remaining = values.slice(cursor).join('/');
        if (!remaining && !parameter.optional) return null;
        params[parameter.name] = decodeRouteParameter(parameter, remaining || undefined);
        cursor = values.length;
        continue;
      }
      const raw = values[cursor];
      if (raw === undefined) return null;
      if (segment.kind === 'static') {
        const decoded = safeDecode(raw);
        if (caseSensitive ? decoded !== segment.value : decoded.toLocaleLowerCase() !== segment.value.toLocaleLowerCase()) return null;
      } else {
        const parameter = parameterMap.get(segment.value)!;
        params[parameter.name] = decodeRouteParameter(parameter, raw);
      }
      cursor += 1;
    }
  } catch {
    return null;
  }

  return cursor === values.length ? params : null;
}

function compatibilityRoute(pattern: string): { segments: RouteSegment[]; parameters: RouteParameter[] } {
  const segments: RouteSegment[] = [];
  const parameters: RouteParameter[] = [];
  for (const part of normalizePattern(pattern).split('/').filter(Boolean)) {
    if (part.startsWith(':')) {
      const parameter: RouteParameter = { name: part.slice(1), kind: 'string', catchAll: false, optional: false, source: part };
      segments.push({ kind: 'parameter', value: parameter.name, parameter });
      parameters.push(parameter);
    } else if (part.startsWith('*')) {
      const optional = part.endsWith('?');
      const name = part.slice(1, optional ? -1 : undefined);
      const parameter: RouteParameter = { name, kind: 'path', catchAll: true, optional, source: part };
      segments.push({ kind: 'catch-all', value: name, parameter });
      parameters.push(parameter);
    } else {
      segments.push({ kind: 'static', value: part });
    }
  }
  return { segments, parameters };
}

function equivalentParameter(left: RouteParameter, right: RouteParameter): boolean {
  return left.name === right.name && left.kind === right.kind && left.catchAll === right.catchAll && left.optional === right.optional;
}

function createTrieNode<T>(): TrieNode<T> {
  return { sensitive: new Map(), insensitive: new Map(), parameters: [], catchAll: [], terminals: [] };
}


function normalizePattern(value: string): string {
  const withoutHash = value.split('#', 1)[0] || '/';
  if (withoutHash === '/') return '/';
  const prefixed = withoutHash.startsWith('/') ? withoutHash : `/${withoutHash}`;
  return prefixed.replace(/\/{2,}/g, '/').replace(/\/$/, '');
}

function normalizePathname(value: string): string {
  const pathname = value.split(/[?#]/, 1)[0] || '/';
  if (pathname === '/') return '/';
  const prefixed = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return prefixed.replace(/\/{2,}/g, '/').replace(/\/$/, '');
}

function safeDecode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}
