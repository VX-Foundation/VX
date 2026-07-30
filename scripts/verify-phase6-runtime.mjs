import assert from 'node:assert/strict';
import {
  buildRouteHref,
  compareRouteSpecificity,
  createApplicationRouter,
  matchRoute,
  mountRouteModules,
  parseRoutePath,
  preloadRouteData
} from '../packages/router/dist/index.js';
import { installFakeDom } from './test-support/fake-dom.mjs';

const typed = parseRoutePath(['users', '[id.integer]']);
const matched = matchRoute('/users/42', [{ id: 'user', ...typed }]);
assert.deepEqual(matched?.params, { id: 42 });
assert.equal(matchRoute('/users/not-an-integer', [{ id: 'user', ...typed }]), null);
assert.equal(buildRouteHref(typed, { id: 42 }, { query: { tab: 'activity' }, hash: 'details' }), '/users/42?tab=activity#details');
const encodedStatic = parseRoutePath(['team space']);
assert.equal(encodedStatic.path, '/team%20space');
assert.equal(buildRouteHref(encodedStatic, {}), '/team%20space');
const staticFirst = parseRoutePath(['users', '[id]']);
const dynamicFirst = parseRoutePath(['[section]', 'new']);
assert.equal([dynamicFirst, staticFirst].sort(compareRouteSpecificity)[0], staticFirst);
const exact = parseRoutePath(['docs']);
const optionalCatchAll = parseRoutePath(['docs', '[[...path]]']);
assert.equal([optionalCatchAll, exact].sort(compareRouteSpecificity)[0], exact);
assert.throws(() => parseRoutePath(['[route]']), /reserved/);
assert.throws(() => parseRoutePath(['[id]', '[id]']), /more than once/);

let pageDisposed = 0;
const page = {
  createComponent() {
    return { node: { kind: 'page' }, ctx: { save: () => 'saved' }, dispose() { pageDisposed += 1; } };
  }
};
const layout = {
  createComponent(_props, _runtime, _outputs, content) {
    const child = content.route();
    return {
      node: { kind: 'layout', child: child.node },
      ctx: {},
      dispose() { child.cleanup(); }
    };
  }
};
const root = {
  children: [],
  replaceChildren(...nodes) { this.children = nodes; }
};
const route = {
  id: 'root', path: '/', segments: [], parameters: [], pagePath: '/pages/index.vx',
  layoutPaths: ['/pages/_layout.vx'], boundaries: {},
  policy: { render: 'client', preload: 'intent', metadata: {}, preserve: { state: false, scroll: true, focus: true } },
  queries: [], actions: [{ name: 'save', side: 'client', modulePath: '/pages/index.vx' }], score: 0,
  loadPage: async () => page, loadLayouts: [async () => layout]
};
const loaded = {
  page,
  layouts: [layout],
  byPath: new Map([['/pages/index.vx', page], ['/pages/_layout.vx', layout]])
};
const mounted = mountRouteModules(root, route, loaded, {});
assert.equal(root.children[0].kind, 'layout');
assert.equal(root.children[0].child.kind, 'page');
mounted.dispose();
assert.equal(pageDisposed, 1);

let failedBranchDisposed = 0;
const failingPage = {
  createComponent() {
    return { node: { kind: 'failing-page' }, ctx: {}, dispose() { failedBranchDisposed += 1; } };
  }
};
const failingLayout = { createComponent() { throw new Error('layout failed'); } };
assert.throws(() => mountRouteModules(root, route, {
  page: failingPage,
  layouts: [failingLayout],
  byPath: new Map([['/pages/index.vx', failingPage], ['/pages/_layout.vx', failingLayout]])
}, {}), /layout failed/);
assert.equal(failedBranchDisposed, 1);

