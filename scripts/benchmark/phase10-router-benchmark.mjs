import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { compareRouteSpecificity, createRouteCatalog, matchRoute, parseRoutePath } from '../../packages/router/dist/index.js';

const routes = [];
for (let index = 0; index < 5000; index += 1) {
  const parsed = parseRoutePath(['catalog', `section-${index}`, '[id.integer]']);
  routes.push({ id: `route-${index}`, name: `catalog.section${index}`, ...parsed, policy: policy(), layoutPaths: [], boundaries: {}, queries: [], actions: [], score: parsed.score });
}
routes.sort(compareRouteSpecificity);
Object.freeze(routes);
const catalogStart = performance.now();
const catalog = createRouteCatalog(routes);
for (let index = 0; index < 5000; index += 1) catalog.get(`catalog.section${index}`).build({ id: index }, { query: { page: 1 } });
const catalogMs = performance.now() - catalogStart;

const matchStart = performance.now();
for (let index = 0; index < 20000; index += 1) {
  const section = index % 5000;
  const match = matchRoute(`/catalog/section-${section}/${index}`, routes);
  assert.equal(match?.params.id, index);
}
const matchMs = performance.now() - matchStart;

assert(catalogMs < 5000, `Route catalog benchmark exceeded 5000 ms: ${catalogMs.toFixed(2)} ms.`);
assert(matchMs < 15000, `Route matcher benchmark exceeded 15000 ms: ${matchMs.toFixed(2)} ms.`);
console.log(JSON.stringify({ routes: 5000, generatedUrls: 5000, matches: 20000, catalogMs: Number(catalogMs.toFixed(2)), matchMs: Number(matchMs.toFixed(2)) }));
console.log('Phase 10 router benchmark passed.');

function policy() {
  return {
    render: 'client', preload: 'none', hydration: 'islands', streaming: 'blocking', generation: { mode: 'dynamic', entries: [] },
    metadata: {}, preserve: { state: false, scroll: true, focus: true },
    navigation: { trailingSlash: 'never', caseSensitive: true, announce: true, viewTransition: false }, search: []
  };
}
