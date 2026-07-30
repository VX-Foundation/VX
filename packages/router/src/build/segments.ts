import type { RouteParameter, RouteParameterKind, RouteSegment } from '../types.js';

const PARAMETER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const KINDS = new Set<RouteParameterKind>(['string', 'integer', 'number', 'boolean', 'uuid', 'slug', 'path']);
const RESERVED_PARAMETER_NAMES = new Set(['route', 'search']);

export interface ParsedRoutePath {
  path: string;
  segments: RouteSegment[];
  parameters: RouteParameter[];
  score: number;
}

export function parseRoutePath(parts: readonly string[]): ParsedRoutePath {
  const segments: RouteSegment[] = [];
  const parameters: RouteParameter[] = [];
  let score = 0;

  const parameterNames = new Set<string>();
  for (const part of parts.filter(Boolean)) {
    const parsed = parseSegment(part);
    segments.push(parsed);
    if (parsed.parameter) {
      if (RESERVED_PARAMETER_NAMES.has(parsed.parameter.name)) {
        throw new Error(`Route parameter '${parsed.parameter.name}' is reserved by the router runtime.`);
      }
      if (parameterNames.has(parsed.parameter.name)) {
        throw new Error(`Route parameter '${parsed.parameter.name}' is declared more than once in the same route.`);
      }
      parameterNames.add(parsed.parameter.name);
      parameters.push(parsed.parameter);
    }
    score += segmentScore(parsed);
  }

  const path = segments.length === 0
    ? '/'
    : `/${segments.map(segmentPattern).join('/')}`;
  return { path, segments, parameters, score: score * 100 + segments.length };
}

export function parseSegment(source: string): RouteSegment {
  const optionalCatchAll = source.match(/^\[\[\.\.\.([^\]]+)\]\]$/);
  if (optionalCatchAll) return dynamicSegment(source, optionalCatchAll[1]!, true, true);

  const catchAll = source.match(/^\[\.\.\.([^\]]+)\]$/);
  if (catchAll) return dynamicSegment(source, catchAll[1]!, true, false);

  const dynamic = source.match(/^\[([^\]]+)\]$/);
  if (dynamic) return dynamicSegment(source, dynamic[1]!, false, false);

  if (source.includes('[') || source.includes(']')) {
    throw new Error(`Invalid route segment '${source}'. Dynamic segments must use [name], [name.kind], [...name], or [[...name]].`);
  }
  return { kind: 'static', value: source };
}

export function compareRouteSpecificity(
  left: { score: number; path: string; segments?: readonly RouteSegment[] },
  right: { score: number; path: string; segments?: readonly RouteSegment[] }
): number {
  if (left.segments && right.segments) {
    const length = Math.max(left.segments.length, right.segments.length);
    for (let index = 0; index < length; index += 1) {
      const leftSegment = left.segments[index];
      const rightSegment = right.segments[index];
      if (!leftSegment || !rightSegment) {
        if (!leftSegment && rightSegment?.kind === 'catch-all' && rightSegment.parameter?.optional) return -1;
        if (!rightSegment && leftSegment?.kind === 'catch-all' && leftSegment.parameter?.optional) return 1;
        return leftSegment ? -1 : 1;
      }
      const difference = routeSegmentRank(rightSegment) - routeSegmentRank(leftSegment);
      if (difference !== 0) return difference;
      if (leftSegment.kind === 'static' && rightSegment.kind === 'static') {
        const staticOrder = leftSegment.value.localeCompare(rightSegment.value);
        if (staticOrder !== 0) return staticOrder;
      }
    }
  }
  if (left.score !== right.score) return right.score - left.score;
  return left.path.localeCompare(right.path);
}

function dynamicSegment(source: string, descriptor: string, catchAll: boolean, optional: boolean): RouteSegment {
  const separator = descriptor.lastIndexOf('.');
  const name = separator > 0 ? descriptor.slice(0, separator) : descriptor;
  const kindText = separator > 0 ? descriptor.slice(separator + 1) : catchAll ? 'path' : 'string';
  if (!PARAMETER_NAME.test(name)) throw new Error(`Invalid route parameter name '${name}' in '${source}'.`);
  if (!KINDS.has(kindText as RouteParameterKind)) {
    throw new Error(`Unknown route parameter kind '${kindText}' in '${source}'.`);
  }
  const kind = kindText as RouteParameterKind;
  if (catchAll && kind !== 'path' && kind !== 'string' && kind !== 'slug') {
    throw new Error(`Catch-all route parameter '${name}' cannot use kind '${kind}'.`);
  }
  const parameter: RouteParameter = { name, kind, catchAll, optional, source };
  return { kind: catchAll ? 'catch-all' : 'parameter', value: name, parameter };
}

function routeSegmentRank(segment: RouteSegment): number {
  if (segment.kind === 'static') return 4;
  if (segment.kind === 'parameter') return 3;
  return segment.parameter?.optional ? 1 : 2;
}

function segmentScore(segment: RouteSegment): number {
  if (segment.kind === 'static') return 30;
  if (segment.kind === 'parameter') return 20;
  return segment.parameter?.optional ? 5 : 10;
}

function segmentPattern(segment: RouteSegment): string {
  if (segment.kind === 'static') return encodeURIComponent(segment.value);
  if (segment.kind === 'catch-all') return segment.parameter?.optional ? `*${segment.value}?` : `*${segment.value}`;
  return `:${segment.value}`;
}
