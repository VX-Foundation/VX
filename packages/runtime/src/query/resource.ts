import { effect, state } from '../state.js';
import { emitDevtoolsEvent } from '../devtools.js';
import { createQueryKey, hashQueryKey } from './key.js';
import type { QueryClient, QuerySubscription } from './client.js';
import type { QueryDescriptor, QueryResource, QuerySnapshot } from './types.js';

export function createQuery<TInput, TData>(
  client: QueryClient,
  descriptor: QueryDescriptor<TInput, TData>
): QueryResource<TData> {
  const debugId = `query:${descriptor.name}`;
  emitDevtoolsEvent('query', 'register', debugId, { id: debugId, category: 'query', name: descriptor.name, status: 'idle', createdAt: Date.now(), updatedAt: Date.now() });
  const snapshot = state<QuerySnapshot<TData>>(idleSnapshot());
  let subscription: QuerySubscription<TData> | undefined;
  let currentKey: readonly unknown[] = Object.freeze([descriptor.name]);
  let currentTags: readonly string[] = Object.freeze([]);
  let pending: Promise<TData> | undefined;
  let disposed = false;

  const keyEffect = effect(() => {
    const input = descriptor.input();
    const enabled = descriptor.enabled?.() ?? true;
    const nextKey = createQueryKey(descriptor.name, input);
    const nextHash = hashQueryKey(nextKey);
    const nextTags = resolveTags(descriptor.tags, input);
    if (!enabled) {
      subscription?.release();
      subscription = undefined;
      currentKey = nextKey;
      currentTags = nextTags;
      snapshot.value = pausedSnapshot(snapshot.value);
      emitDevtoolsEvent('query', 'update', debugId, { id: debugId, category: 'query', name: descriptor.name, status: 'paused', value: snapshot.value, createdAt: Date.now(), updatedAt: Date.now() });
      return;
    }
    if (nextHash === hashQueryKey(currentKey) && subscription) return;
    subscription?.release();
    currentKey = nextKey;
    currentTags = nextTags;
    subscription = client.observe(nextKey, input, descriptor, (next) => {
      snapshot.value = next;
      emitDevtoolsEvent('query', 'update', debugId, { id: debugId, category: 'query', name: descriptor.name, status: next.status, value: next, createdAt: Date.now(), updatedAt: Date.now() });
    });
    pending = subscription.fetch(false).finally(() => {
      pending = undefined;
    });
    void pending.catch(() => undefined);
  });

  return {
    get status() { return snapshot.value.status; },
    get fetchStatus() { return snapshot.value.fetchStatus; },
    get data() { return snapshot.value.data; },
    get error() { return snapshot.value.error; },
    get loading() { return snapshot.value.loading; },
    get refreshing() { return snapshot.value.refreshing; },
    get paused() { return snapshot.value.paused; },
    get failureCount() { return snapshot.value.failureCount; },
    get stale() {
      const value = snapshot.value;
      const staleTime = descriptor.policy?.staleTimeMs ?? 0;
      return value.invalidated || value.updatedAt === undefined || Date.now() - value.updatedAt > staleTime;
    },
    get key() { return currentKey; },
    get tags() { return currentTags; },
    refetch() {
      if (!subscription) return Promise.reject(new Error(`Query '${descriptor.name}' is not active.`));
      pending = subscription.fetch(true).finally(() => { pending = undefined; });
      return pending;
    },
    prefetch() {
      return client.prefetch(descriptor);
    },
    read() {
      if (snapshot.value.error) throw snapshot.value.error;
      if (snapshot.value.data !== undefined) return snapshot.value.data;
      if (pending) throw pending;
      throw new Error(`Query '${descriptor.name}' has no available data.`);
    },
    invalidate() {
      if (!disposed) subscription?.invalidate();
    },
    cancel(reason) {
      subscription?.cancel(reason);
    },
    remove() {
      subscription?.remove();
      subscription = undefined;
    },
    update(updater) {
      return client.setData(currentKey, updater, { tags: currentTags, ...(descriptor.policy ? { policy: descriptor.policy } : {}) });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      keyEffect.dispose();
      subscription?.release();
      subscription = undefined;
      snapshot.dispose();
      emitDevtoolsEvent('query', 'remove', debugId);
    }
  };
}

function resolveTags<TInput>(tags: QueryDescriptor<TInput, unknown>['tags'], input: TInput): readonly string[] {
  return Object.freeze([...new Set((typeof tags === 'function' ? tags(input) : tags ?? []).map((tag) => tag.trim()).filter(Boolean))].sort());
}

function idleSnapshot<T>(): QuerySnapshot<T> {
  return {
    status: 'idle', fetchStatus: 'idle', data: undefined, error: undefined,
    loading: false, refreshing: false, paused: false, updatedAt: undefined,
    invalidated: false, failureCount: 0
  };
}

function pausedSnapshot<T>(previous: QuerySnapshot<T>): QuerySnapshot<T> {
  return {
    ...previous,
    status: previous.data === undefined ? 'paused' : previous.status,
    fetchStatus: 'paused',
    loading: false,
    refreshing: false,
    paused: true
  };
}
