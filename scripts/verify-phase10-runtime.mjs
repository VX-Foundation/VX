import assert from 'node:assert/strict';
import {
  compareRouteSpecificity,
  createApplicationRouter,
  createRouteCatalog,
  createRouteMatcher,
  decodeRouteSearch,
  executeRoutePipeline,
  parseRoutePath,
  renderRouteMetadata
} from '../packages/router/dist/index.js';
import { createServerApplication } from '../packages/router/dist/server.js';
import { renderElement } from '../packages/runtime/dist/server.js';
import { installFakeDom } from './test-support/fake-dom.mjs';

const searchContract = [
  { name: 'page', kind: 'integer', required: false, repeat: false, defaultValue: 1 },
  { name: 'tag', kind: 'slug', required: false, repeat: true }
];
assert.deepEqual(decodeRouteSearch(new URLSearchParams('tag=compiler&tag=web'), searchContract), { page: 1, tag: ['compiler', 'web'] });
assert.throws(() => decodeRouteSearch(new URLSearchParams('page=1.5'), searchContract), /integer/);

const userParsed = parseRoutePath(['users', '[id.integer]']);
const userDefinition = record('user', 'user.details', userParsed, {
  trailingSlash: 'always', caseSensitive: true, announce: true, viewTransition: false
}, [{ name: 'tab', kind: 'slug', required: true, repeat: false }]);
const catalog = createRouteCatalog([userDefinition]);
assert.equal(catalog.get('user.details').build({ id: 7 }, { query: { tab: 'activity' }, hash: 'history' }), '/users/7/?tab=activity#history');
assert.throws(() => catalog.get('user.details').build({ id: 7 }), /tab.*required/i);
assert.throws(() => catalog.get('user.details').build({ id: 7 }, { query: { tab: 'activity', unknown: 'value' } }), /unknown route search parameter/i);

const staticParsed = parseRoutePath(['users', 'new']);
const optionalParsed = parseRoutePath(['docs', '[[...path]]']);
const exactDocsParsed = parseRoutePath(['docs']);
const compiledRoutes = Object.freeze([
  record('users-new', 'users.new', staticParsed, { trailingSlash: 'never', caseSensitive: true, announce: true, viewTransition: false }),
  userDefinition,
  record('docs', 'docs', exactDocsParsed, { trailingSlash: 'never', caseSensitive: true, announce: true, viewTransition: false }),
  record('docs-catch', 'docs.catch', optionalParsed, { trailingSlash: 'never', caseSensitive: true, announce: true, viewTransition: false })
].sort(compareRouteSpecificity));
const compiledMatcher = createRouteMatcher(compiledRoutes);
assert.equal(compiledMatcher.match('/users/new')?.route.id, 'users-new');
assert.equal(compiledMatcher.match('/users/9')?.params.id, 9);
assert.equal(compiledMatcher.match('/docs')?.route.id, 'docs');
assert.equal(compiledMatcher.match('/docs/guides/start')?.params.path, 'guides/start');

const order = [];
let middlewareData;
const location = Object.freeze({
  id: userDefinition.id, name: userDefinition.name, path: userDefinition.path,
  pathname: '/users/7/', search: new URLSearchParams('tab=activity'), hash: '', params: Object.freeze({ id: 7 }),
  url: new URL('https://vx.test/users/7/?tab=activity')
});
const pipeline = await executeRoutePipeline({
  route: {
    ...userDefinition,
    loadMiddleware: [async () => ({ middleware: async (_context, next) => {
      order.push('middleware:before');
      const result = await next();
      middlewareData = _context.data;
      order.push('middleware:after');
      return result;
    } })],
    loadLoaders: [
      async () => ({ load: async () => { order.push('loader:layout'); return { account: 7 }; } }),
      async () => ({ load: async ({ parentData }) => { order.push('loader:page'); return { doubled: parentData.account * 2 }; } })
    ]
  },
  location,
  signal: new AbortController().signal
});
assert.deepEqual(pipeline.data, { account: 7, doubled: 14 });
assert.deepEqual(order, ['middleware:before', 'loader:layout', 'loader:page', 'middleware:after']);
assert.deepEqual(middlewareData, { account: 7, doubled: 14 });
await assert.rejects(() => executeRoutePipeline({
  route: { ...userDefinition, loadLoaders: [async () => ({ load: async () => ({ key: 1 }) }), async () => ({ load: async () => ({ key: 2 }) })] },
  location,
  signal: new AbortController().signal
}), /redefine data key 'key'/);

