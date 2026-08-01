import { createServerApplication as createRouterApplication, type ServerApplication, type ServerApplicationOptions } from '@vx-foundation/router/server';
import { optionalServerContext } from './context.js';
import { createServerPlatform, type ServerPlatformApplication, type ServerPlatformOptions } from './platform.js';

export interface VXServerApplicationOptions<TLocals extends Record<string, unknown> = Record<string, unknown>, TSession extends Record<string, unknown> = Record<string, unknown>>
  extends ServerApplicationOptions {
  platform?: ServerPlatformOptions<TLocals, TSession>;
}

export interface VXServerApplication extends ServerApplication {
  waitForBackgroundWork(): Promise<void>;
}

export function createServerApplication<TLocals extends Record<string, unknown> = Record<string, unknown>, TSession extends Record<string, unknown> = Record<string, unknown>>(
  options: VXServerApplicationOptions<TLocals, TSession>
): VXServerApplication {
  const { platform: platformOptions, ...routerOptions } = options;
  const router = createRouterApplication({
    ...routerOptions,
    resolveSessionId: routerOptions.resolveSessionId ?? (() => optionalServerContext()?.session?.id),
    createLocals: routerOptions.createLocals ?? (() => optionalServerContext()?.locals ?? Object.freeze({})),
    onError(error, request) {
      optionalServerContext()?.logger.error('VX router request failed.', error, { url: request.url });
      routerOptions.onError?.(error, request);
    }
  });
  if (!platformOptions) return Object.assign(router, { waitForBackgroundWork: async () => undefined });
  const platform: ServerPlatformApplication<TLocals, TSession> = createServerPlatform(
    (context) => router.handle(context.request),
    platformOptions
  );
  return {
    handle: (request) => platform.handle(request),
    render(path, init = {}) {
      const url = new URL(path, 'http://vx.local');
      return platform.handle(new Request(url, init));
    },
    clearIncrementalCache: (path) => router.clearIncrementalCache(path),
    waitForBackgroundWork: () => platform.waitForBackgroundWork()
  };
}
