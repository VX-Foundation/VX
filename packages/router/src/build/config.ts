import type * as fs from 'node:fs';
import type {
  RouteDiagnostic,
  RouteGenerationPolicy,
  RouteHydrationPolicy,
  RouteMetadata,
  RouteNavigationPolicy,
  RoutePolicy,
  RoutePreloadPolicy,
  RoutePreservationPolicy,
  RouteRedirect,
  RouteRenderPolicy,
  RouteSearchParameter,
  RouteStreamingPolicy
} from '../types.js';

export interface RouteConfigFile {
  name?: string;
  render?: RouteRenderPolicy;
  preload?: RoutePreloadPolicy;
  hydration?: RouteHydrationPolicy;
  streaming?: RouteStreamingPolicy;
  generation?: Partial<RouteGenerationPolicy> & Pick<RouteGenerationPolicy, 'mode'>;
  metadata?: RouteMetadata;
  preserve?: Partial<RoutePreservationPolicy>;
  navigation?: Partial<RouteNavigationPolicy>;
  search?: readonly RouteSearchParameter[];
  redirect?: Partial<RouteRedirect> & Pick<RouteRedirect, 'to'>;
}

export const DEFAULT_ROUTE_POLICY: RoutePolicy = Object.freeze({
  render: 'client',
  preload: 'intent',
  hydration: 'islands',
  streaming: 'blocking',
  generation: Object.freeze({ mode: 'dynamic', entries: Object.freeze([]) }),
  metadata: Object.freeze({}),
  preserve: Object.freeze({ state: false, scroll: true, focus: true }),
  navigation: Object.freeze({ trailingSlash: 'never', caseSensitive: true, announce: true, viewTransition: false }),
  search: Object.freeze([])
});

export function readRouteConfig(
  filePath: string,
  fileSystem: Pick<typeof fs, 'readFileSync'>,
  diagnostics: RouteDiagnostic[]
): RouteConfigFile | undefined {
  try {
    const value: unknown = JSON.parse(fileSystem.readFileSync(filePath, 'utf8'));
    if (!isRecord(value)) throw new Error('Route configuration must contain a JSON object.');
    validateConfig(value, filePath);
    return value as RouteConfigFile;
  } catch (cause) {
    diagnostics.push({
      code: 'VX_ROUTE_CONFIG_INVALID',
      severity: 'error',
      message: `Unable to read route configuration: ${cause instanceof Error ? cause.message : String(cause)}`,
      filePath,
      suggestion: 'Use static JSON values from the documented route, data, navigation, metadata, redirect, and rendering contracts.'
    });
    return undefined;
  }
}

export function mergeRoutePolicy(parent: RoutePolicy, config?: RouteConfigFile): RoutePolicy {
  const redirect = config?.redirect ? normalizeRedirect(config.redirect) : parent.redirect;
  const render = config?.render ?? parent.render;
  const generation = normalizeGeneration(parent.generation, config?.generation, render);
  const navigation = {
    trailingSlash: config?.navigation?.trailingSlash ?? parent.navigation?.trailingSlash ?? 'never',
    caseSensitive: config?.navigation?.caseSensitive ?? parent.navigation?.caseSensitive ?? true,
    announce: config?.navigation?.announce ?? parent.navigation?.announce ?? true,
    viewTransition: config?.navigation?.viewTransition ?? parent.navigation?.viewTransition ?? false
  } satisfies RouteNavigationPolicy;
  return {
    render,
    preload: config?.preload ?? parent.preload,
    hydration: config?.hydration ?? parent.hydration,
    streaming: config?.streaming ?? parent.streaming,
    generation,
    metadata: mergeMetadata(parent.metadata, config?.metadata),
    preserve: { ...parent.preserve, ...config?.preserve },
    navigation,
    search: config?.search ? Object.freeze(config.search.map((entry) => Object.freeze({ ...entry }))) : parent.search ?? Object.freeze([]),
    ...(redirect ? { redirect } : {})
  };
}

