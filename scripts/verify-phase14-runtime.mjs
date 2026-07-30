import assert from 'node:assert/strict';
import {
  CookieJar,
  MemorySessionStore,
  createMemoryRateLimiter,
  createServerPlatform,
  createSessionManager,
  defineEndpoint,
  parseRequestBody,
  readServerEnvironment,
  env
} from '../packages/server/dist/index.js';
import { createStaticFileHandler, startNodeServer } from '../packages/server/dist/node.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const secret = 'phase-14-session-secret-with-at-least-thirty-two-bytes';
const jar = new CookieJar('theme=dark; greeting=hello%20world');
assert.equal(jar.get('greeting'), 'hello world');
assert.throws(() => jar.set('__Host-vx', 'value', { secure: true, path: '/bad' }));

const store = new MemorySessionStore();
const sessions = createSessionManager({ secret, store, createData: () => ({ requests: 0 }) });
const logs = [];
const spans = [];
const rateLimiter = createMemoryRateLimiter({ limit: 3, windowMs: 60_000 });
const platform = createServerPlatform(async (context) => {
  assert.equal(context.locals.application, 'phase14');
  assert.equal(context, platform.context());
  context.session.set('requests', Number(context.session.data.requests ?? 0) + 1);
  context.responseHeaders.set('x-vx-phase', '14');
  context.waitUntil(Promise.resolve());
  return new Response(JSON.stringify({ requestId: context.requestId, count: context.session.data.requests }), { headers: { 'content-type': 'application/json' } });
}, {
  sessions,
  createLocals: () => ({ application: 'phase14' }),
  rateLimiter,
  rateLimitKey: () => 'phase14-client',
  onLog: (record) => logs.push(record),
  onSpan: (span) => spans.push(span),
  security: { contentSecurityPolicy: true, permissionsPolicy: 'camera=(), microphone=()' },
  cors: { origins: ['https://client.vx.test'], methods: ['GET', 'POST'], credentials: true }
});

const first = await platform.handle(new Request('https://api.vx.test/', { headers: { origin: 'https://client.vx.test' } }));
assert.equal(first.status, 200);
assert.equal(first.headers.get('x-vx-phase'), '14');
assert.match(first.headers.get('content-security-policy') ?? '', /default-src/);
assert.match(first.headers.get('server-timing') ?? '', /vx;dur=/);
assert.equal(first.headers.get('access-control-allow-origin'), 'https://client.vx.test');
const cookie = first.headers.get('set-cookie')?.split(';', 1)[0];
assert.ok(cookie);
const payload = await first.json();
assert.equal(payload.count, 1);
const second = await platform.handle(new Request('https://api.vx.test/', { headers: { cookie, origin: 'https://client.vx.test' } }));
assert.equal((await second.json()).count, 2);
await platform.handle(new Request('https://api.vx.test/', { headers: { cookie, origin: 'https://client.vx.test' } }));
const limited = await platform.handle(new Request('https://api.vx.test/', { headers: { cookie, origin: 'https://client.vx.test' } }));
assert.equal(limited.status, 429);
assert.equal(limited.headers.get('ratelimit-remaining'), '0');
assert.ok(spans.some((span) => span.name === 'vx.server.request'));

const corsPlatform = createServerPlatform(() => new Response('ok'), { cors: { origins: ['https://client.vx.test'] } });
const denied = await corsPlatform.handle(new Request('https://api.vx.test/', { headers: { origin: 'https://attacker.test' } }));
assert.equal(denied.status, 403);

const parsed = await parseRequestBody(new Request('https://api.vx.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"Ada"}' }));
assert.equal(parsed.type, 'json');
await assert.rejects(parseRequestBody(new Request('https://api.vx.test/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"constructor":{}}' })));

const endpoint = defineEndpoint({ id: 'phase14.echo', methods: ['POST'], contentTypes: ['application/json'] }, async ({ input }) => ({ received: input }));
const endpointPlatform = createServerPlatform((context) => endpoint.handle(context));
const endpointResponse = await endpointPlatform.handle(new Request('https://api.vx.test/echo', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"value":14}' }));
assert.equal(endpointResponse.status, 200);
assert.equal((await endpointResponse.json()).received.value.value, 14);

const environment = readServerEnvironment({ PORT: { parse: env.integer({ min: 1 }) }, MODE: { parse: env.enum(['test', 'production']) } }, { PORT: '4040', MODE: 'test' });
assert.equal(environment.PORT, 4040);

const staticRoot = await mkdtemp(path.join(tmpdir(), 'vx-phase14-'));
await writeFile(path.join(staticRoot, 'index.html'), '<h1>VX 14</h1>');
const staticFiles = createStaticFileHandler({ root: staticRoot });
const nodeApplication = {
  async handle(request) { return await staticFiles(request) ?? new Response('dynamic'); },
  waitForBackgroundWork: () => Promise.resolve()
};
const running = await startNodeServer(nodeApplication, { hostname: '127.0.0.1', port: 0, compression: true, gracefulShutdownMs: 1000 });
const nodeResponse = await fetch(`http://${running.hostname}:${running.port}/`);
assert.equal(nodeResponse.status, 200);
assert.match(await nodeResponse.text(), /VX 14/);
await running.close();

console.log(`Phase 14 runtime verification passed (${spans.length} spans, ${logs.length} log records).`);
