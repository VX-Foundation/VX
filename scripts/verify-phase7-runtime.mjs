import assert from 'node:assert/strict';
import {
  createCsrfToken,
  currentServerRequest,
  deserializeServerValue,
  registerServerAction,
  renderCollection,
  renderElement,
  renderStructuralRange,
  serializeServerValue,
  verifyCsrfToken
} from '../packages/runtime/dist/server.js';
import { createServerApplication } from '../packages/router/dist/server.js';
import { parseRoutePath } from '../packages/router/dist/index.js';

const secret = 'phase-seven-verification-secret-at-least-32-bytes';
const token = await createCsrfToken({ secret, binding: 'session-7', now: 1_000_000 });
assert.doesNotMatch(token, new RegExp(Buffer.from('session-7').toString('base64url')));
assert.equal(await verifyCsrfToken(token, { secret, binding: 'session-7', now: 1_000_100 }), true);
assert.equal(await verifyCsrfToken(token, { secret, binding: 'other-session', now: 1_000_100 }), false);

registerServerAction({
  id: 'phase7:sum', name: 'sum',
  parameters: [{ name: 'left', type: 'Int', optional: false }, { name: 'right', type: 'Int', optional: false }],
  returnType: 'Int', authorization: 'authenticated', csrf: 'required'
}, async (left, right) => {
  const request = currentServerRequest();
  assert.equal(request.runtime.sessionId, 'session-7');
  assert.equal(request.runtime.routeId, 'home');
  return Number(left) + Number(right);
});

registerServerAction({
  id: 'phase7:bad-return', name: 'badReturn', parameters: [], returnType: 'Int',
  authorization: 'authenticated', csrf: 'required'
}, async () => 'not-an-integer');

const homeRoute = route('home', [], homePage(), { hydration: 'full' });
homeRoute.loadNotFound = async () => ({ renderComponent: async ({ path }) => renderElement('h1', {}, `Missing ${path}`, 'not-found', 'Title') });
const failureRoute = route('failure', ['failure'], { renderComponent: async () => { throw new Error('private failure'); } });
failureRoute.loadError = async () => ({ renderComponent: async ({ error }) => renderElement('h1', {}, `Boundary ${error.message}`, 'route-error', 'Title') });
let streamWithoutBoundaryRuntime;
let headStreamRuntime;
let releaseStreamLifecycle;
let streamLifecycleCleanups = 0;
const routes = [
  route('stream', ['stream'], streamPage(), { streaming: 'stream', hydration: 'full' }),
  route('stream-lifecycle', ['stream-lifecycle'], streamLifecyclePage(), { streaming: 'stream', hydration: 'full' }),
  route('never', ['never'], neverStreamPage(), { streaming: 'stream', hydration: 'full' }),
  route('stream-error', ['stream-error'], streamErrorPage(), { streaming: 'stream', hydration: 'full' }),
  route('stream-empty', ['stream-empty'], {
    renderComponent: async () => {
      streamWithoutBoundaryRuntime = currentServerRequest().runtime;
      return renderElement('p', {}, 'No deferred boundary', 'stream-empty', 'Text');
    }
  }, { streaming: 'stream', hydration: 'full' }),
  route('stream-head', ['stream-head'], {
    renderComponent: async (_props, context) => {
      headStreamRuntime = currentServerRequest().runtime;
      context.defer('head', Promise.resolve(renderElement('strong', {}, 'Head complete', 'head-complete', 'Text')));
      return renderStructuralRange('stream', 'head', renderElement('span', {}, 'Head loading', 'head-loading', 'Text'));
    }
  }, { streaming: 'stream', hydration: 'full' }),
  route('client', ['client'], { renderComponent: async () => { throw new Error('Client route rendered on server.'); } }, { render: 'client', hydration: 'islands' }),
  failureRoute,
  homeRoute
];
const endpoints = [{
  id: 'health', ...parseRoutePath(['api', 'health']), modulePath: '/api/health.endpoint.ts', methods: ['GET'], score: 2,
  load: async () => ({ GET: (_request, context) => ({ ok: true, requestId: context.runtime.requestId }) })
}, {
  id: 'raw', ...parseRoutePath(['api', 'raw']), modulePath: '/api/raw.endpoint.ts', methods: ['GET'], score: 2,
  load: async () => ({ GET: () => new Response('raw', { headers: { 'x-custom': 'yes' } }) })
}];
const app = createServerApplication({
  routes,
  endpoints,
  applicationId: 'phase-seven',
  clientEntry: '/assets/vx-client.js',
  styles: ['/assets/vx.css'],
  csrfSecret: secret,
  resolveSessionId: async () => 'session-7',
  createLocals: async () => Object.freeze({ tenant: 'verification' })
});

