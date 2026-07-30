import assert from 'node:assert/strict';
import {
  QueryClient,
  createAction,
  createQuery,
  dehydrateQueryClient,
  hydrateQueryClient,
  runActionBatch
} from '../packages/runtime/dist/client.js';
import {
  OfflineMutationQueue,
  RealtimeClient,
  RealtimeHub,
  createInfiniteQuery,
  createMemoryPersistenceAdapter,
  persistQueryClient,
  synchronizeQueryClient
} from '../packages/data/dist/index.js';

await verifyQueryPlatform();
await verifyPersistenceAndBroadcast();
await verifyInfiniteQueries();
await verifyActionsAndOfflineQueue();
await verifyRealtime();

console.log('VX Phase 13 runtime verification passed (cache tags, persistence, offline mutations, infinite queries, realtime, and batches).');

async function verifyQueryPlatform() {
  let online = false;
  const client = new QueryClient({ online: () => online });
  let calls = 0;
  const resource = createQuery(client, {
    name: 'profile',
    input: () => ({ id: 1 }),
    source: async () => ({ user: { id: 1, name: 'Ada' }, calls: ++calls }),
    tags: ['users', 'profile'],
    policy: { networkMode: 'offline-first', retries: 0, staleTimeMs: 60_000 }
  });
  await settle();
  assert.equal(resource.status, 'paused');
  online = true;
  client.setOnline(true);
  await settle(4);
  assert.equal(resource.status, 'success');
  const firstUser = resource.data.user;
  await resource.refetch();
  assert.equal(resource.data.user, firstUser, 'structural sharing must preserve equal nested objects');
  const before = calls;
  client.invalidateTags(['users']);
  await settle(4);
  assert(calls > before, 'tag invalidation must refetch active queries');
  resource.dispose();
  client.dispose();

  let pausedExecutions = 0;
  const pausedClient = new QueryClient({ online: () => false });
  const paused = createQuery(pausedClient, {
    name: 'cancel-paused', input: () => 1,
    source: async () => { pausedExecutions += 1; return 1; },
    policy: { networkMode: 'online' }
  });
  await settle();
  assert.equal(paused.paused, true);
  paused.dispose();
  pausedClient.setOnline(true);
  await settle(3);
  assert.equal(pausedExecutions, 0, 'disposed paused queries must never execute after reconnect');
  pausedClient.dispose();
}

async function verifyPersistenceAndBroadcast() {
  const adapter = createMemoryPersistenceAdapter();
  const source = new QueryClient();
  source.setData(['settings', { account: 1 }], { theme: 'dark' }, { tags: ['settings'], policy: { persist: true } });
  const persistence = persistQueryClient(source, adapter, { key: 'test', buster: 'v1', throttleMs: 0 });
  await persistence.flush();

  const structuredSource = new QueryClient();
  structuredSource.setData(['structured', new Date('2026-01-01T00:00:00.000Z')], {
    created: new Date('2026-01-02T00:00:00.000Z'),
    amount: 42n,
    values: new Map([['vx', new Set([1, 2])]]),
    optional: undefined
  });
  const structuredState = dehydrateQueryClient(structuredSource);
  const structuredTarget = new QueryClient();
  hydrateQueryClient(structuredTarget, structuredState);
  const structured = structuredTarget.getData(['structured', new Date('2026-01-01T00:00:00.000Z')]);
  assert(structured.created instanceof Date);
  assert.equal(structured.amount, 42n);
  assert(structured.values instanceof Map);
  assert(structured.values.get('vx') instanceof Set);
  assert.equal(structured.optional, undefined);

  const restored = new QueryClient();
  const restoredPersistence = persistQueryClient(restored, adapter, { key: 'test', buster: 'v1' });
  assert.equal(await restoredPersistence.restore(), true);
  assert.deepEqual(restored.getData(['settings', { account: 1 }]), { theme: 'dark' });

  const pair = createChannelPair();
  const first = new QueryClient();
  const second = new QueryClient();
  const stopFirst = synchronizeQueryClient(first, { channel: pair.first, instanceId: 'first' });
  const stopSecond = synchronizeQueryClient(second, { channel: pair.second, instanceId: 'second' });
  first.setData(['catalog', 1], { value: 7 }, { tags: ['catalog'] });
  await settle();
  assert.deepEqual(second.getData(['catalog', 1]), { value: 7 });
  stopFirst();
  stopSecond();
  await persistence.dispose();
  await restoredPersistence.dispose();
  source.dispose(); structuredSource.dispose(); structuredTarget.dispose(); restored.dispose(); first.dispose(); second.dispose();
}

async function verifyInfiniteQueries() {
  const client = new QueryClient();
  const infinite = createInfiniteQuery(client, {
    name: 'feed',
    initialPageParam: 1,
    query: async (page) => ({ page, next: page < 4 ? page + 1 : undefined }),
    getNextPageParam: (last) => last.next,
    maxPages: 2,
    tags: ['feed']
  });
  await infinite.fetchInitial();
  await infinite.fetchNextPage();
  await infinite.fetchNextPage();
  assert.deepEqual(infinite.snapshot.pages.map((page) => page.page), [2, 3]);
  assert.deepEqual(infinite.snapshot.pageParams, [2, 3]);
  client.dispose();
}

