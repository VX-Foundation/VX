import type { ServerHandler, ServerMiddleware, ServerRequestContext } from './types.js';

export function composeServerMiddleware<TContext extends ServerRequestContext>(
  middleware: readonly ServerMiddleware<TContext>[],
  terminal: ServerHandler<TContext>
): ServerHandler<TContext> {
  const chain = Object.freeze([...middleware]);
  return async (context) => dispatch(0, context);

  async function dispatch(index: number, context: TContext): Promise<Response> {
    const entry = chain[index];
    if (!entry) return terminal(context);
    let called = false;
    return entry(context, async () => {
      if (called) throw new Error(`VX server middleware at index ${index} called next() more than once.`);
      called = true;
      return dispatch(index + 1, context);
    });
  }
}

export function withTimeout<TContext extends ServerRequestContext>(timeoutMs: number): ServerMiddleware<TContext> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new TypeError('Server timeout must be a positive number.');
  return async (_context, next) => {
    const timeout = new Promise<Response>((resolve) => {
      const timer = setTimeout(() => resolve(new Response('Request Timeout', {
        status: 408,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }
      })), timeoutMs);
      timer.unref?.();
    });
    return Promise.race([next(), timeout]);
  };
}