const pageResponse = await app.render('https://vx.test/');
assert.equal(pageResponse.status, 200);
const pageHTML = await pageResponse.text();
assert.match(pageHTML, /<!doctype html>/);
assert.match(pageHTML, /data-vx-ssr="home"/);
assert.match(pageHTML, /data-vx-source="home-title"/);
assert.match(pageHTML, /id="__VX_STATE__"/);
assert.match(pageHTML, /src="\/assets\/vx-client\.js"/);
assert.match(pageHTML, /name="vx-csrf"/);
assert.match(pageResponse.headers.get('content-security-policy') ?? '', /script-src 'self'/);
assert.doesNotMatch(pageResponse.headers.get('content-security-policy') ?? '', /nonce-/);
assert.doesNotMatch(pageHTML, /nonce=/);
assert.equal(pageResponse.headers.get('x-frame-options'), 'DENY');

const endpointResponse = await app.render('https://vx.test/api/health');
assert.equal(endpointResponse.status, 200);
const endpointBody = await endpointResponse.json();
assert.equal(endpointBody.ok, true);
assert.equal(typeof endpointBody.requestId, 'string');
assert.equal(endpointResponse.headers.get('x-content-type-options'), 'nosniff');
const rawEndpoint = await app.render('https://vx.test/api/raw');
assert.equal(await rawEndpoint.text(), 'raw');
assert.equal(rawEndpoint.headers.get('x-custom'), 'yes');
assert.equal(rawEndpoint.headers.get('x-frame-options'), 'DENY');

const liveToken = await createCsrfToken({ secret, binding: 'session-7' });
const actionRequest = new Request('https://vx.test/_vx/rpc/phase7%3Asum', {
  method: 'POST',
  headers: {
    origin: 'https://vx.test',
    'content-type': 'application/vnd.vx.action+json',
    'x-vx-csrf': liveToken,
    'x-vx-route': 'https://vx.test/'
  },
  body: serializeServerValue({ args: [20, 22] })
});
const actionResponse = await app.handle(actionRequest);
assert.equal(actionResponse.status, 200);
const actionPayload = deserializeServerValue(await actionResponse.text());
assert.deepEqual({ ...actionPayload }, { ok: true, value: 42 });

const invalidReturn = await app.handle(new Request('https://vx.test/_vx/rpc/phase7%3Abad-return', {
  method: 'POST',
  headers: {
    origin: 'https://vx.test',
    'content-type': 'application/vnd.vx.action+json',
    'x-vx-csrf': liveToken,
    'x-vx-route': 'https://vx.test/'
  },
  body: serializeServerValue({ args: [] })
}));
assert.equal(invalidReturn.status, 500);
assert.deepEqual({ ...deserializeServerValue(await invalidReturn.text()).error }, {
  code: 'VX_ACTION_FAILED', message: 'Server action failed.'
});

const invalidOrigin = await app.handle(new Request('https://vx.test/_vx/rpc/phase7%3Asum', {
  method: 'POST',
  headers: { origin: 'https://attacker.test', 'content-type': 'application/vnd.vx.action+json', 'x-vx-csrf': liveToken },
  body: serializeServerValue({ args: [1, 2] })
}));
assert.equal(invalidOrigin.status, 403);

const invalidInput = await app.handle(new Request('https://vx.test/_vx/rpc/phase7%3Asum', {
  method: 'POST',
  headers: { origin: 'https://vx.test', 'content-type': 'application/vnd.vx.action+json', 'x-vx-csrf': liveToken },
  body: serializeServerValue({ args: ['one', 2] })
}));
assert.equal(invalidInput.status, 400);
const missingCsrf = await app.handle(new Request('https://vx.test/_vx/rpc/phase7%3Asum', {
  method: 'POST', headers: { origin: 'https://vx.test', 'content-type': 'application/vnd.vx.action+json' },
  body: serializeServerValue({ args: [1, 2] })
}));
assert.equal(missingCsrf.status, 403);
const oversized = await app.handle(new Request('https://vx.test/_vx/rpc/phase7%3Asum', {
  method: 'POST', headers: { origin: 'https://vx.test', 'content-type': 'application/vnd.vx.action+json', 'x-vx-csrf': liveToken },
  body: serializeServerValue({ args: ['x'.repeat(70_000), 2] })
}));
assert.equal(oversized.status, 400);