const metadata = renderRouteMetadata({
  title: 'User', titleTemplate: '%s · VX', canonical: 'https://vx.test/users/7',
  alternates: [{ language: 'pt-BR', href: 'https://vx.test/pt/users/7' }],
  openGraph: { type: 'profile', images: ['/user.png'] }, twitter: { card: 'summary_large_image', images: ['/user.png'] },
  structuredData: { name: '</script><script>alert(1)</script>' }
});
assert.match(metadata, /property="og:title" content="User · VX"/);
assert.match(metadata, /hreflang="pt-BR"/);
assert(!metadata.includes('</script><script>alert(1)</script>'));

installFakeDom();
const root = document.createElement('div');
const browser = createBrowser('https://vx.test/app/');
let loaderRuns = 0;
const clientRoutes = [
  clientRoute('home', 'home', parseRoutePath([]), 'Home'),
  clientRoute('user', 'user.details', userParsed, 'User', {
    loadLoaders: [async () => ({ load: async ({ params, search }) => {
      loaderRuns += 1;
      return { summary: `${params.id}:${search.tab}` };
    } })],
    loadNotFound: async () => boundaryModule('Nested Not Found'),
    policy: userDefinition.policy
  })
].sort(compareRouteSpecificity);
const router = createApplicationRouter({ root, routes: clientRoutes, window: browser, document, basePath: '/app' });
await router.start();
assert.equal(root.textContent, 'Home');
let unblock = router.block(() => false);
await router.navigateRoute('user.details', { id: 7 }, { query: { tab: 'activity' } });
assert.equal(root.textContent, 'Home');
unblock();
await router.navigateRoute('user.details', { id: 7 }, { query: { tab: 'activity' } });
assert.equal(root.textContent, 'User 7:activity');
assert.equal(router.current?.name, 'user.details');
assert.equal(browser.location.pathname, '/app/users/7/');
assert.equal(loaderRuns, 1);
unblock = router.block(() => false);
await router.navigate('/app/users/7/extra');
assert.equal(root.textContent, 'User 7:activity');
unblock();
await router.navigate('/app/users/7/extra');
assert.equal(root.textContent, 'Nested Not Found');
assert.equal(router.current?.name, 'not-found');
router.dispose();

const serverUser = serverRoute('user', 'user.details', userParsed, {
  loadLoaders: [async () => ({ load: async ({ params, search }) => ({ summary: `${params.id}:${search.tab}` }) })],
  loadMiddleware: [async () => ({ middleware: async (_context, next) => next() })],
  policy: { ...userDefinition.policy, render: 'server', hydration: 'full' },
  loadPage: async () => ({
    renderComponent: async (props) => renderElement('h1', {}, `User ${props.data.summary}`, 'phase10-user', 'Title')
  }),
  loadNotFound: async () => ({
    renderComponent: async (props) => renderElement('h1', {}, `Nested Not Found ${props.path}`, 'phase10-not-found', 'Title')
  })
});
const endpointParsed = parseRoutePath(['api', 'health']);
const endpoint = {
  id: 'endpoint:/api/health', ...endpointParsed, modulePath: '/src/pages/api/health/endpoint.ts', middlewarePaths: [], methods: ['GET'], score: endpointParsed.score,
  loadMiddleware: [async () => ({ middleware: async (_context, next) => next() })],
  load: async () => ({ GET: async () => ({ ok: true }) })
};
const server = createServerApplication({ routes: [serverUser], endpoints: [endpoint], basePath: '/app' });
const canonical = await server.render('https://vx.test/app/users/7?tab=activity');
assert.equal(canonical.status, 308);
assert.equal(canonical.headers.get('location'), '/app/users/7/?tab=activity');
const rendered = await server.render('https://vx.test/app/users/7/?tab=activity');
assert.equal(rendered.status, 200);
assert.match(await rendered.text(), /User 7:activity/);
const malformedSearch = await server.render('https://vx.test/app/users/7/?tab=not%20valid');
assert.equal(malformedSearch.status, 400);
const nestedNotFound = await server.render('https://vx.test/app/users/7/extra');
assert.equal(nestedNotFound.status, 404);
assert.match(await nestedNotFound.text(), /Nested Not Found \/users\/7\/extra/);
const endpointResponse = await server.render('https://vx.test/app/api/health');
assert.equal(endpointResponse.status, 200);
assert.deepEqual(await endpointResponse.json(), { ok: true });
const outsideBase = await server.render('https://vx.test/users/7/?tab=activity');
assert.equal(outsideBase.status, 404);