function mergeMetadata(parent: RouteMetadata, child?: RouteMetadata): RouteMetadata {
  if (!child) return parent;
  return {
    ...parent,
    ...child,
    ...(child.alternates ? { alternates: Object.freeze(child.alternates.map((entry) => Object.freeze({ ...entry }))) } : parent.alternates ? { alternates: parent.alternates } : {}),
    ...(parent.openGraph || child.openGraph ? { openGraph: { ...parent.openGraph, ...child.openGraph, ...(child.openGraph?.images ? { images: Object.freeze([...child.openGraph.images]) } : parent.openGraph?.images ? { images: parent.openGraph.images } : {}) } } : {}),
    ...(parent.twitter || child.twitter ? { twitter: { ...parent.twitter, ...child.twitter, ...(child.twitter?.images ? { images: Object.freeze([...child.twitter.images]) } : parent.twitter?.images ? { images: parent.twitter.images } : {}) } } : {}),
    ...(child.structuredData !== undefined ? { structuredData: child.structuredData } : parent.structuredData !== undefined ? { structuredData: parent.structuredData } : {}),
    custom: { ...parent.custom, ...child.custom }
  };
}

function normalizeGeneration(
  parent: RouteGenerationPolicy,
  value: RouteConfigFile['generation'],
  render: RouteRenderPolicy
): RouteGenerationPolicy {
  if (!value) {
    if (render === 'static' && parent.mode === 'dynamic') return { mode: 'static', entries: Object.freeze([]) };
    return parent;
  }
  return {
    mode: value.mode,
    ...(value.revalidateSeconds !== undefined ? { revalidateSeconds: value.revalidateSeconds } : {}),
    entries: Object.freeze((value.entries ?? []).map((entry) => Object.freeze({ ...entry })))
  };
}

function normalizeRedirect(value: Partial<RouteRedirect> & Pick<RouteRedirect, 'to'>): RouteRedirect {
  return { to: value.to, status: value.status ?? 307, replace: value.replace ?? true };
}

function validateConfig(value: Record<string, unknown>, filePath: string): void {
  assertAllowedFields(value, ['name', 'render', 'preload', 'hydration', 'streaming', 'generation', 'metadata', 'preserve', 'navigation', 'search', 'redirect'], 'route configuration', filePath);
  if (value['name'] !== undefined && (typeof value['name'] !== 'string' || !/^[A-Za-z][A-Za-z0-9_.-]*$/.test(value['name']))) throw new Error('Route name must start with a letter and contain only letters, numbers, dot, underscore, or hyphen.');
  if (value['render'] !== undefined && !isOneOf(value['render'], ['client', 'server', 'static'])) throw new Error(`Invalid render policy '${String(value['render'])}'.`);
  if (value['preload'] !== undefined && !isOneOf(value['preload'], ['none', 'intent', 'visible', 'eager'])) throw new Error(`Invalid preload policy '${String(value['preload'])}'.`);
  if (value['hydration'] !== undefined && !isOneOf(value['hydration'], ['full', 'islands', 'none'])) throw new Error(`Invalid hydration policy '${String(value['hydration'])}'.`);
  if (value['streaming'] !== undefined && !isOneOf(value['streaming'], ['blocking', 'stream'])) throw new Error(`Invalid streaming policy '${String(value['streaming'])}'.`);
  if (value['generation'] !== undefined) validateGeneration(value['generation'], filePath);
  if (value['metadata'] !== undefined) validateMetadata(value['metadata'], filePath);
  if (value['preserve'] !== undefined) validatePreservation(value['preserve'], filePath);
  if (value['navigation'] !== undefined) validateNavigation(value['navigation'], filePath);
  if (value['search'] !== undefined) validateSearch(value['search'], filePath);
  if (value['redirect'] !== undefined) validateRedirect(value['redirect'], filePath);
}

