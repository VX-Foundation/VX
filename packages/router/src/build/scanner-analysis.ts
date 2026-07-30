import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from '@vx/language';
import type { ProgramNode, ScriptBlockNode, ViewBlockNode, ViewNode } from '@vx/types';
import type {
  EndpointRecord,
  RouteActionDeclaration,
  RouteFormDeclaration,
  RouteDataDeclaration,
  RouteDiagnostic,
  RouteParameter,
  RouteRecord
} from '../types.js';
import { parseRoutePath } from './segments.js';
import type { ScannerFileSystem } from './scanner.js';

export type ModuleData = { queries: RouteDataDeclaration[]; actions: RouteActionDeclaration[]; forms: RouteFormDeclaration[] };

export function analyzeVXModule(
  filePath: string,
  source: string,
  parameters: RouteParameter[],
  layout: boolean,
  diagnostics: RouteDiagnostic[]
): ModuleData {
  const result = parse(source, filePath);
  for (const diagnostic of result.diagnostics) {
    diagnostics.push({ code: diagnostic.code, severity: diagnostic.severity === 'error' ? 'error' : 'warning', message: diagnostic.message, filePath });
  }
  const script = (result.ast as ProgramNode).blocks.find((block): block is ScriptBlockNode => block.kind === 'ScriptBlock');
  if (!script) {
    if (parameters.length > 0 && !layout) validateParameterProps([], parameters, filePath, diagnostics);
    return emptyData();
  }
  const props = script.statements.filter((statement) => statement.kind === 'PropDeclaration');
  if (!layout) validateParameterProps(props.map((prop) => ({ name: prop.name, type: prop.typeAnnotation.text, required: !prop.defaultValue })), parameters, filePath, diagnostics);
  const queries = script.statements
    .filter((statement) => statement.kind === 'QueryDeclaration')
    .map((query) => ({ name: query.name, side: query.side, modulePath: filePath }));
  const actions = script.statements
    .filter((statement) => statement.kind === 'ActionDeclaration')
    .map((action) => ({ name: action.name, side: action.side, modulePath: filePath }));
  const forms = script.statements
    .filter((statement) => statement.kind === 'FormDeclaration' && statement.options.some((option) => option.name === 'action'))
    .map((form) => ({ name: form.name!, modulePath: filePath }));
  return { queries, actions, forms };
}

export function analyzeLayout(
  filePath: string,
  fileSystem: ScannerFileSystem,
  diagnostics: RouteDiagnostic[],
  cache: Map<string, ModuleData>
): ModuleData {
  const cached = cache.get(filePath);
  if (cached) return cached;
  const source = readSource(filePath, fileSystem, diagnostics);
  if (source === undefined) return emptyData();
  const result = parse(source, filePath);
  for (const diagnostic of result.diagnostics) {
    diagnostics.push({ code: diagnostic.code, severity: diagnostic.severity === 'error' ? 'error' : 'warning', message: diagnostic.message, filePath });
  }
  const script = result.ast.blocks.find((block): block is ScriptBlockNode => block.kind === 'ScriptBlock');
  const view = result.ast.blocks.find((block): block is ViewBlockNode => block.kind === 'ViewBlock');
  const outlet = script?.statements.find((statement) => statement.kind === 'ContentDeclaration' && statement.name === 'route');
  const rendersOutlet = view ? containsContentRegion(view.children, 'route') : false;
  if (!outlet || !rendersOutlet) {
    diagnostics.push({
      code: 'VX_ROUTE_LAYOUT_OUTLET', severity: 'error',
      message: "Route layout must declare 'content route: required' and render Content(route).", filePath,
      suggestion: "Add 'content route: required' to #script and Content(route) to #view."
    });
  }
  const data = script ? {
    queries: script.statements.filter((statement) => statement.kind === 'QueryDeclaration').map((query) => ({ name: query.name, side: query.side, modulePath: filePath })),
    actions: script.statements.filter((statement) => statement.kind === 'ActionDeclaration').map((action) => ({ name: action.name, side: action.side, modulePath: filePath })),
    forms: script.statements.filter((statement) => statement.kind === 'FormDeclaration' && statement.options.some((option) => option.name === 'action')).map((form) => ({ name: form.name!, modulePath: filePath }))
  } : emptyData();
  cache.set(filePath, data);
  return data;
}


