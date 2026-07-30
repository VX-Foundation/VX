import type { DisposableCallback, FFIOptions, InteropDeclaration } from './types.js';

export interface JSFunction<TArgs extends readonly unknown[], TResult> {
  readonly declaration: InteropDeclaration;
  invoke(...args: TArgs): TResult;
}

export interface JSClass<TInstance, TArgs extends readonly unknown[]> {
  readonly declaration: InteropDeclaration;
  construct(...args: TArgs): TInstance;
}

export function defineJSFunction<TArgs extends readonly unknown[], TResult>(
  module: string,
  exportName: string,
  implementation: (...args: TArgs) => TResult,
  options: FFIOptions = {}
): JSFunction<TArgs, TResult> {
  if (typeof implementation !== 'function') throw new TypeError(`Interop export '${exportName}' must be callable.`);
  const declaration = createDeclaration(module, exportName, 'function', options);
  return Object.freeze({ declaration, invoke: (...args: TArgs) => invokeWithPolicy(implementation, args, declaration.errorPolicy ?? 'throw') as TResult });
}

export function defineJSClass<TInstance, TArgs extends readonly unknown[]>(
  module: string,
  exportName: string,
  Constructor: new (...args: TArgs) => TInstance,
  options: FFIOptions = {}
): JSClass<TInstance, TArgs> {
  if (typeof Constructor !== 'function') throw new TypeError(`Interop class '${exportName}' must be constructable.`);
  const declaration = createDeclaration(module, exportName, 'class', options);
  return Object.freeze({ declaration, construct: (...args: TArgs) => new Constructor(...args) });
}

export function callback<TArgs extends readonly unknown[], TResult>(
  handler: (...args: TArgs) => TResult,
  options: { signal?: AbortSignal; once?: boolean } = {}
): DisposableCallback<TArgs, TResult> {
  if (typeof handler !== 'function') throw new TypeError('VX callback handler must be callable.');
  let active = true;
  const dispose = (): void => { active = false; options.signal?.removeEventListener('abort', dispose); };
  const wrapped = ((...args: TArgs): TResult => {
    if (!active) throw new Error('VX callback was invoked after disposal.');
    try { return handler(...args); }
    finally { if (options.once) dispose(); }
  }) as DisposableCallback<TArgs, TResult>;
  Object.defineProperties(wrapped, {
    disposed: { get: () => !active, enumerable: true },
    dispose: { value: dispose, enumerable: false }
  });
  if (options.signal?.aborted) dispose(); else options.signal?.addEventListener('abort', dispose, { once: true });
  return wrapped;
}

export function promiseFrom<T>(value: T | PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  const promise = Promise.resolve(value);
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError(signal.reason));
  return new Promise<T>((resolve, reject) => {
    const abort = (): void => reject(abortError(signal.reason));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function* readableStreamValues<T>(stream: ReadableStream<T>, signal?: AbortSignal): AsyncGenerator<T> {
  const reader = stream.getReader();
  const abort = (): void => { void reader.cancel(signal?.reason); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    while (true) {
      if (signal?.aborted) throw abortError(signal.reason);
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    signal?.removeEventListener('abort', abort);
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

export function readableStreamFrom<T>(source: AsyncIterable<T>, signal?: AbortSignal): ReadableStream<T> {
  const iterator = source[Symbol.asyncIterator]();
  let pulling = false;
  return new ReadableStream<T>({
    async pull(controller) {
      if (pulling) return;
      pulling = true;
      try {
        if (signal?.aborted) throw abortError(signal.reason);
        const result = await iterator.next();
        if (result.done) controller.close(); else controller.enqueue(result.value);
      } catch (cause) { controller.error(cause); }
      finally { pulling = false; }
    },
    async cancel(reason) { await iterator.return?.(reason); }
  });
}

export function construct<TInstance, TArgs extends readonly unknown[]>(Constructor: new (...args: TArgs) => TInstance, ...args: TArgs): TInstance {
  return new Constructor(...args);
}

export function clientOnly<T>(factory: () => T): T {
  if (typeof window === 'undefined') throw new Error('Client-only interoperability was evaluated on the server.');
  return factory();
}

export function serverOnly<T>(factory: () => T): T {
  if (typeof window !== 'undefined') throw new Error('Server-only interoperability was evaluated in the browser.');
  return factory();
}

export function normalizeInteropError(cause: unknown): Error {
  if (cause instanceof Error) return cause;
  if (typeof cause === 'string') return new Error(cause);
  try { return new Error(`JavaScript interoperability failed: ${JSON.stringify(cause)}`); }
  catch { return new Error('JavaScript interoperability failed with a non-serializable value.'); }
}

function createDeclaration(module: string, exportName: string, kind: 'function' | 'class', options: FFIOptions): InteropDeclaration {
  return Object.freeze({
    module, exportName, kind,
    environment: options.environment ?? 'universal',
    ...(options.asynchronous !== undefined ? { asynchronous: options.asynchronous } : {}),
    ...(options.pure !== undefined ? { pure: options.pure } : {}),
    ...(options.sideEffects !== undefined ? { sideEffects: options.sideEffects } : {}),
    ...(options.parameters ? { parameters: Object.freeze([...options.parameters]) } : {}),
    ...(options.returns ? { returns: options.returns } : {}),
    ...(options.errorPolicy ? { errorPolicy: options.errorPolicy } : {})
  });
}
function invokeWithPolicy<TArgs extends readonly unknown[], TResult>(implementation: (...args: TArgs) => TResult, args: TArgs, policy: 'throw' | 'result' | 'null'): TResult | { ok: true; value: TResult } | { ok: false; error: Error } | null {
  try {
    const value = implementation(...args);
    return policy === 'result' ? { ok: true, value } : value;
  } catch (cause) {
    const error = normalizeInteropError(cause);
    if (policy === 'result') return { ok: false, error };
    if (policy === 'null') return null;
    throw error;
  }
}
function abortError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  if (typeof DOMException !== 'undefined') return new DOMException(reason ? String(reason) : 'Aborted', 'AbortError');
  const error = new Error(reason ? String(reason) : 'Aborted');
  error.name = 'AbortError';
  return error;
}
