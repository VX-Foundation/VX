import { describe, expect, it } from 'vitest';
import {
  CookieJar,
  MemorySessionStore,
  authorizeServerRequest,
  composeServerMiddleware,
  createMemoryRateLimiter,
  createRouteEndpointHandler,
  createServerPlatform,
  createSessionManager,
  defineEndpoint,
  env,
  json,
  parseRequestBody,
  readServerEnvironment
} from '../src/index.js';

const secret = 'phase-14-session-secret-with-at-least-thirty-two-bytes';

describe('VX server platform', () => {
  it('enforces cookie prefix and SameSite contracts', () => {
    const jar = new CookieJar('theme=dark; encoded=hello%20world');
    expect(jar.get('encoded')).toBe('hello world');
    expect(() => jar.set('__Host-session', 'value', { secure: true, path: '/' })).not.toThrow();
    expect(() => jar.set('__Host-session', 'value', { secure: true, path: '/app' })).toThrow();
    expect(() => jar.set('cross-site', 'value', { sameSite: 'None' })).toThrow();
  });

  it('persists, verifies, regenerates, and destroys opaque sessions', async () => {
    const store = new MemorySessionStore<{ counter?: number }>();
    const manager = createSessionManager<{ counter?: number }>({ secret, store, createData: () => ({}) });
    const first = await manager.resolve(new Request('https://vx.test/'));
    first.session.set('counter', 1);
    const firstHeaders = new Headers();
    await first.commit(firstHeaders);
    const cookie = firstHeaders.get('set-cookie')?.split(';', 1)[0];
    expect(cookie).toBeTruthy();
    const second = await manager.resolve(new Request('https://vx.test/', { headers: { cookie: cookie! } }));
    expect(second.session.data.counter).toBe(1);
    const oldId = second.session.id;
    second.session.regenerate();
    const secondHeaders = new Headers();
    await second.commit(secondHeaders);
    expect(second.session.id).not.toBe(oldId);
    second.session.destroy();
    const destroyHeaders = new Headers();
    await second.commit(destroyHeaders);
    expect(destroyHeaders.get('set-cookie')).toContain('Max-Age=0');
  });

  it('composes middleware exactly once', async () => {
    const order: string[] = [];
    const handler = composeServerMiddleware([
      async (_context, next) => { order.push('a:before'); const response = await next(); order.push('a:after'); return response; },
      async (_context, next) => { order.push('b:before'); const response = await next(); order.push('b:after'); return response; }
    ], async () => new Response('ok'));
    const platform = createServerPlatform(handler);
    expect(await (await platform.handle(new Request('https://vx.test/'))).text()).toBe('ok');
    expect(order).toEqual(['a:before', 'b:before', 'b:after', 'a:after']);
  });

  it('shares sessions, locals, tracing, rate limiting, and security headers', async () => {
    const spans: string[] = [];
    const manager = createSessionManager({ secret, createData: () => ({ visits: 0 }) });
    const platform = createServerPlatform(async (context) => {
      context.session!.set('visits', (context.session!.data.visits as number) + 1);
      context.waitUntil(Promise.resolve());
      return json({ requestId: context.requestId, tenant: context.locals.tenant, visits: context.session!.data.visits });
    }, {
      sessions: manager,
      createLocals: () => ({ tenant: 'vx' }),
      rateLimiter: createMemoryRateLimiter({ limit: 2, windowMs: 60_000 }),
      rateLimitKey: () => 'test',
      onSpan: (span) => spans.push(span.name),
      security: { contentSecurityPolicy: true }
    });
    const first = await platform.handle(new Request('https://vx.test/'));
    expect(first.headers.get('content-security-policy')).toContain("default-src 'self'");
    expect(first.headers.get('server-timing')).toContain('vx;dur=');
    const cookie = first.headers.get('set-cookie')?.split(';', 1)[0];
    const second = await platform.handle(new Request('https://vx.test/', { headers: { cookie: cookie! } }));
    expect((await second.json()).visits).toBe(2);
    const limited = await platform.handle(new Request('https://vx.test/', { headers: { cookie: cookie! } }));
    expect(limited.status).toBe(429);
    expect(spans).toContain('vx.server.request');
  });

  it('parses bounded bodies and rejects unsafe object keys', async () => {
    const body = await parseRequestBody(new Request('https://vx.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"ok":true}' }));
    expect(body.type).toBe('json');
    await expect(parseRequestBody(new Request('https://vx.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"__proto__":{}}' }))).rejects.toThrow();
  });

  it('defines typed endpoint boundaries and authorization policies', async () => {
    const endpoint = defineEndpoint({ id: 'users.create', methods: ['POST'] }, async ({ input }) => ({ input }));
    const platform = createServerPlatform((context) => endpoint.handle(context));
    const response = await platform.handle(new Request('https://vx.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Ada"}' }));
    expect(response.status).toBe(200);
    const authPlatform = createServerPlatform(async (context) => new Response(String(await authorizeServerRequest(context, { roles: ['admin'] }))));
    expect(await (await authPlatform.handle(new Request('https://vx.test/'))).text()).toBe('false');
  });

  it('adapts typed endpoints to file-system route handlers', async () => {
    const endpoint = defineEndpoint(
      { id: 'route.events', methods: ['POST'], body: { maxBytes: 1024 } },
      async ({ input, context, params }) => {
        context.responseHeaders.set('x-vx-endpoint', context.requestId);
        return { input, route: context.runtime.routeId ?? null, projectId: params['projectId'] ?? null };
      }
    );
    const POST = createRouteEndpointHandler(endpoint);
    const response = await POST(
      new Request('https://vx.test/api/events', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{"kind":"update"}'
      }),
      { params: { projectId: 'vx' } }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('x-vx-endpoint')).toBeTruthy();
    expect(await response.json()).toMatchObject({ input: { type: 'json', value: { kind: 'update' } }, projectId: 'vx' });
  });

  it('validates environment values without exposing secrets', () => {
    const parsed = readServerEnvironment({ PORT: { parse: env.integer({ min: 1 }) }, MODE: { parse: env.enum(['dev', 'prod'] as const) } }, { PORT: '3000', MODE: 'prod' });
    expect(parsed.PORT).toBe(3000);
    expect(() => readServerEnvironment({ SECRET: { parse: env.string({ minLength: 32 }), secret: true } }, { SECRET: 'short' })).toThrow();
  });
});