function containsContentRegion(nodes: readonly ViewNode[], name: string): boolean {
  for (const node of nodes) {
    if (node.kind === 'Widget') {
      if (node.tagName === 'Content' && node.isCall && node.callArgument?.text.trim() === name) return true;
      if (node.contentRegions.some((region) => region.name === name)) return true;
      if (containsContentRegion(node.children, name)) return true;
      if (node.contentRegions.some((region) => containsContentRegion(region.children, name))) return true;
      continue;
    }
    if (node.kind === 'IfBlock') {
      if (node.branches.some((branch) => containsContentRegion(branch.children, name))) return true;
      continue;
    }
    if (node.kind === 'WhenBlock') {
      if (node.branches.some((branch) => containsContentRegion(branch.children, name))) return true;
      if (node.fallback && containsContentRegion(node.fallback, name)) return true;
      continue;
    }
    if (node.kind === 'KeyedCollection') {
      if (containsContentRegion(node.children, name)) return true;
      if (node.fallbacks.some((fallback) => containsContentRegion(fallback.children, name))) return true;
    }
  }
  return false;
}

export function mergeModuleData(entries: readonly ModuleData[]): ModuleData {
  return {
    queries: entries.flatMap((entry) => entry.queries),
    actions: entries.flatMap((entry) => entry.actions),
    forms: entries.flatMap((entry) => entry.forms)
  };
}

function validateParameterProps(
  props: Array<{ name: string; type: string; required: boolean }>,
  parameters: RouteParameter[],
  filePath: string,
  diagnostics: RouteDiagnostic[]
): void {
  for (const parameter of parameters) {
    const prop = props.find((candidate) => candidate.name === parameter.name);
    if (!prop) {
      diagnostics.push({
        code: 'VX_ROUTE_PARAMETER_PROP_MISSING', severity: 'error',
        message: `Route parameter '${parameter.name}' is not declared as a page prop.`, filePath,
        suggestion: `Declare 'prop ${parameter.name}: ${expectedVXType(parameter)}'.`
      });
      continue;
    }
    const expected = expectedVXType(parameter).toLowerCase();
    if (normalizeType(prop.type) !== expected) {
      diagnostics.push({
        code: 'VX_ROUTE_PARAMETER_PROP_TYPE', severity: 'error',
        message: `Route parameter '${parameter.name}' uses '${parameter.kind}' but page prop type is '${prop.type}'.`, filePath,
        suggestion: `Use '${expectedVXType(parameter)}' for this route prop.`
      });
    }
    if (!parameter.optional && !prop.required) {
      diagnostics.push({ code: 'VX_ROUTE_PARAMETER_PROP_OPTIONAL', severity: 'error', message: `Required route parameter '${parameter.name}' cannot use a defaulted page prop.`, filePath });
    }
  }
}

function expectedVXType(parameter: RouteParameter): string {
  if (parameter.catchAll) return 'String';
  if (parameter.kind === 'integer') return 'Int';
  if (parameter.kind === 'number') return 'Float';
  if (parameter.kind === 'boolean') return 'Bool';
  return 'String';
}

function normalizeType(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase();
}