console.log('Phase 10 router runtime verification passed.');

function record(id, name, parsed, navigation, search = []) {
  return {
    id, name, ...parsed, layoutPaths: [], loaderPaths: [], middlewarePaths: [], boundaries: {},
    policy: {
      render: 'client', preload: 'none', hydration: 'islands', streaming: 'blocking', generation: { mode: 'dynamic', entries: [] },
      metadata: { title: name }, preserve: { state: false, scroll: true, focus: true }, navigation, search
    },
    queries: [], actions: [], score: parsed.score
  };
}

function clientRoute(id, name, parsed, label, overrides = {}) {
  const base = record(id, name, parsed, { trailingSlash: 'never', caseSensitive: true, announce: true, viewTransition: false });
  return {
    ...base,
    pagePath: `/src/pages/${id}/page.vx`,
    loadPage: async () => ({
      createComponent(props) {
        const node = document.createDocumentFragment();
        const main = document.createElement('main');
        const data = props?.data ?? {};
        main.textContent = data.summary ? `${label} ${data.summary}` : label;
        node.appendChild(main);
        return { node, ctx: {}, dispose() { main.remove?.(); } };
      }
    }),
    loadLayouts: [],
    ...overrides
  };
}

function boundaryModule(label) {
  return {
    createComponent() {
      const node = document.createDocumentFragment();
      const main = document.createElement('main');
      main.textContent = label;
      node.appendChild(main);
      return { node, ctx: {}, dispose() { main.remove?.(); } };
    }
  };
}

function serverRoute(id, name, parsed, overrides = {}) {
  const base = record(id, name, parsed, { trailingSlash: 'always', caseSensitive: true, announce: true, viewTransition: false }, [
    { name: 'tab', kind: 'slug', required: true, repeat: false }
  ]);
  return { ...base, pagePath: `/src/pages/${id}/page.vx`, loadLayouts: [], ...overrides };
}

function createBrowser(initialURL) {
  let currentURL = new URL(initialURL);
  const listeners = new Map();
  const location = {
    get href() { return currentURL.href; }, get origin() { return currentURL.origin; }, get pathname() { return currentURL.pathname; },
    get search() { return currentURL.search; }, get hash() { return currentURL.hash; }, assign(target) { currentURL = new URL(target, currentURL); }
  };
  const history = {
    state: null, scrollRestoration: 'auto',
    pushState(state, _title, target) { this.state = state; currentURL = new URL(target, currentURL); },
    replaceState(state, _title, target) { this.state = state; currentURL = new URL(target, currentURL); },
    go() {}
  };
  return {
    location, history, scrollX: 0, scrollY: 0, scrollTo() {}, confirm() { return true; },
    addEventListener(name, handler) { const entries = listeners.get(name) ?? []; entries.push(handler); listeners.set(name, entries); },
    removeEventListener(name, handler) { listeners.set(name, (listeners.get(name) ?? []).filter((entry) => entry !== handler)); }
  };
}
