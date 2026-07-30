import assert from 'node:assert/strict';
import {
  QueryClient,
  StoreRegistry,
  createAction,
  createQuery,
  defineStore,
  dehydrateQueryClient,
  hydrateQueryClient,
  managedEffect,
  serializeQueryState,
  state
} from '../packages/runtime/dist/client.js';
import { createRequestRuntime } from '../packages/runtime/dist/server.js';

await verifyQueries();
await verifyActions();
await verifyManagedEffects();
verifyStores();

console.log('VX Phase 3 runtime verification passed (queries, actions, effects, hydration, cancellation, and store lifetimes).');

async function verifyQueries() {
  const client = new QueryClient();
  const page = state(1);
  let calls = 0;
  const source = async (input, context) => {
    calls += 1;
    await delay(2, context.signal);
    return { page: input.page, html: '<script>unsafe</script>' };
  };
  const descriptor = {
    name: 'products',
    input: () => ({ page: page.value }),
    source,
    policy: { staleTimeMs: 1_000, retentionTimeMs: 0, retries: 0 }
  };
  const first = createQuery(client, descriptor);
  const second = createQuery(client, descriptor);
  await settle();
  await delay(4);
  assert.equal(calls, 1, 'equal query keys must deduplicate in-flight work');
  assert.equal(first.status, 'success');
  assert.deepEqual(first.data, { page: 1, html: '<script>unsafe</script>' });
  assert.deepEqual(second.data, first.data);

  const payload = dehydrateQueryClient(client);
  const serialized = serializeQueryState(payload);
  assert.match(serialized, /\\u003cscript/);
  const hydratedClient = new QueryClient();
  hydrateQueryClient(hydratedClient, payload);
  assert.deepEqual(dehydrateQueryClient(hydratedClient).queries, payload.queries);
  hydratedClient.dispose();

  first.dispose();
  second.dispose();
  assert.equal(client.dehydrate().length, 0, 'zero-retention queries must be garbage-collected after release');
  client.dispose();

  const cancellationClient = new QueryClient();
  const key = state(1);
  const abortedInputs = [];
  const cancellable = createQuery(cancellationClient, {
    name: 'cancellable',
    input: () => key.value,
    source: (input, context) => {
      context.signal.addEventListener('abort', () => abortedInputs.push(input), { once: true });
      return delay(input === 1 ? 25 : 2, context.signal).then(() => input);
    },
    policy: { retries: 0 }
  });
  key.value = 2;
  await settle();
  await delay(6);
  assert.equal(cancellable.data, 2);
  assert.deepEqual(abortedInputs, [1], 'obsolete query work must be cancelled');
  cancellable.dispose();
  cancellationClient.dispose();

  const retryClient = new QueryClient();
  let attempts = 0;
  const retried = createQuery(retryClient, {
    name: 'retry',
    input: () => null,
    source: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('temporary');
      return 'ready';
    },
    policy: { retries: 2, retryDelayMs: 0, retryBackoff: 'fixed' }
  });
  await settle();
  await delay(2);
  assert.equal(retried.data, 'ready');
  assert.equal(attempts, 3);
  retried.dispose();
  retryClient.dispose();

  const prefixClient = new QueryClient();
  let firstPrefixCalls = 0;
  let secondPrefixCalls = 0;
  const pageOne = createQuery(prefixClient, {
    name: 'catalog',
    input: () => ({ page: 1 }),
    source: async () => ++firstPrefixCalls,
    policy: { staleTimeMs: 60_000, retries: 0 }
  });
  const pageTen = createQuery(prefixClient, {
    name: 'catalog',
    input: () => ({ page: 10 }),
    source: async () => ++secondPrefixCalls,
    policy: { staleTimeMs: 60_000, retries: 0 }
  });
  await settle();
  await delay(1);
  prefixClient.invalidate(['catalog', { page: 1 }]);
  await settle();
  assert.equal(firstPrefixCalls, 2, 'structured invalidation must match the selected key');
  assert.equal(secondPrefixCalls, 1, 'structured invalidation must not use ambiguous string prefixes');
  pageOne.dispose();
  pageTen.dispose();
  prefixClient.dispose();
}

