import { randomUUID } from 'node:crypto';
import { createRequestRuntime } from '@vx/runtime/server';
import { CookieJar } from './cookies.js';
import { currentServerContext, runWithServerContext } from './context.js';
import { composeServerMiddleware } from './middleware.js';
import { createLogger, createTrace, type LoggerOptions } from './observability.js';
import { applyCors, applySecurityHeaders, type CorsOptions, type SecurityHeadersOptions } from './security.js';
import type { RateLimiter } from './rate-limit.js';
import type { SessionManager } from './sessions.js';
import type {
  Awaitable,
  ServerErrorContext,
  ServerErrorResult,
  ServerHandler,
  ServerLogRecord,
  ServerMiddleware,
  ServerRequestContext,
  ServerTraceAttribute
} from './types.js';

export interface ServerPlatformOptions<TLocals extends Record<string, unknown> = Record<string, unknown>, TSession extends Record<string, unknown> = Record<string, unknown>> {
  applicationId?: string;
  middleware?: readonly ServerMiddleware<ServerRequestContext<TLocals, TSession>>[];
  createLocals?: (request: Request) => Awaitable<TLocals>;
  sessions?: SessionManager<TSession>;
  security?: SecurityHeadersOptions;
  cors?: CorsOptions;
  rateLimiter?: RateLimiter;
  rateLimitKey?: (context: ServerRequestContext<TLocals, TSession>) => Awaitable<string>;
  requestTimeoutMs?: number;
  logger?: LoggerOptions;
  onLog?: (record: ServerLogRecord) => void;
  onSpan?: (span: Readonly<{ name: string; startedAt: number; endedAt: number; status: 'ok' | 'error'; attributes: Readonly<Record<string, ServerTraceAttribute>>; exceptions: readonly unknown[] }>) => void;
  onError?: (context: ServerErrorContext) => Awaitable<ServerErrorResult | Response | void>;
  trustRequestId?: boolean;
  trustProxy?: boolean;
  maxWaitUntil?: number;
}

export interface ServerPlatformApplication<TLocals extends Record<string, unknown> = Record<string, unknown>, TSession extends Record<string, unknown> = Record<string, unknown>> {
  handle(request: Request): Promise<Response>;
  context(): ServerRequestContext<TLocals, TSession>;
  waitForBackgroundWork(): Promise<void>;
}