async function verifyActionsAndOfflineQueue() {
  let online = false;
  const adapter = createMemoryPersistenceAdapter();
  const queue = new OfflineMutationQueue({ adapter, online: () => online, retryDelayMs: 0 });
  const client = new QueryClient();
  client.setData(['todos'], [{ id: 1, done: false }], { tags: ['todos'] });
  let executions = 0;
  const action = createAction(async (context, id) => {
    context.reportProgress({ loaded: 1, total: 2 });
    const resource = fakeResource(client, ['todos']);
    context.optimistic(resource, (todos) => todos.map((todo) => todo.id === id ? { ...todo, done: true } : todo));
    if (!online) {
      const error = new TypeError('offline');
      error.code = 'NETWORK';
      throw error;
    }
    executions += 1;
    context.invalidateTags(['todos']);
    context.reportProgress({ loaded: 2, total: 2 });
    return { saved: id };
  }, {
    name: 'completeTodo',
    queryClient: client,
    networkMode: 'offline-first',
    queue,
    idempotencyKey: ([id]) => `todo:${id}`
  });

  const pending = action(1);
  await settle();
  assert.equal(action.status, 'queued');
  assert.equal(action.idempotencyKey, 'todo:1');
  assert.equal(client.getData(['todos'])[0].done, true, 'queued mutation must retain its optimistic update');
  online = true;
  await queue.flush();
  assert.deepEqual(await pending, { saved: 1 });
  assert.equal(executions, 1);
  assert.equal(action.progress.loaded, 2);
  await settle();
  assert.equal(client.getSnapshot(['todos']).invalidated, true, 'queued action invalidations must commit after successful replay');

  let isolatedOnline = false;
  const firstQueue = new OfflineMutationQueue({ online: () => isolatedOnline, retryDelayMs: 0 });
  const secondQueue = new OfflineMutationQueue({ online: () => isolatedOnline, retryDelayMs: 0 });
  const firstPending = firstQueue.enqueue({ action: 'same', args: [], idempotencyKey: 'shared', createdAt: 1, execute: async () => 'first' });
  const secondPending = secondQueue.enqueue({ action: 'same', args: [], idempotencyKey: 'shared', createdAt: 1, execute: async () => 'second' });
  isolatedOnline = true;
  await Promise.all([firstQueue.flush(), secondQueue.flush()]);
  assert.equal(await firstPending, 'first');
  assert.equal(await secondPending, 'second');
  firstQueue.dispose(); secondQueue.dispose();

  await assert.rejects(
    () => firstQueue.enqueue({ action: 'unsafe', args: [() => undefined], idempotencyKey: 'unsafe', createdAt: 1, execute: async () => undefined }),
    /cannot contain function/
  );

  const batch = await runActionBatch([
    async () => 1,
    async () => { throw new Error('partial'); },
    async () => 3
  ]);
  assert.equal(batch.status, 'partial');
  assert.deepEqual(batch.values, [1, undefined, 3]);
  queue.dispose();
  client.dispose();
}

async function verifyRealtime() {
  const client = new QueryClient();
  client.setData(['messages'], [{ id: 1 }], { tags: ['messages'] });
  const transport = createRealtimeTransport();
  const realtime = new RealtimeClient({ url: 'ws://vx.test', transport, queryClient: client, heartbeatMs: 0 });
  const received = [];
  realtime.subscribe('room:1', (message) => received.push(message.data));
  await realtime.connect();
  transport.emit({ id: '2', topic: 'room:1', type: 'created', data: { id: 2 }, timestamp: Date.now(), tags: ['messages'] });
  await settle();
  assert.deepEqual(received, [{ id: 2 }]);
  assert.equal(client.getSnapshot(['messages']).invalidated, true);

  const delivered = [];
  const hub = new RealtimeHub();
  hub.add({ id: 'peer', topics: new Set(['room:1']), send: (message) => delivered.push(message.id) });
  await hub.publish({ id: 'hub-1', topic: 'room:1', type: 'event', data: null, timestamp: Date.now() });
  assert.deepEqual(delivered, ['hub-1']);
  await hub.stop();
  realtime.disconnect();
  client.dispose();
}

function fakeResource(client, key) {
  return {
    get status() { return client.getSnapshot(key).status; },
    get fetchStatus() { return client.getSnapshot(key).fetchStatus; },
    get data() { return client.getData(key); },
    get error() { return client.getSnapshot(key).error; },
    get loading() { return false; }, get refreshing() { return false; }, get paused() { return false; }, get stale() { return false; },
    get failureCount() { return 0; }, get key() { return key; }, get tags() { return ['todos']; },
    refetch: async () => client.getData(key), prefetch: async () => client.getData(key), read: () => client.getData(key),
    invalidate: () => client.invalidate(key), cancel() {}, remove: () => client.removeQueries({ key, exact: true }),
    update: (updater) => client.setData(key, updater, { tags: ['todos'] }), dispose() {}
  };
}

function createChannelPair() {
  const firstListeners = new Set();
  const secondListeners = new Set();
  return {
    first: channel(firstListeners, secondListeners),
    second: channel(secondListeners, firstListeners)
  };
}

function channel(own, other) {
  return {
    postMessage(value) { queueMicrotask(() => { for (const listener of other) listener({ data: value }); }); },
    addEventListener(_type, listener) { own.add(listener); },
    removeEventListener(_type, listener) { own.delete(listener); },
    close() { own.clear(); }
  };
}

function createRealtimeTransport() {
  const messageListeners = new Set();
  const closeListeners = new Set();
  const errorListeners = new Set();
  return {
    async connect() {
      return {
        send() {}, close() { for (const listener of closeListeners) listener(); },
        onMessage(listener) { messageListeners.add(listener); return () => messageListeners.delete(listener); },
        onClose(listener) { closeListeners.add(listener); return () => closeListeners.delete(listener); },
        onError(listener) { errorListeners.add(listener); return () => errorListeners.delete(listener); }
      };
    },
    emit(message) { const value = JSON.stringify(message); for (const listener of messageListeners) listener(value); }
  };
}

async function settle(turns = 2) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}
