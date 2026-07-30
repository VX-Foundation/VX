import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { QueryClient } from '../../packages/runtime/dist/client.js';
import { createInfiniteQuery, createMemoryPersistenceAdapter, persistQueryClient } from '../../packages/data/dist/index.js';

const client = new QueryClient();
const setStart = performance.now();
for (let index = 0; index < 25_000; index += 1) {
  client.setData(['record', index], { id: index, nested: { stable: true } }, { tags: [`bucket:${index % 100}`] });
}
const setDuration = performance.now() - setStart;

const invalidateStart = performance.now();
for (let index = 0; index < 100; index += 1) client.invalidateTags([`bucket:${index}`]);
const invalidateDuration = performance.now() - invalidateStart;

const adapter = createMemoryPersistenceAdapter();
const persistence = persistQueryClient(client, adapter, { throttleMs: 0 });
const persistStart = performance.now();
await persistence.flush();
const persistDuration = performance.now() - persistStart;

const infinite = createInfiniteQuery(client, {
  name: 'benchmark-pages', initialPageParam: 0,
  query: async (page) => ({ page, next: page + 1 }),
  getNextPageParam: (page) => page.next,
  maxPages: 20
});
const infiniteStart = performance.now();
await infinite.fetchInitial();
for (let index = 0; index < 99; index += 1) await infinite.fetchNextPage();
const infiniteDuration = performance.now() - infiniteStart;

assert(setDuration < 2_500, `25k cache writes regressed: ${setDuration.toFixed(2)}ms`);
assert(invalidateDuration < 2_500, `tag invalidation regressed: ${invalidateDuration.toFixed(2)}ms`);
assert(persistDuration < 2_500, `query persistence regressed: ${persistDuration.toFixed(2)}ms`);
assert(infiniteDuration < 2_500, `infinite query pagination regressed: ${infiniteDuration.toFixed(2)}ms`);

console.log(`VX Phase 13 benchmark passed (25k writes ${setDuration.toFixed(2)}ms, 100 tag invalidations ${invalidateDuration.toFixed(2)}ms, persistence ${persistDuration.toFixed(2)}ms, 100 pages ${infiniteDuration.toFixed(2)}ms).`);
await persistence.dispose();
client.dispose();