export function validateServerPolicies(routes: readonly RouteRecord[], diagnostics: RouteDiagnostic[]): void {
  for (const route of routes) {
    const filePath = route.pagePath ?? route.path;
    const { render, streaming, generation } = route.policy;
    if (render === 'static' && generation.mode === 'dynamic') {
      diagnostics.push({
        code: 'VX_ROUTE_STATIC_GENERATION_REQUIRED', severity: 'error', filePath,
        message: `Static route '${route.path}' must use static or incremental generation.`,
        suggestion: "Set generation.mode to 'static' or 'incremental'."
      });
    }
    if (generation.mode !== 'dynamic' && render === 'client') {
      diagnostics.push({
        code: 'VX_ROUTE_GENERATION_CLIENT_ONLY', severity: 'error', filePath,
        message: `Generated route '${route.path}' cannot use client-only rendering.`,
        suggestion: "Use render 'server' or 'static' so the adapter can produce HTML."
      });
    }
    if (streaming === 'stream' && render !== 'server') {
      diagnostics.push({
        code: 'VX_ROUTE_STREAMING_RENDER', severity: 'error', filePath,
        message: `Streaming route '${route.path}' must use server rendering.`,
        suggestion: "Set render to 'server' or streaming to 'blocking'."
      });
    }
    if (streaming === 'stream' && generation.mode !== 'dynamic') {
      diagnostics.push({
        code: 'VX_ROUTE_STREAMING_GENERATION', severity: 'error', filePath,
        message: `Streaming route '${route.path}' cannot be statically or incrementally generated.`,
        suggestion: "Use generation.mode 'dynamic' for streamed responses."
      });
    }
    if ((route.forms?.length ?? 0) > 0 && generation.mode !== 'dynamic') {
      diagnostics.push({
        code: 'VX_ROUTE_FORM_DYNAMIC_REQUIRED', severity: 'error', filePath,
        message: `Route '${route.path}' contains a server form and must use dynamic generation so each browser receives a bound CSRF token.`,
        suggestion: "Set generation.mode to 'dynamic', or move the form to a dynamic child route."
      });
    }
    if (generation.mode === 'dynamic') continue;
    if (route.parameters.length > 0 && generation.entries.length === 0) {
      diagnostics.push({
        code: 'VX_ROUTE_GENERATION_ENTRIES_REQUIRED', severity: 'error', filePath,
        message: `Generated dynamic route '${route.path}' requires explicit generation.entries.`,
        suggestion: 'Provide one entry object for every path that must be generated.'
      });
      continue;
    }
    const seen = new Set<string>();
    for (const entry of generation.entries) {
      const unknown = Object.keys(entry).filter((name) => !route.parameters.some((parameter) => parameter.name === name));
      const missing = route.parameters.filter((parameter) => !parameter.optional && entry[parameter.name] === undefined).map((parameter) => parameter.name);
      if (unknown.length > 0 || missing.length > 0) {
        diagnostics.push({
          code: 'VX_ROUTE_GENERATION_ENTRY_INVALID', severity: 'error', filePath,
          message: `Generation entry for '${route.path}' has ${unknown.length ? `unknown parameters: ${unknown.join(', ')}` : `missing parameters: ${missing.join(', ')}`}.`,
          suggestion: 'Each generation entry must match the typed route parameter contract exactly.'
        });
        continue;
      }
      try {
        const pathname = generationEntryPath(route, entry);
        if (seen.has(pathname)) throw new Error(`duplicate generated pathname '${pathname}'`);
        seen.add(pathname);
      } catch (cause) {
        diagnostics.push({
          code: 'VX_ROUTE_GENERATION_ENTRY_TYPE', severity: 'error', filePath,
          message: `Invalid generation entry for '${route.path}': ${message(cause)}.`,
          suggestion: 'Use values that satisfy each route parameter type.'
        });
      }
    }
  }
}

