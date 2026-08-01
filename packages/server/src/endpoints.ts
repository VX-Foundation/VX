import { createRequestRuntime, type RequestRuntime } from '@vx-foundation/runtime/server';
import { parseRequestBody, type BodyLimits, type ParsedRequestBody } from './body.js';
import { createLogger, createTrace } from './observability.js';
import { json } from './responses.js';
import type { Awaitable, ServerLogger, ServerRequestContext, ServerSession, ServerTrace, ServerWaitUntil } from './types.js';

export interface EndpointCodec<T> {
  parse(value: unknown): T;
  serialize?(value: T): unknown;
}

export interface EndpointContract<TInput = ParsedRequestBody, TOutput = unknown> {
  id: string;
  methods: readonly string[];
  body?: BodyLimits & { codec?: EndpointCodec<TInput> };
  output?: EndpointCodec<TOutput>;
  contentTypes?: readonly string[];
}

export interface EndpointInvocation<TInput> {
  context: ServerRequestContext;
  input: TInput;
  params: Readonly<Record<string, unknown>>;
}

export interface DefinedEndpoint {
  readonly contract: EndpointContract<unknown, unknown>;
  handle(context: ServerRequestContext, routeContext?: Pick<EndpointRouteContext, 'params'>): Promise<Response>;
}

/** Public bridge between a file-system route handler and a typed endpoint contract. */
export interface EndpointRouteContext {
  readonly params?: Readonly<Record<string, unknown>>;
  readonly runtime?: RequestRuntime;
  readonly locals?: Readonly<Record<string, unknown>>;
  readonly signal?: AbortSignal;
  readonly session?: ServerSession;
  readonly waitUntil?: ServerWaitUntil;
  readonly logger?: ServerLogger;
  readonly trace?: ServerTrace;
}

export type EndpointRouteHandler = (request: Request, context?: EndpointRouteContext) => Promise<Response>;

export function createRouteEndpointHandler(endpoint: DefinedEndpoint): EndpointRouteHandler {
  return async (request, routeContext = {}) => {
    const ownsRuntime = routeContext.runtime === undefined;
    const runtime = routeContext.runtime ?? createRequestRuntime({
      requestId: createEndpointRequestId(),
      applicationId: 'vx-route-endpoint'
    });
    const responseHeaders = new Headers();
    const logger = routeContext.logger ?? createLogger({ requestId: runtime.requestId });
    const pendingBackground: Promise<void>[] = [];
    const fallbackWaitUntil: ServerWaitUntil = (work) => {
      pendingBackground.push(Promise.resolve(work).then(
        () => undefined,
        (error) => { logger.error('Endpoint background work failed.', error); }
      ));
    };
    const context: ServerRequestContext = {
      request,
      url: new URL(request.url),
      requestId: runtime.requestId,
      startedAt: Date.now(),
      signal: routeContext.signal ?? request.signal,
      runtime,
      locals: Object.freeze({ ...(routeContext.locals ?? {}) }),
      ...(routeContext.session ? { session: routeContext.session } : {}),
      responseHeaders,
      waitUntil: routeContext.waitUntil ?? fallbackWaitUntil,
      logger,
      trace: routeContext.trace ?? createTrace()
    };
    try {
      const response = await endpoint.handle(context, routeContext);
      if (pendingBackground.length) await Promise.all(pendingBackground);
      return mergeEndpointHeaders(response, responseHeaders);
    } finally {
      if (ownsRuntime) runtime.dispose();
    }
  };
}

export function defineEndpoint<TInput = ParsedRequestBody, TOutput = unknown>(
  contract: EndpointContract<TInput, TOutput>,
  handler: (invocation: EndpointInvocation<TInput>) => Awaitable<TOutput | Response>
): DefinedEndpoint {
  const normalized = normalizeEndpointContract(contract);
  return {
    contract: normalized as EndpointContract<unknown, unknown>,
    async handle(context, routeContext = {}) {
      if (!normalized.methods.includes(context.request.method)) {
        return new Response('Method Not Allowed', { status: 405, headers: { allow: normalized.methods.join(', '), 'content-type': 'text/plain; charset=utf-8' } });
      }
      const contentType = context.request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
      if (normalized.contentTypes?.length && contentType && !normalized.contentTypes.includes(contentType)) {
        return json({ ok: false, error: { code: 'VX_ENDPOINT_CONTENT_TYPE', message: 'Unsupported content type.' } }, { status: 415 });
      }
      try {
        const parsed = await parseRequestBody(context.request, normalized.body);
        const input = normalized.body?.codec ? normalized.body.codec.parse(parsed.value) : parsed as TInput;
        const output = await handler({ context, input, params: Object.freeze({ ...(routeContext.params ?? {}) }) });
        if (output instanceof Response) return output;
        const serialized = normalized.output?.serialize ? normalized.output.serialize(output) : output;
        return json(serialized);
      } catch (error) {
        if (error instanceof RangeError || error instanceof TypeError || error instanceof SyntaxError) {
          return json({ ok: false, error: { code: 'VX_ENDPOINT_INPUT', message: error.message } }, { status: 400 });
        }
        throw error;
      }
    }
  };
}

function normalizeEndpointContract<TInput, TOutput>(contract: EndpointContract<TInput, TOutput>): EndpointContract<TInput, TOutput> {
  if (!/^[A-Za-z0-9._:-]{1,256}$/.test(contract.id)) throw new TypeError('Endpoint contracts require a stable id.');
  const methods = [...new Set(contract.methods.map((method) => method.toUpperCase()))];
  if (!methods.length || methods.some((method) => !/^[A-Z]+$/.test(method))) throw new TypeError('Endpoint contracts require valid HTTP methods.');
  return Object.freeze({ ...contract, methods: Object.freeze(methods), ...(contract.contentTypes ? { contentTypes: Object.freeze(contract.contentTypes.map((value) => value.toLowerCase())) } : {}) });
}

function mergeEndpointHeaders(response: Response, additional: Headers): Response {
  if (![...additional].length) return response;
  const headers = new Headers(response.headers);
  additional.forEach((value, name) => headers.set(name, value));
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function createEndpointRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `vx-endpoint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