function validateGeneration(value: unknown, filePath: string): void {
  if (!isRecord(value)) throw new Error('Route generation policy must be an object.');
  assertAllowedFields(value, ['mode', 'revalidateSeconds', 'entries'], 'route generation policy', filePath);
  if (!isOneOf(value['mode'], ['dynamic', 'static', 'incremental'])) throw new Error(`Invalid generation mode '${String(value['mode'])}'.`);
  if (value['revalidateSeconds'] !== undefined && (!Number.isInteger(value['revalidateSeconds']) || (value['revalidateSeconds'] as number) <= 0)) throw new Error('Route generation revalidateSeconds must be a positive integer.');
  if (value['mode'] === 'incremental' && value['revalidateSeconds'] === undefined) throw new Error('Incremental routes require revalidateSeconds.');
  if (value['mode'] !== 'incremental' && value['revalidateSeconds'] !== undefined) throw new Error('revalidateSeconds is valid only for incremental routes.');
  if (value['entries'] !== undefined) {
    if (!Array.isArray(value['entries'])) throw new Error('Route generation entries must be an array.');
    for (const entry of value['entries']) {
      if (!isRecord(entry)) throw new Error('Each route generation entry must be an object.');
      for (const [name, item] of Object.entries(entry)) if (!name || !['string', 'number', 'boolean'].includes(typeof item)) throw new Error(`Invalid static route parameter '${name}'.`);
    }
  }
}

function validateMetadata(value: unknown, filePath: string): void {
  if (!isRecord(value)) throw new Error('Route metadata must be an object.');
  assertAllowedFields(value, ['title', 'titleTemplate', 'description', 'language', 'robots', 'canonical', 'image', 'alternates', 'openGraph', 'twitter', 'structuredData', 'custom'], 'route metadata', filePath);
  for (const name of ['title', 'titleTemplate', 'description', 'language', 'robots', 'canonical', 'image']) {
    const field = value[name];
    if (field !== undefined && typeof field !== 'string') throw new Error(`Route metadata '${name}' must be a string.`);
  }
  if (value['alternates'] !== undefined) {
    if (!Array.isArray(value['alternates'])) throw new Error('Route metadata alternates must be an array.');
    for (const alternate of value['alternates']) {
      if (!isRecord(alternate)) throw new Error('Each alternate language entry must be an object.');
      assertAllowedFields(alternate, ['language', 'href'], 'alternate language', filePath);
      if (typeof alternate['language'] !== 'string' || typeof alternate['href'] !== 'string') throw new Error('Alternate language entries require string language and href fields.');
    }
  }
  if (value['openGraph'] !== undefined) validateStringObject(value['openGraph'], ['title', 'description', 'type', 'url', 'siteName', 'locale'], ['images'], 'Open Graph metadata', filePath);
  if (value['twitter'] !== undefined) {
    validateStringObject(value['twitter'], ['card', 'site', 'creator', 'title', 'description'], ['images'], 'Twitter metadata', filePath);
    const card = (value['twitter'] as Record<string, unknown>)['card'];
    if (card !== undefined && !isOneOf(card, ['summary', 'summary_large_image', 'app', 'player'])) throw new Error(`Unsupported Twitter card '${String(card)}'.`);
  }
  if (value['structuredData'] !== undefined && !isRecord(value['structuredData']) && !Array.isArray(value['structuredData'])) throw new Error('Route metadata structuredData must be an object or array of objects.');
  if (Array.isArray(value['structuredData']) && value['structuredData'].some((item) => !isRecord(item))) throw new Error('Every structuredData entry must be an object.');
  if (value['custom'] !== undefined) {
    if (!isRecord(value['custom'])) throw new Error('Route metadata custom values must be an object.');
    for (const [name, content] of Object.entries(value['custom'])) if (typeof content !== 'string') throw new Error(`Custom route metadata '${name}' must be a string.`);
  }
}

function validateStringObject(value: unknown, stringFields: readonly string[], arrayFields: readonly string[], label: string, filePath: string): void {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  assertAllowedFields(value, [...stringFields, ...arrayFields], label, filePath);
  for (const name of stringFields) if (value[name] !== undefined && typeof value[name] !== 'string') throw new Error(`${label} '${name}' must be a string.`);
  for (const name of arrayFields) if (value[name] !== undefined && (!Array.isArray(value[name]) || (value[name] as unknown[]).some((item) => typeof item !== 'string'))) throw new Error(`${label} '${name}' must be an array of strings.`);
}

function validatePreservation(value: unknown, filePath: string): void {
  if (!isRecord(value)) throw new Error('Route preservation policy must be an object.');
  assertAllowedFields(value, ['state', 'scroll', 'focus'], 'route preservation policy', filePath);
  for (const name of ['state', 'scroll', 'focus']) if (value[name] !== undefined && typeof value[name] !== 'boolean') throw new Error(`Route preservation '${name}' must be a boolean.`);
}

