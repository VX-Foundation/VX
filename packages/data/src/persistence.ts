import {
  dehydrateQueryClient,
  hydrateQueryClient,
  type DehydratedQueryState,
  type QueryClient,
  type QueryClientEvent,
  type QueryDehydrateOptions
} from '@vx-foundation/runtime';

export interface DataPersistenceAdapter {
  read(key: string): Promise<unknown>;
  write(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface QueryPersistenceOptions {
  key?: string;
  buster?: string;
  maxAgeMs?: number;
  throttleMs?: number;
  predicate?: QueryDehydrateOptions['predicate'];
  onError?: (error: unknown) => void;
}

export interface QueryPersistenceController {
  restore(): Promise<boolean>;
  flush(): Promise<void>;
  clear(): Promise<void>;
  dispose(): Promise<void>;
}

export function persistQueryClient(
  client: QueryClient,
  adapter: DataPersistenceAdapter,
  options: QueryPersistenceOptions = {}
): QueryPersistenceController {
  const key = options.key ?? 'vx:queries';
  const throttleMs = Math.max(0, options.throttleMs ?? 250);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active = true;
  let writing = Promise.resolve();

  const unsubscribe = client.subscribe((event) => {
    if (!active || !shouldPersist(event)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      writing = writing.then(flush).catch(reportError);
    }, throttleMs);
  });

  const flush = async (): Promise<void> => {
    if (!active) return;
    const state = dehydrateQueryClient(client, {
      persistOnly: true,
      ...(options.buster ? { buster: options.buster } : {}),
      ...(options.predicate ? { predicate: options.predicate } : {})
    });
    await adapter.write(key, state);
  };

  return {
    async restore() {
      const raw = await adapter.read(key);
      if (!raw) return false;
      const state = assertState(raw);
      if (options.buster && state.buster !== options.buster) {
        await adapter.remove(key);
        return false;
      }
      if (options.maxAgeMs !== undefined && state.timestamp !== undefined && Date.now() - state.timestamp > options.maxAgeMs) {
        await adapter.remove(key);
        return false;
      }
      hydrateQueryClient(client, state);
      return true;
    },
    flush,
    clear: () => adapter.remove(key),
    async dispose() {
      if (!active) return;
      unsubscribe();
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
        await flush().catch(reportError);
      }
      await writing;
      active = false;
    }
  };

  function reportError(error: unknown): void {
    options.onError?.(error);
  }
}

export function createMemoryPersistenceAdapter(): DataPersistenceAdapter {
  const entries = new Map<string, unknown>();
  return {
    async read(key) { return structuredCloneSafe(entries.get(key)); },
    async write(key, value) { entries.set(key, structuredCloneSafe(value)); },
    async remove(key) { entries.delete(key); }
  };
}

export function createWebStoragePersistenceAdapter(storage: Storage): DataPersistenceAdapter {
  return {
    async read(key) {
      const value = storage.getItem(key);
      return value === null ? undefined : JSON.parse(value) as unknown;
    },
    async write(key, value) { storage.setItem(key, JSON.stringify(value)); },
    async remove(key) { storage.removeItem(key); }
  };
}

function shouldPersist(event: QueryClientEvent): boolean {
  return event.type === 'added' || event.type === 'updated' || event.type === 'invalidated' || event.type === 'removed' || event.type === 'cleared';
}

function assertState(value: unknown): DehydratedQueryState {
  if (!value || typeof value !== 'object') throw new TypeError('Persisted VX query state must be an object.');
  const state = value as Partial<DehydratedQueryState>;
  if (state.version !== 1 || !Array.isArray(state.queries)) throw new TypeError('Persisted VX query state has an unsupported version.');
  return state as DehydratedQueryState;
}

function structuredCloneSafe<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value)) as T;
}
