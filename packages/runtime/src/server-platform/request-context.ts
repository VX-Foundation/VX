import type { RequestRuntime } from '../request-runtime.js';

export interface ServerRequestContext {
  request: Request;
  runtime: RequestRuntime;
  routeId?: string;
  params: Readonly<Record<string, unknown>>;
  locals: Readonly<Record<string, unknown>>;
  signal: AbortSignal;
}

interface AsyncRequestStorage<T> {
  run<R>(value: T, operation: () => R): R;
  getStore(): T | undefined;
}

const storage = await createRequestStorage();

export function runWithServerRequest<T>(context: ServerRequestContext, operation: () => T): T {
  return storage.run(context, operation);
}

export function currentServerRequest(): ServerRequestContext {
  const context = storage.getStore();
  if (!context) throw new Error('No active VX server request context.');
  return context;
}

export function optionalServerRequest(): ServerRequestContext | undefined {
  return storage.getStore();
}

async function createRequestStorage(): Promise<AsyncRequestStorage<ServerRequestContext>> {
  const native = (globalThis as typeof globalThis & {
    AsyncLocalStorage?: new <T>() => AsyncRequestStorage<T>;
  }).AsyncLocalStorage;
  if (native) return new native<ServerRequestContext>();
  try {
    const specifier = `node:${'async_hooks'}`;
    const module = await import(specifier) as {
      AsyncLocalStorage?: new <T>() => AsyncRequestStorage<T>;
    };
    if (module.AsyncLocalStorage) return new module.AsyncLocalStorage<ServerRequestContext>();
  } catch {
    // Fetch runtimes without Node compatibility use the guarded fallback below.
  }
  return createGuardedFallbackStorage();
}

function createGuardedFallbackStorage(): AsyncRequestStorage<ServerRequestContext> {
  const stack: ServerRequestContext[] = [];
  return {
    run<T>(context: ServerRequestContext, operation: () => T): T {
      const current = stack.at(-1);
      if (current && current.request !== context.request) {
        throw new Error('VX edge request context requires runtime async-context support for concurrent requests. Enable the platform compatibility flag or provide AsyncLocalStorage.');
      }
      stack.push(context);
      let result: T;
      try { result = operation(); }
      catch (error) { stack.pop(); throw error; }
      if (isPromiseLike(result)) {
        return Promise.resolve(result).finally(() => { stack.pop(); }) as T;
      }
      stack.pop();
      return result;
    },
    getStore(): ServerRequestContext | undefined { return stack.at(-1); }
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return !!value && (typeof value === 'object' || typeof value === 'function') && typeof (value as PromiseLike<unknown>).then === 'function';
}
