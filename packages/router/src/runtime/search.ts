import type { RouteSearchParameter } from '../types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const INTEGER = /^-?(?:0|[1-9]\d*)$/;
const NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function decodeRouteSearch(
  search: URLSearchParams,
  contract: readonly RouteSearchParameter[] = []
): Readonly<Record<string, unknown>> {
  if (contract.length === 0) return Object.freeze(Object.fromEntries(search.entries()));
  const output: Record<string, unknown> = {};
  const known = new Set(contract.map((entry) => entry.name));
  for (const definition of contract) {
    const raw = search.getAll(definition.name);
    if (raw.length === 0) {
      if (definition.defaultValue !== undefined) output[definition.name] = definition.defaultValue;
      else if (definition.required) throw new TypeError(`Route search parameter '${definition.name}' is required.`);
      else output[definition.name] = definition.repeat ? Object.freeze([]) : undefined;
      continue;
    }
    if (!definition.repeat && raw.length > 1) throw new TypeError(`Route search parameter '${definition.name}' cannot be repeated.`);
    const decoded = raw.map((value) => decodeSearchValue(definition, value));
    output[definition.name] = definition.repeat ? Object.freeze(decoded) : decoded[0];
  }
  for (const [name, value] of search.entries()) {
    if (known.has(name)) continue;
    const current = output[name];
    output[name] = current === undefined ? value : Array.isArray(current) ? Object.freeze([...current, value]) : Object.freeze([current, value]);
  }
  return Object.freeze(output);
}

export function normalizeRoutePathname(
  pathname: string,
  trailingSlash: 'preserve' | 'always' | 'never' = 'never'
): string {
  const clean = pathname.split(/[?#]/, 1)[0] || '/';
  const prefixed = clean.startsWith('/') ? clean : `/${clean}`;
  const normalized = prefixed.replace(/\/{2,}/g, '/');
  if (normalized === '/') return '/';
  if (trailingSlash === 'always') return normalized.endsWith('/') ? normalized : `${normalized}/`;
  if (trailingSlash === 'never') return normalized.replace(/\/$/, '');
  return normalized;
}

function decodeSearchValue(definition: RouteSearchParameter, raw: string): string | number | boolean {
  if (definition.kind === 'string') return raw;
  if (definition.kind === 'slug') {
    if (!SLUG.test(raw)) throw invalid(definition, raw);
    return raw;
  }
  if (definition.kind === 'uuid') {
    if (!UUID.test(raw)) throw invalid(definition, raw);
    return raw.toLowerCase();
  }
  if (definition.kind === 'integer') {
    if (!INTEGER.test(raw)) throw invalid(definition, raw);
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) throw invalid(definition, raw);
    return value;
  }
  if (definition.kind === 'number') {
    if (!NUMBER.test(raw)) throw invalid(definition, raw);
    const value = Number(raw);
    if (!Number.isFinite(value)) throw invalid(definition, raw);
    return value;
  }
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw invalid(definition, raw);
}

function invalid(definition: RouteSearchParameter, raw: string): TypeError {
  return new TypeError(`Route search parameter '${definition.name}' cannot decode '${raw}' as ${definition.kind}.`);
}