let refetched = 0;
let cleaned = 0;
let unmounted = 0;
const dataModule = {
  setup() {
    return {
      profile: { async refetch() { refetched += 1; } },
      __vxCleanup: [() => { cleaned += 1; }],
      __vxUnmount: [() => { unmounted += 1; }]
    };
  }
};
await preloadRouteData(
  { ...route, layoutPaths: [], loadLayouts: [], queries: [{ name: 'profile', side: 'universal', modulePath: '/pages/index.vx' }] },
  { page: dataModule, layouts: [], byPath: new Map([['/pages/index.vx', dataModule]]) },
  {},
  {}
);
assert.equal(refetched, 1);
assert.equal(cleaned, 1);
assert.equal(unmounted, 0);

installFakeDom();
const applicationRoot = document.createElement('div');
const browser = createBrowser('https://vx.test/');
const runtimeRoutes = [
  runtimeRoute('about', ['about'], 'About'),
  runtimeRoute('root', [], 'Home')
].sort(compareRouteSpecificity);
const application = createApplicationRouter({
  root: applicationRoot,
  routes: runtimeRoutes,
  window: browser,
  document
});
await application.start();
assert.equal(applicationRoot.textContent, 'Home');
await application.navigate('/about');
assert.equal(applicationRoot.textContent, 'About');
assert.equal(application.current?.id, 'about');
assert.equal(document.title, 'About');

let releaseSlow;
const slowReady = new Promise((resolve) => { releaseSlow = resolve; });
runtimeRoutes.unshift(runtimeRoute('slow', ['slow'], 'Slow', async () => {
  await slowReady;
  return viewModule('Slow');
}));
runtimeRoutes.unshift(runtimeRoute('fast', ['fast'], 'Fast'));
const stale = application.navigate('/slow');
const current = application.navigate('/fast');
releaseSlow();
await Promise.all([stale, current]);
assert.equal(applicationRoot.textContent, 'Fast');

let releaseNotFound;
const notFoundReady = new Promise((resolve) => { releaseNotFound = resolve; });
const rootRoute = runtimeRoutes.find((entry) => entry.id === 'root');
rootRoute.loadNotFound = async () => {
  await notFoundReady;
  return viewModule('Not found');
};
const staleNotFound = application.navigate('/missing');
const afterNotFound = application.navigate('/about');
releaseNotFound();
await Promise.all([staleNotFound, afterNotFound]);
assert.equal(applicationRoot.textContent, 'About');
application.dispose();
assert.equal(applicationRoot.textContent, '');

console.log('Phase 6 routing runtime verification passed.');

function runtimeRoute(id, parts, label, loadPage = async () => viewModule(label)) {
  const parsed = parseRoutePath(parts);
  return {
    id,
    ...parsed,
    pagePath: `/src/pages/${id}.vx`,
    layoutPaths: [],
    boundaries: {},
    policy: {
      render: 'client', preload: 'none', metadata: { title: label },
      preserve: { state: false, scroll: true, focus: true }
    },
    queries: [], actions: [], loadPage, loadLayouts: []
  };
}

function viewModule(label) {
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

function createBrowser(initialURL) {
  let currentURL = new URL(initialURL);
  const listeners = new Map();
  const location = {
    get href() { return currentURL.href; },
    get origin() { return currentURL.origin; },
    get pathname() { return currentURL.pathname; },
    get search() { return currentURL.search; },
    get hash() { return currentURL.hash; },
    assign(target) { currentURL = new URL(target, currentURL); }
  };
  const history = {
    state: null,
    pushState(state, _title, target) {
      this.state = state;
      currentURL = new URL(target, currentURL);
    },
    replaceState(state, _title, target) {
      this.state = state;
      currentURL = new URL(target, currentURL);
    }
  };
  return {
    location,
    history,
    scrollX: 0,
    scrollY: 0,
    scrollTo() {},
    addEventListener(name, handler) {
      const entries = listeners.get(name) ?? [];
      entries.push(handler);
      listeners.set(name, entries);
    },
    removeEventListener(name, handler) {
      listeners.set(name, (listeners.get(name) ?? []).filter((entry) => entry !== handler));
    }
  };
}