const clientResponse = await app.render('https://vx.test/client');
assert.equal(clientResponse.status, 200);
const clientHTML = await clientResponse.text();
assert.match(clientHTML, /"hydration":"full"/);
assert.match(clientHTML, /src="\/assets\/vx-client\.js"/);
assert.doesNotMatch(clientHTML, /Client route rendered/);

const streamResponse = await app.render('https://vx.test/stream');
assert.ok(streamResponse.body);
const streamCsp = streamResponse.headers.get('content-security-policy') ?? '';
assert.match(streamCsp, /nonce-/);
const reader = streamResponse.body.getReader();
const decoder = new TextDecoder();
let streamed = '';
let firstChunk = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const part = decoder.decode(value, { stream: true });
  if (!firstChunk) firstChunk = part;
  streamed += part;
}
streamed += decoder.decode();
assert.match(firstChunk, /Loading/);
assert.doesNotMatch(firstChunk, /Stream complete/);
assert.match(streamed, /data-vx-stream/);
assert.match(streamed, /Stream complete/);
assert.match(streamed, /__VX_STATE__/);
const streamNonce = streamed.match(/<script nonce="([^"]+)">/)?.[1];
assert.ok(streamNonce);
assert.match(streamCsp, new RegExp(`nonce-${streamNonce}`));
const lifecycleResponse = await app.render('https://vx.test/stream-lifecycle');
const lifecycleReader = lifecycleResponse.body.getReader();
const lifecycleShell = await lifecycleReader.read();
assert.match(new TextDecoder().decode(lifecycleShell.value), /Lifecycle loading/);
assert.equal(streamLifecycleCleanups, 0);
releaseStreamLifecycle();
while (!(await lifecycleReader.read()).done) {}
assert.equal(streamLifecycleCleanups, 1);

const streamErrorResponse = await app.render('https://vx.test/stream-error');
const streamErrorHTML = await streamErrorResponse.text();
assert.match(streamErrorHTML, /Loading failed resource/);
assert.match(streamErrorHTML, /Recovered load failure/);

const streamWithoutBoundary = await app.render('https://vx.test/stream-empty');
assert.match(await streamWithoutBoundary.text(), /No deferred boundary/);
assert.throws(() => streamWithoutBoundaryRuntime.queryClient.dehydrate(), /disposed/);
const headStream = await app.render('https://vx.test/stream-head', { method: 'HEAD' });
assert.equal(headStream.body, null);
assert.equal(await headStream.text(), '');
assert.throws(() => headStreamRuntime.queryClient.dehydrate(), /disposed/);

const abortController = new AbortController();
const abortResponse = await app.render('https://vx.test/never', { signal: abortController.signal });
const abortReader = abortResponse.body.getReader();
const abortShell = await abortReader.read();
assert.match(new TextDecoder().decode(abortShell.value), /Waiting forever/);
abortController.abort(new DOMException('verification abort', 'AbortError'));
await assert.rejects(abortReader.read(), /verification abort|AbortError/);

let cacheRenders = 0;
const cachedRoute = route('cached', ['cached'], {
  renderComponent: async () => { cacheRenders += 1; return renderElement('p', {}, `Cached ${cacheRenders}`, 'cached', 'Text'); }
}, { generation: { mode: 'static', entries: [] } });
const cacheApp = createServerApplication({ routes: [cachedRoute] });
const cacheMiss = await cacheApp.render('https://vx.test/cached');
assert.equal(cacheMiss.headers.get('x-vx-cache'), 'miss');
assert.match(await cacheMiss.text(), /Cached 1/);
const cacheHit = await cacheApp.render('https://vx.test/cached');
assert.equal(cacheHit.headers.get('x-vx-cache'), 'hit');
assert.match(await cacheHit.text(), /Cached 1/);
assert.equal(cacheRenders, 1);
const privateResponse = await cacheApp.render('https://vx.test/cached', { headers: { cookie: 'session=private' } });
assert.equal(privateResponse.headers.get('x-vx-cache'), null);
assert.match(await privateResponse.text(), /Cached 2/);
cacheApp.clearIncrementalCache('/cached');
const afterClear = await cacheApp.render('https://vx.test/cached');
assert.equal(afterClear.headers.get('x-vx-cache'), 'miss');
assert.match(await afterClear.text(), /Cached 3/);

const failure = await app.render('https://vx.test/failure');
assert.equal(failure.status, 500);
assert.match(await failure.text(), /Boundary The route could not be rendered\./);
const headFailure = await app.render('https://vx.test/failure', { method: 'HEAD' });
assert.equal(headFailure.status, 500);
assert.equal(headFailure.body, null);
assert.equal(await headFailure.text(), '');
const notFound = await app.render('https://vx.test/missing');
assert.equal(notFound.status, 404);
assert.match(await notFound.text(), /Missing \/missing/);