function generationEntryPath(route: RouteRecord, entry: Readonly<Record<string, string | number | boolean>>): string {
  const parts: string[] = [];
  for (const segment of route.segments) {
    if (segment.kind === 'static') { parts.push(encodeURIComponent(segment.value)); continue; }
    const parameter = segment.parameter!;
    const value = entry[parameter.name];
    if (value === undefined) { if (parameter.optional) continue; throw new Error(`parameter '${parameter.name}' is required`); }
    if (parameter.kind === 'integer' && (typeof value !== 'number' || !Number.isSafeInteger(value))) throw new Error(`parameter '${parameter.name}' requires a safe integer`);
    if (parameter.kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error(`parameter '${parameter.name}' requires a finite number`);
    if (parameter.kind === 'boolean' && typeof value !== 'boolean') throw new Error(`parameter '${parameter.name}' requires a boolean`);
    if (!['integer', 'number', 'boolean'].includes(parameter.kind) && typeof value !== 'string') throw new Error(`parameter '${parameter.name}' requires a string`);
    const text = String(value);
    if (parameter.kind === 'slug' && !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(text)) throw new Error(`parameter '${parameter.name}' requires a slug`);
    if (parameter.kind === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new Error(`parameter '${parameter.name}' requires a UUID`);
    parts.push(parameter.catchAll ? text.split('/').filter(Boolean).map(encodeURIComponent).join('/') : encodeURIComponent(text));
  }
  return parts.length === 0 ? '/' : `/${parts.join('/')}`;
}

export function detectRouteConflicts(routes: RouteRecord[], diagnostics: RouteDiagnostic[]): void {
  const exact = new Map<string, RouteRecord>();
  const folded = new Map<string, RouteRecord>();
  const insensitive = new Map<string, RouteRecord>();
  for (const route of routes) {
    const exactSignature = routeShape(route.segments, false);
    const foldedSignature = routeShape(route.segments, true);
    const caseSensitive = route.policy.navigation?.caseSensitive ?? true;
    const previous = exact.get(exactSignature) ?? (caseSensitive ? insensitive.get(foldedSignature) : folded.get(foldedSignature));
    if (previous) {
      diagnostics.push({
        code: 'VX_ROUTE_COLLISION', severity: 'error',
        message: `Route '${route.path}' conflicts with '${previous.path}' because both match the same URL shape.`,
        filePath: route.pagePath ?? route.policy.redirect?.to ?? route.path,
        suggestion: 'Rename one static or dynamic segment or use compatible case-sensitivity policies.'
      });
    }
    if (!exact.has(exactSignature)) exact.set(exactSignature, route);
    if (!folded.has(foldedSignature)) folded.set(foldedSignature, route);
    if (!caseSensitive && !insensitive.has(foldedSignature)) insensitive.set(foldedSignature, route);
  }
}


export function detectRouteNameConflicts(routes: RouteRecord[], diagnostics: RouteDiagnostic[]): void {
  const names = new Map<string, RouteRecord>();
  for (const route of routes) {
    if (!route.name) continue;
    const previous = names.get(route.name);
    if (!previous) { names.set(route.name, route); continue; }
    diagnostics.push({
      code: 'VX_ROUTE_NAME_COLLISION', severity: 'error',
      message: `Route name '${route.name}' is used by both '${previous.path}' and '${route.path}'.`,
      filePath: route.pagePath ?? route.path,
      suggestion: 'Assign a unique name in the route configuration.'
    });
  }
}

export function detectEndpointConflicts(endpoints: EndpointRecord[], diagnostics: RouteDiagnostic[]): void {
  const seen = new Map<string, EndpointRecord>();
  for (const endpoint of endpoints) {
    const key = routeShape(endpoint.segments);
    const previous = seen.get(key);
    if (!previous) { seen.set(key, endpoint); continue; }
    const methods = endpoint.methods.filter((method) => previous.methods.includes(method));
    if (methods.length > 0) {
      diagnostics.push({
        code: 'VX_ROUTE_ENDPOINT_COLLISION', severity: 'error',
        message: `Endpoint '${endpoint.path}' conflicts with '${previous.path}' for methods: ${methods.join(', ')}.`,
        filePath: endpoint.modulePath,
        suggestion: 'Rename one endpoint segment or separate the overlapping HTTP methods.'
      });
    }
  }
}

function routeShape(segments: readonly RouteRecord['segments'][number][], foldCase = false): string {
  return segments.map((segment) => segment.kind === 'static'
    ? `s:${foldCase ? segment.value.toLocaleLowerCase() : segment.value}`
    : segment.kind === 'parameter'
      ? 'p'
      : `c:${segment.parameter?.optional ? 'o' : 'r'}`).join('/');
}

export function validateRouteActionNames(actions: readonly RouteActionDeclaration[], filePath: string, diagnostics: RouteDiagnostic[]): void {
  const owners = new Map<string, string>();
  for (const action of actions) {
    const previous = owners.get(action.name);
    if (!previous) {
      owners.set(action.name, action.modulePath);
      continue;
    }
    if (previous === action.modulePath) continue;
    diagnostics.push({
      code: 'VX_ROUTE_ACTION_COLLISION', severity: 'error',
      message: `Route action '${action.name}' is exported by both '${previous}' and '${action.modulePath}'.`,
      filePath,
      suggestion: 'Rename one action so the route action surface remains unambiguous.'
    });
  }
}

export function safeParsePath(parts: string[], filePath: string, diagnostics: RouteDiagnostic[]) {
  try { return parseRoutePath(parts); }
  catch (cause) {
    diagnostics.push({ code: 'VX_ROUTE_SEGMENT_INVALID', severity: 'error', message: message(cause), filePath });
    return undefined;
  }
}

export function createFileSystem(overrides?: Partial<ScannerFileSystem>): ScannerFileSystem {
  return {
    readdirSync: overrides?.readdirSync ?? fs.readdirSync,
    statSync: overrides?.statSync ?? fs.statSync,
    readFileSync: overrides?.readFileSync ?? fs.readFileSync,
    realpathSync: overrides?.realpathSync ?? fs.realpathSync
  };
}

export function reserveGraphEntry(current: number, maximum: number, label: string, filePath: string, diagnostics: RouteDiagnostic[]): boolean {
  if (current < maximum) return true;
  diagnostics.push({
    code: 'VX_ROUTE_GRAPH_SIZE', severity: 'error',
    message: `Application exceeds the maximum of ${maximum} ${label}.`, filePath
  });
  return false;
}

export function exclusiveReservedFile(names: Set<string>, directory: string, candidates: string[], code: string, diagnostics: RouteDiagnostic[]): string | undefined {
  const present = candidates.filter((candidate) => names.has(candidate));
  if (present.length > 1) diagnostics.push({ code, severity: 'error', message: `Directory defines conflicting reserved files: ${present.join(', ')}.`, filePath: directory });
  if (!present[0]) return undefined;
  const joined = directory.startsWith('/') ? path.posix.join(directory, present[0]) : path.join(directory, present[0]);
  return joined.replace(/\\/g, '/');
}

export function validateUtilityModule(
  filePath: string,
  kind: 'loader' | 'middleware',
  fileSystem: ScannerFileSystem,
  diagnostics: RouteDiagnostic[],
  validated: Set<string>
): void {
  if (validated.has(filePath)) return;
  validated.add(filePath);
  const source = readSource(filePath, fileSystem, diagnostics);
  if (source === undefined) return;
  const valid = kind === 'loader'
    ? /\bexport\s+(?:async\s+)?(?:function|const|let|var)\s+load\b/.test(source)
    : /\bexport\s+(?:default\s+|(?:async\s+)?(?:function|const|let|var)\s+middleware\b)/.test(source);
  if (valid) return;
  diagnostics.push({
    code: kind === 'loader' ? 'VX_ROUTE_LOADER_EXPORT' : 'VX_ROUTE_MIDDLEWARE_EXPORT',
    severity: 'error',
    message: kind === 'loader'
      ? 'Route loader module must export load(context).'
      : 'Route middleware module must export middleware(context, next) or a default middleware function.',
    filePath
  });
}

export function readSource(filePath: string, fileSystem: ScannerFileSystem, diagnostics: RouteDiagnostic[]): string | undefined {
  try { return fileSystem.readFileSync(filePath, 'utf8') as string; }
  catch (cause) {
    diagnostics.push({ code: 'VX_ROUTE_SOURCE_READ', severity: 'error', message: `Unable to read route source: ${message(cause)}`, filePath });
    return undefined;
  }
}

export function routeId(routePath: string): string {
  return routePath === '/' ? 'root' : `route:${routePath}`;
}

export function routeName(routePath: string): string {
  if (routePath === '/') return 'home';
  return routePath.slice(1).replace(/[:*?]+/g, '').replace(/\/+/g, '.').replace(/[^A-Za-z0-9_.-]+/g, '-');
}

export function isRouteGroup(name: string): boolean {
  return /^\([^)]+\)$/.test(name);
}

export function emptyData(): ModuleData { return { queries: [], actions: [], forms: [] }; }
export function message(cause: unknown): string { return cause instanceof Error ? cause.message : String(cause); }
