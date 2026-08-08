import { describe, expect, it } from 'vitest';
import { QueryClient } from '@vx-foundation/runtime';
import {
  OfflineMutationQueue,
  RealtimeClient,
  createInfiniteQuery,
  createMemoryPersistenceAdapter,
  persistQueryClient,
  synchronizeQueryClient,
  type DataBroadcastChannel,
  type RealtimeConnection,
  type RealtimeTransport
} from '../src/index.js';

describe('VX data platform', () => {
  it('persists only opted-in query state and restores it', async () => {
    const adapter = createMemoryPersistenceAdapter();
    const source = new QueryClient();
    source.setData(['profile', 1], { name: 'VX' }, { tags: ['profile'], policy: { persist: true } });
    source.setData(['temporary', 1], { value: true }, { policy: { persist: false } });
    const persistence = persistQueryClient(source, adapter, { throttleMs: 0, buster: 'phase13' });
    await persistence.flush();

    const target = new QueryClient();
    const restored = persistQueryClient(target, adapter, { buster: 'phase13' });
    expect(await restored.restore()).toBe(true);
    expect(target.getData(['profile', 1])).toEqual({ name: 'VX' });
    expect(target.getData(['temporary', 1])).toBeUndefined();
    await persistence.dispose();
    await restored.dispose();
  });

  it('synchronizes cache data without broadcast loops', () => {
    const bus = createTestBus();
    const first = new QueryClient();
    const second = new QueryClient();
    const stopFirst = synchronizeQueryClient(first, { channel: bus.channel(), instanceId: 'first' });
    const stopSecond = synchronizeQueryClient(second, { channel: bus.channel(), instanceId: 'second' });
    first.setData(['users', 1], { id: 1 }, { tags: ['users'] });
    expect(second.getData(['users', 1])).toEqual({ id: 1 });
    expect(bus.messageCount).toBe(1);
    stopFirst();
    stopSecond();
  });

  it('queues offline actions with per-instance completion ownership', async () => {
    let online = false;
    const first = new OfflineMutationQueue({ online: () => online, retryDelayMs: 0 });
    const second = new OfflineMutationQueue({ online: () => online, retryDelayMs: 0 });
    const firstResult = first.enqueue({ action: 'save', args: [1], idempotencyKey: 'same', createdAt: 1, execute: async () => 'first' });
    const secondResult = second.enqueue({ action: 'save', args: [2], idempotencyKey: 'same', createdAt: 1, execute: async () => 'second' });
    online = true;
    await Promise.all([first.flush(), second.flush()]);
    await expect(firstResult).resolves.toBe('first');
    await expect(secondResult).resolves.toBe('second');
  });

  it('loads and trims infinite-query pages', async () => {
    const query = createInfiniteQuery(new QueryClient(), {
      name: 'timeline',
      initialPageParam: 0,
      maxPages: 2,
      query: async (page) => ({ page }),
      getNextPageParam: (last) => last.page + 1
    });
    await query.fetchInitial();
    await query.fetchNextPage();
    await query.fetchNextPage();
    expect(query.snapshot.pageParams).toEqual([1, 2]);
    expect(query.snapshot.pages).toEqual([{ page: 1 }, { page: 2 }]);
  });

  it('delivers realtime events and invalidates matching tags', async () => {
    const connection = createRealtimeConnection();
    const client = new QueryClient();
    client.setData(['posts'], [{ id: 1 }], { tags: ['posts'] });
    const realtime = new RealtimeClient({ url: 'wss://vx.veelv.site', transport: connection.transport, queryClient: client, heartbeatMs: 0 });
    const messages: unknown[] = [];
    realtime.subscribe('posts', (message) => messages.push(message.data));
    await realtime.connect();
    connection.emit(JSON.stringify({ id: 'event-1', topic: 'posts', type: 'changed', data: { id: 2 }, timestamp: 1, tags: ['posts'] }));
    expect(messages).toEqual([{ id: 2 }]);
    expect(client.getSnapshot(['posts'])?.invalidated).toBe(true);
    realtime.disconnect();
  });
});

function createTestBus(): { channel(): DataBroadcastChannel; readonly messageCount: number } {
  const listeners = new Set<(event: MessageEvent) => void>();
  let messages = 0;
  return {
    get messageCount() { return messages; },
    channel() {
      let active = true;
      return {
        postMessage(value) {
          if (!active) return;
          messages += 1;
          for (const listener of listeners) listener({ data: value } as MessageEvent);
        },
        addEventListener(_type, listener) { listeners.add(listener); },
        removeEventListener(_type, listener) { listeners.delete(listener); },
        close() { active = false; }
      };
    }
  };
}

function createRealtimeConnection(): {
  transport: RealtimeTransport;
  emit(value: string): void;
} {
  const messageListeners = new Set<(value: string) => void>();
  const connection: RealtimeConnection = {
    send() {},
    close() {},
    onMessage(listener) { messageListeners.add(listener); return () => messageListeners.delete(listener); },
    onClose() { return () => undefined; },
    onError() { return () => undefined; }
  };
  return {
    transport: { connect: async () => connection },
    emit(value) { for (const listener of messageListeners) listener(value); }
  };
}