async function verifyActions() {
  const client = new QueryClient();
  const resource = createQuery(client, {
    name: 'profile',
    input: () => ({ id: 1 }),
    source: async () => ({ name: 'Ada' }),
    policy: { staleTimeMs: 60_000, retries: 0 }
  });
  await settle();
  await delay(1);

  const failing = createAction(async (context) => {
    context.optimistic(resource, { name: 'Grace' });
    await Promise.resolve();
    throw new Error('rejected');
  }, { name: 'rename', queryClient: client });
  await assert.rejects(() => failing(), /rejected/);
  assert.equal(failing.status, 'error');
  assert.deepEqual(resource.data, { name: 'Ada' }, 'failed actions must roll back optimistic query updates');

  let refreshes = 0;
  const refreshing = createQuery(client, {
    name: 'refreshable',
    input: () => null,
    source: async () => ++refreshes,
    policy: { staleTimeMs: 60_000, retries: 0 }
  });
  await settle();
  await delay(1);
  const successful = createAction(async (context) => {
    await Promise.resolve();
    context.invalidate(refreshing);
    return 'saved';
  }, { name: 'save', queryClient: client });
  assert.equal(await successful(), 'saved');
  await settle();
  assert.equal(successful.status, 'success');
  assert.equal(successful.data, 'saved');
  successful.cancel();
  assert.equal(successful.status, 'success', 'cancelling an inactive action must be a no-op');
  assert(refreshes >= 2, 'successful invalidation must refetch active queries');

  const commits = [];
  const latest = createAction(async (context, value) => {
    await delay(value === 1 ? 20 : 2);
    context.commit(() => commits.push(value));
    return value;
  }, { name: 'latest' });
  const oldExecution = Promise.resolve(latest(1));
  await Promise.resolve();
  const newExecution = Promise.resolve(latest(2));
  assert.equal(await newExecution, 2);
  await assert.rejects(oldExecution);
  assert.deepEqual(commits, [2]);
  assert.equal(latest.status, 'success');
  assert.equal(latest.data, 2);

  resource.dispose();
  refreshing.dispose();
  client.dispose();
}

async function verifyManagedEffects() {
  const trigger = state(1);
  const commits = [];
  let cleanupCount = 0;
  const managed = managedEffect(async (context) => {
    const value = trigger.value;
    context.onCleanup(() => { cleanupCount += 1; });
    await delay(value === 1 ? 15 : 1);
    context.commit(() => commits.push(value));
  }, { name: 'synchronize' });

  trigger.value = 2;
  await settle();
  await delay(20);
  assert.deepEqual(commits, [2], 'obsolete asynchronous effect executions must not commit');
  assert.equal(cleanupCount, 1);
  managed.dispose();
  assert.equal(cleanupCount, 2);
  assert.equal(managed.active, false);

  const rejectionTrigger = state(1);
  const reportedErrors = [];
  const rejected = managedEffect(async () => {
    const value = rejectionTrigger.value;
    await delay(value === 1 ? 10 : 1);
    if (value === 1) throw new Error('obsolete failure');
  }, { name: 'rejecting', onError: (error) => reportedErrors.push(error) });
  rejectionTrigger.value = 2;
  await settle();
  await delay(14);
  assert.deepEqual(reportedErrors, [], 'superseded effect rejections must not escape the obsolete execution');
  rejected.dispose();
}

function verifyStores() {
  let disposed = 0;
  const registry = new StoreRegistry({ routeId: 'route-a', requestId: 'request-a' });
  registry.register(defineStore({
    key: 'cart',
    lifetime: 'route',
    create: () => ({ items: [] }),
    dispose: () => { disposed += 1; }
  }));
  registry.register(defineStore({
    key: 'editor',
    lifetime: 'component',
    create: ({ scopeId }) => ({ scopeId })
  }));
  registry.register(defineStore({
    key: 'infrastructure',
    lifetime: 'manual',
    create: ({ scopeId }) => ({ scopeId, dispose: () => { disposed += 100; } }),
    dispose: () => { disposed += 1; }
  }));

  const routeA = registry.acquire('cart', 'route', 'component-a');
  const routeB = registry.acquire('cart', 'route', 'component-b');
  assert.equal(routeA.value, routeB.value, 'route stores must be shared inside one route scope');
  routeA.release();
  routeB.release();
  assert.equal(disposed, 0, 'route stores must outlive individual component leases');
  registry.disposeLifetime('route', 'route-a');
  assert.equal(disposed, 1);

  const componentA = registry.acquire('editor', 'component', 'component-a');
  const componentB = registry.acquire('editor', 'component', 'component-b');
  assert.notEqual(componentA.value, componentB.value);
  componentA.release();
  componentB.release();

  const infrastructure = registry.acquire('infrastructure', 'manual', 'worker-pool');
  infrastructure.release();
  assert.equal(disposed, 1, 'manual stores must not be disposed by lease release');
  registry.disposeLifetime('manual', 'worker-pool');
  assert.equal(disposed, 2, 'manual stores require explicit lifetime disposal');
  assert(disposed < 100, 'an explicit store disposer must replace, not duplicate, value.dispose()');
  registry.dispose();

  const requestA = createRequestRuntime({ requestId: 'request-a' });
  const requestB = createRequestRuntime({ requestId: 'request-b' });
  assert.notEqual(requestA.queryClient, requestB.queryClient);
  assert.notEqual(requestA.stores, requestB.stores);
  requestA.dispose();
  requestB.dispose();
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    if (!signal) return;
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}
