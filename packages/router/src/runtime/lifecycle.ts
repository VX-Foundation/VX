import type {
  RouteLoaderContext,
  RouteLoaderModule,
  RouteLocation,
  RouteMiddlewareContext,
  RouteMiddlewareModule,
  RouteMiddlewareResult,
  RoutePolicy
} from '../types.js';
import { decodeRouteSearch } from './search.js';

interface PipelineRoute {
  policy: RoutePolicy;
  loadLoaders?: Array<() => Promise<RouteLoaderModule>>;
  loadMiddleware?: Array<() => Promise<RouteMiddlewareModule>>;
}

export interface ExecuteRoutePipelineOptions {
  route: PipelineRoute;
  location: RouteLocation;
  signal: AbortSignal;
  request?: Request;
  locals?: Readonly<Record<string, unknown>>;
  runtime?: object;
}

export interface RoutePipelineResult {
  data: Readonly<Record<string, unknown>>;
  middlewareResult?: Exclude<RouteMiddlewareResult, void | true>;
}

export async function executeRoutePipeline(options: ExecuteRoutePipelineOptions): Promise<RoutePipelineResult> {
  const searchValues = decodeRouteSearch(options.location.search, options.route.policy.search);
  const location: RouteLocation = Object.freeze({ ...options.location, searchValues });
  const middlewareModules = await Promise.all((options.route.loadMiddleware ?? []).map((load) => load()));
  assertActive(options.signal);
  let data: Readonly<Record<string, unknown>> = Object.freeze({});
  const middlewareContext: RouteMiddlewareContext = {
    ...(options.request ? { request: options.request } : {}),
    location,
    params: location.params,
    signal: options.signal,
    ...(options.locals ? { locals: options.locals } : {}),
    ...(options.runtime ? { runtime: options.runtime } : {})
  };
  const terminal = async (): Promise<RouteMiddlewareResult> => {
    data = await executeRouteLoaders({ ...options, location }, searchValues);
    middlewareContext.data = data;
    return undefined;
  };
  const result = await composeMiddleware(middlewareModules, middlewareContext, terminal);
  assertActive(options.signal);
  return {
    data,
    ...(result !== undefined && result !== true ? { middlewareResult: result as Exclude<RouteMiddlewareResult, void | true> } : {})
  };
}

export async function executeRouteLoaders(
  options: ExecuteRoutePipelineOptions,
  searchValues: Readonly<Record<string, unknown>> = decodeRouteSearch(options.location.search, options.route.policy.search)
): Promise<Readonly<Record<string, unknown>>> {
  const modules = await Promise.all((options.route.loadLoaders ?? []).map((load) => load()));
  let parentData: Readonly<Record<string, unknown>> = Object.freeze({});
  for (let index = 0; index < modules.length; index += 1) {
    assertActive(options.signal);
    const module = modules[index]!;
    if (!module.load) continue;
    const context: RouteLoaderContext = {
      location: options.location,
      params: options.location.params,
      search: searchValues,
      parentData,
      signal: options.signal,
      ...(options.request ? { request: options.request } : {}),
      ...(options.locals ? { locals: options.locals } : {}),
      ...(options.runtime ? { runtime: options.runtime } : {})
    };
    const value = await module.load(context);
    assertActive(options.signal);
    if (value === undefined) continue;
    if (!isRecord(value)) throw new TypeError(`Route loader ${index + 1} must return an object or undefined.`);
    const duplicate = Object.keys(value).find((name) => Object.prototype.hasOwnProperty.call(parentData, name));
    if (duplicate) throw new Error(`Route loader ${index + 1} attempted to redefine data key '${duplicate}'.`);
    parentData = Object.freeze({ ...parentData, ...value });
  }
  return parentData;
}

export async function composeMiddleware(
  modules: readonly RouteMiddlewareModule[],
  context: RouteMiddlewareContext,
  terminal: () => Promise<RouteMiddlewareResult>
): Promise<RouteMiddlewareResult> {
  const stack = modules.map((module, index) => {
    const middleware = module.middleware ?? module.default;
    if (!middleware) throw new TypeError(`Route middleware module ${index + 1} does not export middleware or default.`);
    return middleware;
  });
  let cursor = -1;
  const dispatch = async (index: number): Promise<RouteMiddlewareResult> => {
    if (index <= cursor) throw new Error('Route middleware called next() more than once.');
    cursor = index;
    assertActive(context.signal);
    const middleware = stack[index];
    if (!middleware) return terminal();
    return middleware(context, () => dispatch(index + 1));
  };
  return dispatch(0);
}

export function isRedirectResult(value: unknown): value is { redirect: string; status?: number; replace?: boolean } {
  return isRecord(value) && typeof value['redirect'] === 'string';
}

function assertActive(signal: AbortSignal): void {
  if (signal.aborted) throw signal.reason ?? new DOMException('Route execution cancelled.', 'AbortError');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
