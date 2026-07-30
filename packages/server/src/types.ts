import type { RequestRuntime } from '@vx/runtime/server';

export type Awaitable<T> = T | Promise<T>;

export interface ServerPrincipal {
  id: string;
  roles?: readonly string[];
  permissions?: readonly string[];
  claims?: Readonly<Record<string, unknown>>;
}

export interface ServerSession<TData extends Record<string, unknown> = Record<string, unknown>> {
  readonly id: string;
  data: TData;
  principal: ServerPrincipal | undefined;
  createdAt: number;
  expiresAt: number;
  readonly isNew: boolean;
  readonly isDirty: boolean;
  readonly isDestroyed: boolean;
  set<TKey extends keyof TData>(key: TKey, value: TData[TKey]): void;
  delete<TKey extends keyof TData>(key: TKey): void;
  regenerate(): void;
  destroy(): void;
}

export interface ServerWaitUntil {
  (work: Promise<unknown>): void;
}

export interface ServerRequestContext<TLocals extends Record<string, unknown> = Record<string, unknown>, TSession extends Record<string, unknown> = Record<string, unknown>> {
  readonly request: Request;
  readonly url: URL;
  readonly requestId: string;
  readonly startedAt: number;
  readonly signal: AbortSignal;
  readonly runtime: RequestRuntime;
  readonly locals: TLocals;
  readonly session?: ServerSession<TSession>;
  readonly responseHeaders: Headers;
  readonly waitUntil: ServerWaitUntil;
  readonly logger: ServerLogger;
  readonly trace: ServerTrace;
}

export interface ServerLogRecord {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  requestId?: string;
  fields?: Readonly<Record<string, unknown>>;
  error?: unknown;
}

export interface ServerLogger {
  debug(message: string, fields?: Readonly<Record<string, unknown>>): void;
  info(message: string, fields?: Readonly<Record<string, unknown>>): void;
  warn(message: string, fields?: Readonly<Record<string, unknown>>): void;
  error(message: string, error?: unknown, fields?: Readonly<Record<string, unknown>>): void;
}

export type ServerTraceAttributeValue = ReadonlyArray<string | number | boolean>;
export type ServerTraceAttribute = string | number | boolean | ServerTraceAttributeValue;

export interface ServerSpan {
  readonly name: string;
  readonly startedAt: number;
  setAttribute(name: string, value: ServerTraceAttribute): void;
  recordException(error: unknown): void;
  end(status?: 'ok' | 'error'): void;
}

export interface ServerTrace {
  startSpan(name: string, attributes?: Readonly<Record<string, ServerTraceAttribute>>): ServerSpan;
}

export interface ServerHandler<TContext extends ServerRequestContext = ServerRequestContext> {
  (context: TContext): Awaitable<Response>;
}

export interface ServerMiddleware<TContext extends ServerRequestContext = ServerRequestContext> {
  (context: TContext, next: () => Promise<Response>): Awaitable<Response>;
}

export interface ServerErrorContext {
  request: Request;
  requestId: string;
  error: unknown;
}

export interface ServerErrorResult {
  status: number;
  code: string;
  message: string;
  expose?: boolean;
  headers?: HeadersInit;
}
