import {
  OfflineMutationQueue,
  RealtimeClient,
  createInfiniteQuery,
  createMemoryPersistenceAdapter
} from '@vx/data';
import { QueryClient, createAction, createQuery, state } from '@vx/runtime';

export interface CollaborativeEvent { id: string; version: number; body: string; }
export interface ActivityPage { items: readonly { id: string; label: string }[]; next?: number; }

export const collaborationClient = new QueryClient();
export const documentVersion = state(0);
const documentInput = state({ id: 'document-1' });

export const documentQuery = createQuery(collaborationClient, {
  name: 'collaboration.document',
  input: () => documentInput.value,
  source: async ({ id }) => ({ id, body: '', version: documentVersion.value }),
  initialData: { id: 'document-1', body: '', version: 0 },
  tags: ['documents']
});

export const offlineEdits = new OfflineMutationQueue({
  adapter: createMemoryPersistenceAdapter(),
  conflict: async (_mutation, error) => error instanceof Error && error.message === 'version-conflict' ? 'pause' : 'retry'
});

export const submitEdit = createAction(async (context, body: string) => {
  context.optimistic(documentQuery, (current) => ({
    id: current?.id ?? 'document-1',
    body,
    version: current?.version ?? documentVersion.value
  }));
  context.commit(() => { documentVersion.value += 1; });
  context.invalidate(documentQuery);
  return { body, version: documentVersion.value };
}, {
  name: 'collaboration.document.edit',
  queryClient: collaborationClient,
  networkMode: 'offline-first',
  queue: offlineEdits,
  idempotencyKey: ([body]) => `edit:${documentVersion.value}:${body.length}`
});

export const activity = createInfiniteQuery<number, ActivityPage>(collaborationClient, {
  name: 'collaboration.activity',
  initialPageParam: 0,
  getNextPageParam: (page) => page.next,
  query: async (pageParam) => ({
    items: Array.from({ length: 100 }, (_, index) => ({
      id: `${pageParam}:${index}`,
      label: `Event ${pageParam * 100 + index}`
    })),
    ...(pageParam < 99 ? { next: pageParam + 1 } : {})
  }),
  maxPages: 10,
  tags: ['activity']
});

export function connectRealtime(url: string): RealtimeClient {
  return new RealtimeClient({
    url,
    transport: {
      async connect() {
        return {
          send() {},
          close() {},
          onMessage() { return () => undefined; },
          onClose() { return () => undefined; },
          onError() { return () => undefined; }
        };
      }
    }
  });
}
