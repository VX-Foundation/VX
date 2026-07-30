import {
  createCsrfToken,
  createRequestRuntime,
  createServerRenderContext,
  dispatchServerAction,
  verifyCsrfToken,
  renderDocument,
  runWithServerRequest,
  type DispatchServerActionOptions,
  type ServerActionAuthorizationContext,
  type ServerActionContract,
  type ServerRenderContext,
  type ServerResourceHint,
  type ServerStyleAsset
} from '@vx/runtime/server';
import { createMemoryFormFlashStore, executeRegisteredServerForm, type DispatchServerFormOptions, type FormFlashState, type FormFlashStore, type ServerFormSecurityContext } from '@vx/forms/server';
import type {
  RouteLocation,
  RuntimeServerEndpointRecord,
  RuntimeServerRouteRecord
} from '../types.js';
import { createRouteLocation, matchEndpoint, matchRoute } from './matcher.js';
import { composeMiddleware, executeRoutePipeline, isRedirectResult } from './lifecycle.js';
import { decodeRouteSearch, normalizeRoutePathname } from './search.js';
import { renderRouteMetadata, resolveRouteTitle } from './metadata.js';
import type { CachedPage } from './server-contract.js';
import { loadServerRouteModules, renderModule, routeProps } from './server-rendering.js';
import {
  CSRF_BINDING_COOKIE,
  FORM_FLASH_COOKIE,
  acceptsHtml,
  cachedResponse,
  createNonce,
  csrfBindingCookie,
  defaultContentSecurityPolicy,
  formFlashCookie,
  formFlashValues,
  interpolateRedirect,
  isCacheFresh,
  methodNotAllowed,
  normalizeBasePath,
  normalizeEndpointResponse,
  publicRouteError,
  requestCookie,
  requestId,
  resolveRedirect,
  securityHeaders,
  selectNotFoundRoute,
  stripBasePath,
  withBasePath,
  withClearedFormFlashCookie,
  withCookie,
  withSecurityHeaders
} from './server-http.js';


export interface ServerEndpointContext {
  request: Request;
  params: Readonly<Record<string, unknown>>;
  runtime: ReturnType<typeof createRequestRuntime>;
  locals: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
}

export interface ServerApplicationOptions {
  routes: readonly RuntimeServerRouteRecord[];
  endpoints?: readonly RuntimeServerEndpointRecord[];
  applicationId?: string;
  basePath?: string;
  clientEntry?: string;
  clientEntryIntegrity?: string;
  styles?: readonly string[];
  styleAssets?: readonly ServerStyleAsset[];
  resourceHints?: readonly ServerResourceHint[];
  csrfSecret?: string | Uint8Array;
  resolveSessionId?: (request: Request) => string | undefined | Promise<string | undefined>;
  createLocals?: (request: Request) => Readonly<Record<string, unknown>> | Promise<Readonly<Record<string, unknown>>>;
  authorizeAction?: (context: ServerActionAuthorizationContext) => boolean | Promise<boolean>;
  verifyActionCsrf?: DispatchServerActionOptions['verifyCsrf'];
  authorizeForm?: (context: ServerFormSecurityContext) => boolean | Promise<boolean>;
  verifyFormCsrf?: DispatchServerFormOptions['verifyCsrf'];
  onError?: (error: unknown, request: Request) => void;
  maxActionBodyBytes?: number;
  maxFormBodyBytes?: number;
  formFlashStore?: FormFlashStore;
  formFlashTtlMs?: number;
  /** Enables the production CSP baseline or replaces it with an application policy. */
  contentSecurityPolicy?: boolean | string;
  /** Returns an application-safe cache partition key, or undefined to bypass generated-route caching. */
  resolveCacheKey?: (request: Request, route: RuntimeServerRouteRecord, location: RouteLocation) => string | undefined | Promise<string | undefined>;
}

export interface ServerApplication {
  handle(request: Request): Promise<Response>;
  render(path: string, init?: RequestInit): Promise<Response>;
  clearIncrementalCache(path?: string): void;
}


interface ResolvedCsrfContext {
  token?: string;
  binding?: string;
  setCookie?: string;
}

