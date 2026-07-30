import type { RouteHrefOptions, RouteParameter, RoutePolicy, RouteRecord } from '../types.js';
import { decodeRouteSearch, normalizeRoutePathname } from './search.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const INTEGER = /^-?(?:0|[1-9]\d*)$/;
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

type RouteBuildContract = Pick<RouteRecord, 'segments' | 'parameters'> & { policy?: Pick<RoutePolicy, 'navigation' | 'search'> };

export type RouteParameterValues = Readonly<Record<string, string | number | boolean | undefined>>;

export function decodeRouteParameter(parameter: RouteParameter, raw: string | undefined): string | number | boolean | undefined {
  if (raw === undefined || raw === '') {
    if (parameter.optional) return undefined;
    throw new TypeError(`Route parameter '${parameter.name}' is required.`);
  }
  const decoded = safeDecode(raw, parameter.name);
  if (parameter.catchAll || parameter.kind === 'path' || parameter.kind === 'string') return decoded;
  if (parameter.kind === 'slug') {
    if (!SLUG.test(decoded)) throw invalid(parameter, decoded);
    return decoded;
  }
  if (parameter.kind === 'uuid') {
    if (!UUID.test(decoded)) throw invalid(parameter, decoded);
    return decoded.toLowerCase();
  }
  if (parameter.kind === 'integer') {
    if (!INTEGER.test(decoded)) throw invalid(parameter, decoded);
    const value = Number(decoded);
    if (!Number.isSafeInteger(value)) throw invalid(parameter, decoded);
    return value;
  }
  if (parameter.kind === 'number') {
    if (!NUMBER.test(decoded)) throw invalid(parameter, decoded);
    const value = Number(decoded);
    if (!Number.isFinite(value)) throw invalid(parameter, decoded);
    return value;
  }
  if (parameter.kind === 'boolean') {
    if (decoded === 'true' || decoded === '1') return true;
    if (decoded === 'false' || decoded === '0') return false;
    throw invalid(parameter, decoded);
  }
  return assertNever(parameter.kind);
}

export function encodeRouteParameter(parameter: RouteParameter, value: unknown): string | undefined {
  if (value === undefined || value === null) {
    if (parameter.optional) return undefined;
    throw new TypeError(`Route parameter '${parameter.name}' is required.`);
  }
  if (parameter.kind === 'boolean') {
    if (typeof value !== 'boolean') throw expected(parameter, 'a boolean');
    return value ? 'true' : 'false';
  }
  if (parameter.kind === 'integer') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw expected(parameter, 'a safe integer');
    return String(value);
  }
  if (parameter.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw expected(parameter, 'a finite number');
    return String(value);
  }
  if (typeof value !== 'string') throw expected(parameter, 'a string');
  if (parameter.kind === 'uuid' && !UUID.test(value)) throw expected(parameter, 'a UUID');
  if (parameter.kind === 'slug' && !SLUG.test(value)) throw expected(parameter, 'a slug');
  return parameter.catchAll
    ? value.split('/').filter(Boolean).map(encodeURIComponent).join('/')
    : encodeURIComponent(value);
}

export function buildRoutePath<TParams extends RouteParameterValues>(route: RouteBuildContract, params: TParams): string {
  const parameterMap = new Map(route.parameters.map((parameter) => [parameter.name, parameter]));
  const parts: string[] = [];
  for (const segment of route.segments) {
    if (segment.kind === 'static') {
      parts.push(encodeURIComponent(segment.value));
      continue;
    }
    const parameter = parameterMap.get(segment.value)!;
    const encoded = encodeRouteParameter(parameter, params[parameter.name]);
    if (encoded !== undefined) parts.push(encoded);
  }
  const pathname = parts.length === 0 ? '/' : `/${parts.join('/')}`;
  return normalizeRoutePathname(pathname, route.policy?.navigation?.trailingSlash ?? 'never');
}

export function buildRouteHref<TParams extends RouteParameterValues>(
  route: RouteBuildContract,
  params: TParams,
  options: RouteHrefOptions = {}
): string {
  const pathname = buildRoutePath(route, params);
  const search = new URLSearchParams();
  const searchContract = route.policy?.search ?? [];
  const allowedSearchNames = new Set(searchContract.map((entry) => entry.name));
  for (const [name, input] of Object.entries(options.query ?? {})) {
    if (input === undefined) continue;
    if (searchContract.length > 0 && !allowedSearchNames.has(name)) throw new TypeError(`Unknown route search parameter '${name}'.`);
    const values = Array.isArray(input) ? input : [input];
    for (const value of values) search.append(name, String(value));
  }
  decodeRouteSearch(search, searchContract);
  const query = search.toString();
  const hash = options.hash ? `#${encodeURIComponent(options.hash.replace(/^#/, ''))}` : '';
  return `${pathname}${query ? `?${query}` : ''}${hash}`;
}

function safeDecode(value: string, name: string): string {
  try { return decodeURIComponent(value); }
  catch { throw new TypeError(`Route parameter '${name}' contains invalid percent encoding.`); }
}

function invalid(parameter: RouteParameter, value: string): TypeError {
  return new TypeError(`Route parameter '${parameter.name}' cannot decode '${value}' as ${parameter.kind}.`);
}

function expected(parameter: RouteParameter, description: string): TypeError {
  return new TypeError(`Route parameter '${parameter.name}' expects ${description}.`);
}

function assertNever(value: never): never { throw new TypeError(`Unsupported route parameter kind '${String(value)}'.`); }