function validateNavigation(value: unknown, filePath: string): void {
  if (!isRecord(value)) throw new Error('Route navigation policy must be an object.');
  assertAllowedFields(value, ['trailingSlash', 'caseSensitive', 'announce', 'viewTransition'], 'route navigation policy', filePath);
  if (value['trailingSlash'] !== undefined && !isOneOf(value['trailingSlash'], ['preserve', 'always', 'never'])) throw new Error(`Invalid trailingSlash policy '${String(value['trailingSlash'])}'.`);
  for (const name of ['caseSensitive', 'announce', 'viewTransition']) if (value[name] !== undefined && typeof value[name] !== 'boolean') throw new Error(`Route navigation '${name}' must be a boolean.`);
}

function validateSearch(value: unknown, filePath: string): void {
  if (!Array.isArray(value)) throw new Error('Route search contract must be an array.');
  const names = new Set<string>();
  for (const item of value) {
    if (!isRecord(item)) throw new Error('Each route search parameter must be an object.');
    assertAllowedFields(item, ['name', 'kind', 'required', 'repeat', 'defaultValue'], 'route search parameter', filePath);
    if (typeof item['name'] !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(item['name'])) throw new Error('Route search parameter name is invalid.');
    if (names.has(item['name'])) throw new Error(`Route search parameter '${item['name']}' is declared more than once.`);
    names.add(item['name']);
    if (!isOneOf(item['kind'], ['string', 'integer', 'number', 'boolean', 'uuid', 'slug'])) throw new Error(`Invalid route search parameter kind '${String(item['kind'])}'.`);
    if (typeof item['required'] !== 'boolean' || typeof item['repeat'] !== 'boolean') throw new Error(`Route search parameter '${item['name']}' requires boolean required and repeat fields.`);
    if (item['defaultValue'] !== undefined && !['string', 'number', 'boolean'].includes(typeof item['defaultValue'])) throw new Error(`Route search parameter '${item['name']}' has an invalid defaultValue.`);
    if (item['required'] === true && item['defaultValue'] !== undefined) throw new Error(`Required route search parameter '${item['name']}' cannot define defaultValue.`);
    if (item['repeat'] === true && item['defaultValue'] !== undefined) throw new Error(`Repeated route search parameter '${item['name']}' cannot define a scalar defaultValue.`);
    validateSearchDefault(item['name'], item['kind'], item['defaultValue']);
  }
}

function validateSearchDefault(name: unknown, kind: unknown, value: unknown): void {
  if (value === undefined) return;
  const label = String(name);
  if (kind === 'integer') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`Route search parameter '${label}' requires a safe-integer defaultValue.`);
    return;
  }
  if (kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Route search parameter '${label}' requires a finite-number defaultValue.`);
    return;
  }
  if (kind === 'boolean') {
    if (typeof value !== 'boolean') throw new Error(`Route search parameter '${label}' requires a boolean defaultValue.`);
    return;
  }
  if (typeof value !== 'string') throw new Error(`Route search parameter '${label}' requires a string defaultValue.`);
  if (kind === 'slug' && !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value)) throw new Error(`Route search parameter '${label}' requires a slug defaultValue.`);
  if (kind === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new Error(`Route search parameter '${label}' requires a UUID defaultValue.`);
}

function validateRedirect(value: unknown, filePath: string): void {
  if (!isRecord(value)) throw new Error('Route redirect must be an object.');
  assertAllowedFields(value, ['to', 'status', 'replace'], 'route redirect', filePath);
  if (typeof value['to'] !== 'string' || value['to'].trim().length === 0) throw new Error('Route redirect must define a non-empty string destination in to.');
  const status = value['status'];
  if (status !== undefined && (typeof status !== 'number' || ![301, 302, 303, 307, 308].includes(status))) throw new Error(`Unsupported redirect status '${String(status)}'.`);
  if (value['replace'] !== undefined && typeof value['replace'] !== 'boolean') throw new Error('Route redirect replace must be a boolean.');
}

function assertAllowedFields(value: Record<string, unknown>, allowed: readonly string[], label: string, filePath: string): void {
  const fieldSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!fieldSet.has(key)) throw new Error(`Unknown ${label} field '${key}' in '${filePath}'.`);
}

function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