export function createServerPlatform<TLocals extends Record<string, unknown> = Record<string, unknown>, TSession extends Record<string, unknown> = Record<string, unknown>>(
  terminal: ServerHandler<ServerRequestContext<TLocals, TSession>>,
  options: ServerPlatformOptions<TLocals, TSession> = {}
): ServerPlatformApplication<TLocals, TSession> {
  const background = new Set<Promise<unknown>>();
  const middleware = composeServerMiddleware(options.middleware ?? [], terminal);

  return {
    handle,
    context() { return currentServerContext() as ServerRequestContext<TLocals, TSession>; },
    async waitForBackgroundWork() { await Promise.allSettled([...background]); }
  };

  async function handle(incomingRequest: Request): Promise<Response> {
    const requestId = resolveRequestId(incomingRequest, options.trustRequestId === true);
    const startedAt = performance.now();
    const timeout = createRequestDeadline(incomingRequest, options.requestTimeoutMs);
    const request = timeout.request;
    const cookies = new CookieJar(request.headers.get('cookie'));
    const sessionResolution = options.sessions ? await options.sessions.resolve(request, cookies) : undefined;
    const locals = options.createLocals ? await options.createLocals(request) : ({} as TLocals);
    const runtime = createRequestRuntime({
      requestId,
      applicationId: options.applicationId ?? 'vx-application',
      ...(sessionResolution ? { sessionId: sessionResolution.session.id } : {})
    });
    let runtimeDisposed = false;
    let deferredRuntimeDispose = false;
    const disposeRuntime = (): void => {
      if (runtimeDisposed) return;
      runtimeDisposed = true;
      try { runtime.dispose(); } catch (error) { logger.error('Failed to dispose request runtime.', error); }
    };
    const responseHeaders = new Headers({ 'x-request-id': requestId });
    const sink = options.onLog ?? options.logger?.sink;
    const logger = createLogger({ ...options.logger, requestId, ...(sink ? { sink } : {}) });
    const trace = createTrace(options.onSpan);
    const rootSpan = trace.startSpan('vx.server.request', { 'http.method': request.method, 'http.url': request.url });
    const waitUntil = (work: Promise<unknown>): void => {
      if (background.size >= (options.maxWaitUntil ?? 128)) throw new RangeError('Too many background tasks are pending.');
      const guarded = Promise.resolve(work).catch((error) => logger.error('Background server task failed.', error)).finally(() => background.delete(guarded));
      background.add(guarded);
    };
    let activeWork: Promise<Response> | undefined;
    const context: ServerRequestContext<TLocals, TSession> = {
      request,
      url: new URL(request.url),
      requestId,
      startedAt,
      signal: request.signal,
      runtime,
      locals,
      ...(sessionResolution ? { session: sessionResolution.session } : {}),
      responseHeaders,
      waitUntil,
      logger,
      trace
    };

    const complete = async (response: Response): Promise<Response> => {
      const finalized = await finalize(response, context, sessionResolution);
      if (finalized.body && request.method !== 'HEAD') {
        deferredRuntimeDispose = true;
        return responseWithCleanup(finalized, () => {
          try { runtime.dispose(); } catch (error) { logger.error('Failed to dispose streamed request runtime.', error); }
        });
      }
      disposeRuntime();
      return finalized;
    };

    try {
      if (options.rateLimiter) {
        const trustedForwarded = options.trustProxy ? request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim() : undefined;
        const key = options.rateLimitKey ? await options.rateLimitKey(context) : sessionResolution?.session.principal?.id ?? trustedForwarded ?? 'anonymous';
        const decision = await options.rateLimiter.consume(key);
        responseHeaders.set('ratelimit-limit', String(decision.limit));
        responseHeaders.set('ratelimit-remaining', String(decision.remaining));
        responseHeaders.set('ratelimit-reset', String(Math.ceil(decision.resetAt / 1000)));
        if (!decision.allowed) {
          if (decision.retryAfterSeconds) responseHeaders.set('retry-after', String(decision.retryAfterSeconds));
          rootSpan.setAttribute('http.status_code', 429);
          rootSpan.end('ok');
          return complete(new Response('Too Many Requests', { status: 429, headers: responseHeaders }));
        }
      }
      if (options.cors && !applyCors(request, responseHeaders, options.cors)) {
        rootSpan.setAttribute('http.status_code', 403);
        rootSpan.end('ok');
        return complete(new Response('CORS origin denied.', { status: 403, headers: responseHeaders }));
      }
      if (request.method === 'OPTIONS' && options.cors) {
        rootSpan.setAttribute('http.status_code', 204);
        rootSpan.end('ok');
        return complete(new Response(null, { status: 204, headers: responseHeaders }));
      }
      const work = Promise.resolve(runWithServerContext(context, () => middleware(context)));
      activeWork = work;
      const response = timeout.deadline ? await Promise.race([work, timeout.deadline]) : await work;
      rootSpan.setAttribute('http.status_code', response.status);
      rootSpan.end(response.status >= 500 ? 'error' : 'ok');
      return complete(response);
    } catch (error) {
      rootSpan.recordException(error);
      rootSpan.end('error');
      logger.error('Unhandled VX server request failure.', error, { method: request.method, url: request.url });
      if (isTimeoutError(error)) {
        const pending = Promise.resolve(activeWork).catch(() => undefined).finally(disposeRuntime);
        deferredRuntimeDispose = true;
        waitUntil(pending);
      }
      const mapped = await options.onError?.({ request, requestId, error });
      const response = mapped instanceof Response ? mapped : errorResponse(mapped, error);
      return complete(response);
    } finally {
      timeout.dispose();
      if (!deferredRuntimeDispose) disposeRuntime();
    }
  }

  async function finalize(
    response: Response,
    context: ServerRequestContext<TLocals, TSession>,
    resolution: Awaited<ReturnType<SessionManager<TSession>['resolve']>> | undefined
  ): Promise<Response> {
    const headers = new Headers(response.headers);
    for (const [name, value] of context.responseHeaders) if (!headers.has(name)) headers.set(name, value);
    if (resolution) await resolution.commit(headers);
    applySecurityHeaders(headers, options.security);
    headers.set('server-timing', appendServerTiming(headers.get('server-timing'), performance.now() - context.startedAt));
    return new Response(requestMethodHasNoBody(context.request.method) ? null : response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

function resolveRequestId(request: Request, trust: boolean): string {
  const supplied = trust ? request.headers.get('x-request-id') : undefined;
  return supplied && /^[A-Za-z0-9._:-]{8,128}$/.test(supplied) ? supplied : randomUUID();
}

function errorResponse(mapped: ServerErrorResult | void, error: unknown): Response {
  const status = mapped?.status ?? (isTimeoutError(error) ? 504 : error instanceof DOMException && error.name === 'AbortError' ? 499 : 500);
  const message = mapped?.expose ? mapped.message : status >= 500 ? 'Internal Server Error' : mapped?.message ?? 'Request failed.';
  const headers = new Headers(mapped?.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify({ ok: false, error: { code: mapped?.code ?? 'VX_SERVER_INTERNAL', message } }), { status, headers });
}

function appendServerTiming(existing: string | null, duration: number): string {
  const metric = `vx;dur=${duration.toFixed(2)}`;
  return existing ? `${existing}, ${metric}` : metric;
}

function requestMethodHasNoBody(method: string): boolean { return method === 'HEAD'; }

function createRequestDeadline(request: Request, timeoutMs: number | undefined): { request: Request; deadline?: Promise<Response>; dispose(): void } {
  if (timeoutMs === undefined) return { request, dispose() {} };
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Server request timeout must be a positive number.');
  const controller = new AbortController();
  const parentAbort = (): void => controller.abort(request.signal.reason ?? new DOMException('Request aborted.', 'AbortError'));
  request.signal.addEventListener('abort', parentAbort, { once: true });
  let rejectDeadline: ((error: unknown) => void) | undefined;
  const deadline = new Promise<Response>((_resolve, reject) => { rejectDeadline = reject; });
  const timer = setTimeout(() => {
    const error = new DOMException('Request timed out.', 'TimeoutError');
    controller.abort(error);
    rejectDeadline?.(error);
  }, timeoutMs);
  timer.unref?.();
  const effective = new Request(request, { signal: controller.signal });
  return {
    request: effective,
    deadline,
    dispose() { clearTimeout(timer); request.signal.removeEventListener('abort', parentAbort); }
  };
}

function responseWithCleanup(response: Response, cleanup: () => void): Response {
  if (!response.body) { cleanup(); return response; }
  const reader = response.body.getReader();
  let cleaned = false;
  const finish = (): void => { if (!cleaned) { cleaned = true; cleanup(); } };
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const result = await reader.read();
        if (result.done) { finish(); controller.close(); }
        else controller.enqueue(result.value);
      } catch (error) { finish(); controller.error(error); }
    },
    async cancel(reason) { try { await reader.cancel(reason); } finally { finish(); } }
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function isTimeoutError(error: unknown): boolean { return error instanceof DOMException && error.name === 'TimeoutError'; }