const isolated = createServerApplication({
  routes: [route('isolation', ['isolation', '[id]'], isolationPage())],
  createLocals: async (request) => Object.freeze({ tenant: request.headers.get('x-tenant') })
});
const [leftIsolation, rightIsolation] = await Promise.all([
  isolated.render('https://vx.test/isolation/left', { headers: { 'x-tenant': 'alpha' } }).then((response) => response.text()),
  isolated.render('https://vx.test/isolation/right', { headers: { 'x-tenant': 'beta' } }).then((response) => response.text())
]);
assert.match(leftIsolation, /left:alpha/);
assert.doesNotMatch(leftIsolation, /beta/);
assert.match(rightIsolation, /right:beta/);
assert.doesNotMatch(rightIsolation, /alpha/);

console.log('Phase 7 runtime verification passed (request isolation, SSR documents, CSP nonces, endpoints, authenticated actions, CSRF/origin/argument/return checks, hydration state, progressive streaming, error fallbacks, cancellation, deferred cleanup, boundaries, and private-safe generated caching).');

function route(id, parts, page, overrides = {}) {
  const parsed = parseRoutePath(parts);
  return {
    id, ...parsed, pagePath: `/src/pages/${id}.vx`, layoutPaths: [], boundaries: {},
    policy: {
      render: overrides.render ?? 'server', preload: 'none', hydration: overrides.hydration ?? 'islands', streaming: overrides.streaming ?? 'blocking',
      generation: overrides.generation ?? { mode: 'dynamic', entries: [] }, metadata: { title: id },
      preserve: { state: false, scroll: true, focus: true }
    },
    queries: [], actions: [], score: parsed.score,
    loadPage: async () => page, loadLayouts: []
  };
}

function homePage() {
  return {
    async renderComponent(_props, context) {
      const request = currentServerRequest();
      assert.equal(request.locals.tenant, 'verification');
      return renderElement('h1', {}, `Home ${context.routeId}`, 'home-title', 'Title');
    }
  };
}

function streamPage() {
  return {
    async renderComponent(_props, context) {
      context.defer('phase7', Promise.resolve(renderElement('strong', {}, 'Stream complete', 'stream-complete', 'Text')));
      return renderStructuralRange('stream', 'phase7', renderElement('span', {}, 'Loading', 'stream-loading', 'Text'));
    }
  };
}


function streamLifecyclePage() {
  return {
    async renderComponent(_props, context) {
      context.onCleanup(() => { streamLifecycleCleanups += 1; });
      const pending = new Promise((resolve) => { releaseStreamLifecycle = () => resolve(renderElement('strong', {}, 'Lifecycle complete', 'lifecycle-complete', 'Text')); });
      context.defer('lifecycle', pending);
      return renderStructuralRange('stream', 'lifecycle', renderElement('span', {}, 'Lifecycle loading', 'lifecycle-loading', 'Text'));
    }
  };
}

function streamErrorPage() {
  return {
    async renderComponent(_props, context) {
      const state = { error: undefined };
      const pending = Promise.reject(new Error('load failure')).catch((error) => {
        state.error = { name: error.name, message: error.message, retryable: false };
        throw error;
      });
      const resource = {
        status: 'loading', data: undefined, get error() { return state.error; },
        loading: true, refreshing: false, stale: false, pending
      };
      return renderCollection(context, 'failed-resource', resource, async () => '', {
        loading: () => renderElement('span', {}, 'Loading failed resource', 'failed-loading', 'Text'),
        error: (error) => renderElement('strong', {}, `Recovered ${error.message}`, 'failed-error', 'Text')
      });
    }
  };
}

function neverStreamPage() {
  return {
    async renderComponent(_props, context) {
      context.defer('never', new Promise(() => undefined));
      return renderStructuralRange('stream', 'never', renderElement('span', {}, 'Waiting forever', 'never-loading', 'Text'));
    }
  };
}

function isolationPage() {
  return {
    async renderComponent(props) {
      const before = currentServerRequest();
      await new Promise((resolve) => setTimeout(resolve, props.id === 'left' ? 5 : 1));
      const after = currentServerRequest();
      assert.equal(after.runtime.requestId, before.runtime.requestId);
      return renderElement('p', {}, `${props.id}:${after.locals.tenant}`, 'isolation', 'Text');
    }
  };
}