export function createServerApplication(options: ServerApplicationOptions): ServerApplication {
  const endpoints = options.endpoints ?? [];
  const basePath = normalizeBasePath(options.basePath);
  const cache = new Map<string, CachedPage>();
  const formFlashStore = options.formFlashStore ?? createMemoryFormFlashStore();

  return {
    handle,
    render(path, init = {}) {
      const url = new URL(path, 'http://vx.local');
      return handle(new Request(url, init));
    },
    clearIncrementalCache(path) {
      if (!path) cache.clear();
      else {
        const pathname = new URL(path, 'http://vx.local').pathname;
        for (const [key, entry] of cache) if (entry.pathname === pathname) cache.delete(key);
      }
    }
  };

  async function handle(request: Request): Promise<Response> {
    try {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/_vx/rpc/')) return handleAction(request);
      if (url.pathname.startsWith('/_vx/form/')) return handleForm(request, url);
      const matchedPath = stripBasePath(url.pathname, basePath);
      if (matchedPath === undefined) return new Response(request.method === 'HEAD' ? null : 'Not Found', { status: 404, headers: securityHeaders({ 'content-type': 'text/plain; charset=utf-8' }) });
      const endpoint = matchEndpoint(matchedPath, endpoints);
      if (endpoint) return handleEndpoint(request, url, endpoint.route, endpoint.params);
      if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD');
      return handleRoute(request, url);
    } catch (error) {
      reportError(error, request);
      return new Response(request.method === 'HEAD' ? null : 'Internal Server Error', { status: 500, headers: securityHeaders({ 'content-type': 'text/plain; charset=utf-8' }) });
    }
  }

  async function handleForm(request: Request, url: URL): Promise<Response> {
    await ensureActionModules(request);
    const formId = decodeURIComponent(url.pathname.slice('/_vx/form/'.length));
    const sessionId = await options.resolveSessionId?.(request);
    const csrfBinding = sessionId ?? requestCookie(request, CSRF_BINDING_COOKIE);
    const execution = await executeRegisteredServerForm(request, {
      formId,
      expectedOrigin: url.origin,
      maxBodyBytes: options.maxFormBodyBytes ?? 16 * 1024 * 1024,
      authorize: options.authorizeForm ?? (() => Boolean(sessionId)),
      ...(options.verifyFormCsrf ? { verifyCsrf: options.verifyFormCsrf } : options.csrfSecret && csrfBinding ? {
        verifyCsrf: async (_incoming: Request, token: string | undefined) => Boolean(token) && verifyCsrfToken(token!, { secret: options.csrfSecret!, binding: csrfBinding })
      } : {})
    });
    const returnURL = formReturnURL(request, url);
    if (!execution.result.ok && execution.rawValues && returnURL && acceptsHtml(request)) {
      const token = requestId();
      const state: FormFlashState = {
        formId,
        values: formFlashValues(execution.rawValues),
        fieldErrors: execution.result.fieldErrors,
        ...(execution.result.formError ? { formError: execution.result.formError } : {}),
        ...(sessionId ? { binding: sessionId } : {})
      };
      await formFlashStore.put(token, state, options.formFlashTtlMs ?? 5 * 60_000);
      return new Response(null, {
        status: 303,
        headers: securityHeaders({
          location: returnURL.pathname + returnURL.search + returnURL.hash,
          'cache-control': 'no-store',
          'set-cookie': formFlashCookie(token, url, basePath, options.formFlashTtlMs ?? 5 * 60_000)
        })
      });
    }
    return withSecurityHeaders(execution.response);
  }

  async function handleAction(request: Request): Promise<Response> {
    const routeId = await ensureActionModules(request);
    const sessionId = await options.resolveSessionId?.(request);
    const locals = await options.createLocals?.(request) ?? Object.freeze({});
    const response = await dispatchServerAction(request, {
      applicationId: options.applicationId ?? 'vx-application',
      ...(sessionId ? { sessionId } : {}),
      ...(routeId ? { routeId } : {}),
      locals,
      maxBodyBytes: options.maxActionBodyBytes ?? 64 * 1024,
      expectedOrigin: new URL(request.url).origin,
      ...(options.authorizeAction ? { authorize: options.authorizeAction } : {}),
      ...(options.verifyActionCsrf ? { verifyCsrf: options.verifyActionCsrf } : options.csrfSecret && sessionId ? {
        verifyCsrf: async (incoming: Request, action: ServerActionContract) => {
          const token = incoming.headers.get('x-vx-csrf');
          if (!token || action.csrf !== 'required') return action.csrf !== 'required';
          const { verifyCsrfToken } = await import('@vx/runtime/server');
          return verifyCsrfToken(token, { secret: options.csrfSecret!, binding: sessionId });
        }
      } : {})
    });
    return withSecurityHeaders(response);
  }

  async function ensureActionModules(request: Request): Promise<string | undefined> {
    const routeHint = request.headers.get('x-vx-route') ?? request.headers.get('referer');
    if (!routeHint) return undefined;
    let pathname: string;
    try { pathname = new URL(routeHint, request.url).pathname; } catch { return undefined; }
    const matchedPath = stripBasePath(pathname, basePath);
    const match = matchedPath === undefined ? null : matchRoute(matchedPath, options.routes);
    if (!match) return undefined;
    const route = match.route;
    const loads: Array<Promise<unknown>> = route.loadLayouts.map((load) => load());
    if (route.loadPage) loads.push(route.loadPage());
    await Promise.all(loads);
    return route.id;
  }

  async function handleEndpoint(
    request: Request,
    url: URL,
    endpoint: RuntimeServerEndpointRecord,
    params: Readonly<Record<string, unknown>>
  ): Promise<Response> {
    if (!endpoint.methods.includes(request.method as never)) return methodNotAllowed(endpoint.methods.join(', '));
    const module = await endpoint.load();
    const handler = module[request.method];
    if (typeof handler !== 'function') return methodNotAllowed(endpoint.methods.join(', '));
    const sessionId = await options.resolveSessionId?.(request);
    const locals = await options.createLocals?.(request) ?? Object.freeze({});
    const runtime = createRequestRuntime({
      requestId: requestId(),
      applicationId: options.applicationId ?? 'vx-application',
      ...(sessionId ? { sessionId } : {}),
      routeId: endpoint.id
    });
    const context: ServerEndpointContext = { request, params, runtime, locals, signal: request.signal };
    const location = createRouteLocation(endpoint, url, params);
    try {
      const middleware = await Promise.all((endpoint.loadMiddleware ?? []).map((load) => load()));
      const result = await runWithServerRequest(
        { request, runtime, routeId: endpoint.id, params, locals, signal: request.signal },
        () => composeMiddleware(middleware, { request, location, params, locals, runtime, signal: request.signal }, async () => {
          const value = await (handler as (request: Request, context: ServerEndpointContext) => unknown)(request, context);
          return normalizeEndpointResponse(value);
        })
      );
      if (result instanceof Response) return withSecurityHeaders(result);
      if (isRedirectResult(result)) return new Response(null, { status: result.status ?? 307, headers: securityHeaders({ location: resolveRedirect(result.redirect, url, basePath) }) });
      if (result === false) return new Response('Forbidden', { status: 403, headers: securityHeaders({ 'content-type': 'text/plain; charset=utf-8' }) });
      return normalizeEndpointResponse(result);
    } finally {
      disposeRequestRuntime(runtime, request);
    }
  }

  async function handleRoute(request: Request, url: URL): Promise<Response> {
    const matchedPath = stripBasePath(url.pathname, basePath);
    const match = matchedPath === undefined ? null : matchRoute(matchedPath, options.routes);
    if (!match) return renderNotFound(request, url);
    const route = match.route;
    const canonicalPath = normalizeRoutePathname(matchedPath!, route.policy.navigation?.trailingSlash ?? 'never');
    if (canonicalPath !== matchedPath) {
      const target = new URL(request.url);
      target.pathname = withBasePath(canonicalPath, basePath);
      return new Response(null, { status: 308, headers: securityHeaders({ location: target.pathname + target.search + target.hash }) });
    }
    if (route.policy.redirect) {
      const location = resolveRedirect(interpolateRedirect(route.policy.redirect.to, match.params), url, basePath);
      return new Response(null, { status: route.policy.redirect.status, headers: securityHeaders({ location }) });
    }
    if (!route.pagePath || !route.loadPage) return new Response('Route has no page.', { status: 500 });

    const rawLocation = createRouteLocation(route, url, match.params);
    let location: RouteLocation;
    try {
      location = Object.freeze({ ...rawLocation, searchValues: decodeRouteSearch(rawLocation.search, route.policy.search) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid route search parameters.';
      return new Response(request.method === 'HEAD' ? null : message, {
        status: 400,
        headers: securityHeaders({ 'content-type': 'text/plain; charset=utf-8' })
      });
    }
    const sessionId = await options.resolveSessionId?.(request);
    const flash = await consumeFormFlash(request, sessionId);
    const cacheKey = route.policy.generation.mode === 'dynamic' || sessionId || (route.forms?.length ?? 0) > 0
      ? undefined
      : await resolveGeneratedCacheKey(request, route, location);
    const cached = cacheKey ? cache.get(cacheKey) : undefined;
    if (cached && isCacheFresh(cached, route.policy.generation.mode, route.policy.generation.revalidateSeconds)) {
      return cachedResponse(cached, request.method === 'HEAD', 'hit');
    }

    let response = await renderMatchedRoute(request, route, location, 200, sessionId, flash.states);
    if (flash.clearCookie) response = withClearedFormFlashCookie(response, url, basePath);
    if (!response.body || route.policy.streaming === 'stream') return response;
    if (cacheKey) {
      const body = await response.text();
      const entry: CachedPage = { pathname: location.url.pathname, body, status: response.status, headers: [...response.headers.entries()], createdAt: Date.now() };
      cache.set(cacheKey, entry);
      return cachedResponse(entry, request.method === 'HEAD', 'miss');
    }
    if (request.method === 'HEAD') return new Response(null, { status: response.status, headers: response.headers });
    return response;
  }

  async function renderMatchedRoute(
    request: Request,
    route: RuntimeServerRouteRecord,
    location: RouteLocation,
    status: number,
    sessionId?: string,
    formStates: Readonly<Record<string, unknown>> = Object.freeze({})
  ): Promise<Response> {
    const locals = await options.createLocals?.(request) ?? Object.freeze({});
    const runtime = createRequestRuntime({
      requestId: requestId(),
      applicationId: options.applicationId ?? 'vx-application',
      ...(sessionId ? { sessionId } : {}),
      routeId: route.id
    });
    const nonce = route.policy.streaming === 'stream' ? createNonce() : undefined;
    const csrf = await resolveCsrfContext(request, route, sessionId, location.url);
    const csrfToken = csrf.token;
    const renderContext = createServerRenderContext({
      runtime,
      routeId: route.id,
      requestURL: location.url,
      hydration: route.policy.render === 'client' ? 'full' : route.policy.hydration,
      streaming: route.policy.streaming,
      ...(nonce ? { nonce } : {}),
      ...(csrfToken ? { csrfToken } : {}),
      formStates,
      signal: request.signal
    });
    let streamTransferred = false;
    try {
      const renderedResult = await runWithServerRequest(
        { request, runtime, routeId: route.id, params: location.params, locals, signal: request.signal },
        async () => {
          const pipeline = await executeRoutePipeline({ route, location, signal: request.signal, request, locals, runtime });
          if (pipeline.middlewareResult !== undefined) return pipeline.middlewareResult;
          const routeProperties = routeProps(location, pipeline.data);
          let rendered = '';
          if (route.policy.render !== 'client') {
            const modules = await loadServerRouteModules(route, request.signal);
            rendered = await renderModule(modules.page, routeProperties, renderContext, {});
            for (let index = modules.layouts.length - 1; index >= 0; index -= 1) {
              const layout = modules.layouts[index]!;
              const child = rendered;
              rendered = await renderModule(layout, routeProperties, renderContext, { route: async () => child });
            }
          }
          return rendered;
        }
      );
      if (renderedResult instanceof Response) { disposeRenderContext(renderContext, request); return withSecurityHeaders(renderedResult); }
      if (isRedirectResult(renderedResult)) {
        disposeRenderContext(renderContext, request);
        return new Response(null, { status: renderedResult.status ?? 307, headers: securityHeaders({ location: resolveRedirect(renderedResult.redirect, location.url, basePath) }) });
      }
      if (renderedResult === false) { disposeRenderContext(renderContext, request); return new Response('Forbidden', { status: 403, headers: securityHeaders({ 'content-type': 'text/plain; charset=utf-8' }) }); }
      const html = typeof renderedResult === 'string' ? renderedResult : '';
      const document = renderDocument({
        context: renderContext,
        html,
        status,
        ...(resolveRouteTitle(route.policy.metadata) ? { title: resolveRouteTitle(route.policy.metadata)! } : {}),
        ...(route.policy.metadata.language ? { language: route.policy.metadata.language } : {}),
        ...(route.policy.streaming === 'stream' ? { onComplete: () => {
          disposeRenderContext(renderContext, request);
          disposeRequestRuntime(runtime, request);
        } } : {}),
        ...(csrfToken ? { csrfToken } : {}),
        ...(options.clientEntry ? { clientEntry: options.clientEntry } : {}),
        ...(options.clientEntryIntegrity ? { clientEntryIntegrity: options.clientEntryIntegrity } : {}),
        ...(options.styles ? { styles: options.styles } : {}),
        ...(options.styleAssets ? { styleAssets: options.styleAssets } : {}),
        ...(options.resourceHints ? { resourceHints: options.resourceHints } : {}),
        head: renderRouteMetadata(route.policy.metadata),
        headers: documentHeaders(nonce)
      });
      if (document.stream) {
        if (request.method === 'HEAD') {
          await document.stream.cancel();
          return new Response(null, { status: document.status, headers: document.headers });
        }
        streamTransferred = true;
        return withCookie(new Response(document.stream, { status: document.status, headers: document.headers }), csrf.setCookie);
      }
      disposeRenderContext(renderContext, request);
      return withCookie(new Response(request.method === 'HEAD' ? null : document.html, { status: document.status, headers: document.headers }), csrf.setCookie);
    } catch (error) {
      reportError(error, request);
      disposeRenderContext(renderContext, request);
      return await renderRouteError(request, route, location, error, runtime, locals, sessionId, formStates);
    } finally {
      if (!streamTransferred) disposeRequestRuntime(runtime, request);
    }
  }

  async function renderRouteError(
    request: Request,
    route: RuntimeServerRouteRecord,
    location: RouteLocation,
    error: unknown,
    runtime: ReturnType<typeof createRequestRuntime>,
    locals: Readonly<Record<string, unknown>>,
    sessionId?: string,
    formStates: Readonly<Record<string, unknown>> = Object.freeze({})
  ): Promise<Response> {
    let errorContext: ServerRenderContext | undefined;
    try {
      if (!route.loadError) throw error;
      const module = await route.loadError();
      const csrf = await resolveCsrfContext(request, route, sessionId, location.url);
      const csrfToken = csrf.token;
      errorContext = createServerRenderContext({
        runtime, routeId: route.id, requestURL: location.url,
        hydration: route.policy.render === 'client' ? 'full' : route.policy.hydration,
        streaming: 'blocking', ...(csrfToken ? { csrfToken } : {}), formStates, signal: request.signal
      });
      const html = await runWithServerRequest(
        { request, runtime, routeId: route.id, params: location.params, locals, signal: request.signal },
        () => renderModule(module, { ...routeProps(location), error: publicRouteError(error) }, errorContext!, {})
      );
      const document = renderDocument({
        context: errorContext, html, status: 500, title: 'Error',
        ...(csrfToken ? { csrfToken } : {}),
        ...(options.clientEntry ? { clientEntry: options.clientEntry } : {}),
        ...(options.clientEntryIntegrity ? { clientEntryIntegrity: options.clientEntryIntegrity } : {}),
        ...(options.styles ? { styles: options.styles } : {}),
        ...(options.styleAssets ? { styleAssets: options.styleAssets } : {}),
        ...(options.resourceHints ? { resourceHints: options.resourceHints } : {}),
        headers: documentHeaders()
      });
      return withCookie(new Response(request.method === 'HEAD' ? null : document.html, { status: 500, headers: document.headers }), csrf.setCookie);
    } catch (boundaryError) {
      reportError(boundaryError, request);
      return new Response(request.method === 'HEAD' ? null : 'Internal Server Error', { status: 500, headers: securityHeaders({ 'content-type': 'text/plain; charset=utf-8' }) });
    } finally {
      if (errorContext) disposeRenderContext(errorContext, request);
      disposeRequestRuntime(runtime, request);
    }
  }

  async function resolveGeneratedCacheKey(
    request: Request,
    route: RuntimeServerRouteRecord,
    location: RouteLocation
  ): Promise<string | undefined> {
    if (options.resolveCacheKey) return options.resolveCacheKey(request, route, location);
    if (request.headers.has('authorization') || request.headers.has('cookie')) return undefined;
    return `${route.id}:${location.url.pathname}${location.url.search}`;
  }

  function reportError(error: unknown, request: Request): void {
    try { options.onError?.(error, request); } catch { /* application error reporting must not break request cleanup */ }
  }

  function disposeRenderContext(context: ServerRenderContext, request: Request): void {
    try { context.dispose(); } catch (error) { reportError(error, request); }
  }

  function disposeRequestRuntime(runtime: ReturnType<typeof createRequestRuntime>, request: Request): void {
    try { runtime.dispose(); } catch (error) { reportError(error, request); }
  }

  async function consumeFormFlash(request: Request, sessionId?: string): Promise<{ states: Readonly<Record<string, unknown>>; clearCookie: boolean }> {
    const token = requestCookie(request, FORM_FLASH_COOKIE);
    if (!token) return { states: Object.freeze({}), clearCookie: false };
    const state = await formFlashStore.take(token);
    if (!state || state.binding !== sessionId) return { states: Object.freeze({}), clearCookie: true };
    return {
      states: Object.freeze({
        [state.formId]: Object.freeze({
          values: state.values,
          fieldErrors: state.fieldErrors,
          ...(state.formError ? { formError: state.formError } : {}),
          submitted: true,
          submitCount: 1
        })
      }),
      clearCookie: true
    };
  }

  function formReturnURL(request: Request, current: URL): URL | undefined {
    const source = request.headers.get('referer');
    if (!source) return undefined;
    try {
      const target = new URL(source, current);
      if (target.origin !== current.origin) return undefined;
      const pathname = stripBasePath(target.pathname, basePath);
      if (pathname === undefined || !matchRoute(pathname, options.routes)) return undefined;
      return target;
    } catch { return undefined; }
  }

  async function resolveCsrfContext(
    request: Request,
    route: Pick<RuntimeServerRouteRecord, 'forms'>,
    sessionId: string | undefined,
    url: URL
  ): Promise<ResolvedCsrfContext> {
    if (!options.csrfSecret) return Object.freeze({});
    const requiresAnonymousBinding = !sessionId && (route.forms?.length ?? 0) > 0;
    if (!sessionId && !requiresAnonymousBinding) return Object.freeze({});
    const existingBinding = sessionId ?? requestCookie(request, CSRF_BINDING_COOKIE);
    const binding = existingBinding ?? requestId();
    const token = await createCsrfToken({ secret: options.csrfSecret, binding });
    return Object.freeze({
      token,
      binding,
      ...(!sessionId && !existingBinding ? { setCookie: csrfBindingCookie(binding, url, basePath) } : {})
    });
  }

  function documentHeaders(nonce?: string): Headers {
    const headers = securityHeaders({});
    const policy = options.contentSecurityPolicy;
    if (policy !== false) {
      headers.set('content-security-policy', typeof policy === 'string' ? policy : defaultContentSecurityPolicy(nonce));
    }
    return headers;
  }

  async function renderNotFound(request: Request, url: URL): Promise<Response> {
    const logicalPath = stripBasePath(url.pathname, basePath) ?? url.pathname;
    const route = selectNotFoundRoute(logicalPath, options.routes);
    if (!route?.loadNotFound) return new Response(request.method === 'HEAD' ? null : 'Not Found', { status: 404, headers: securityHeaders({ 'content-type': 'text/plain; charset=utf-8' }) });
    const logicalURL = new URL(url);
    logicalURL.pathname = logicalPath;
    const sessionId = await options.resolveSessionId?.(request);
    const locals = await options.createLocals?.(request) ?? Object.freeze({});
    const runtime = createRequestRuntime({ requestId: requestId(), applicationId: options.applicationId ?? 'vx-application', ...(sessionId ? { sessionId } : {}), routeId: route.id });
    const csrf = await resolveCsrfContext(request, route, sessionId, url);
    const csrfToken = csrf.token;
    const context = createServerRenderContext({ runtime, routeId: route.id, requestURL: url, hydration: route.policy.render === 'client' ? 'full' : route.policy.hydration, streaming: 'blocking', ...(csrfToken ? { csrfToken } : {}), signal: request.signal });
    try {
      const module = await route.loadNotFound();
      const html = await runWithServerRequest(
        { request, runtime, routeId: route.id, params: Object.freeze({}), locals, signal: request.signal },
        () => renderModule(module, { path: logicalPath, url: logicalURL }, context, {})
      );
      const document = renderDocument({
        context, html, status: 404, title: 'Not Found',
        ...(csrfToken ? { csrfToken } : {}),
        ...(options.clientEntry ? { clientEntry: options.clientEntry } : {}),
        ...(options.clientEntryIntegrity ? { clientEntryIntegrity: options.clientEntryIntegrity } : {}),
        ...(options.styles ? { styles: options.styles } : {}),
        ...(options.styleAssets ? { styleAssets: options.styleAssets } : {}),
        ...(options.resourceHints ? { resourceHints: options.resourceHints } : {}),
        headers: documentHeaders()
      });
      return withCookie(new Response(request.method === 'HEAD' ? null : document.html, { status: 404, headers: document.headers }), csrf.setCookie);
    } finally {
      disposeRenderContext(context, request);
      disposeRequestRuntime(runtime, request);
    }
  }
}
