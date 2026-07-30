import { normalizeQueryError } from './error.js';
import { hashQueryKey, stableSerialize } from './key.js';
import { resolveQueryPolicy } from './policy.js';
import { retryDelay, shouldRetry, waitForRetry } from './retry.js';
import type {
  DehydratedQuery,
  QueryClientEvent,
  QueryClientOptions,
  QueryDescriptor,
  QueryFilter,
  QueryPolicy,
  QuerySnapshot,
  QuerySource
} from './types.js';

interface QueryRecord<TInput = unknown, TData = unknown> {
  key: readonly unknown[];
  hash: string;
  input: TInput;
  source: QuerySource<TInput, TData>;
  policy: QueryPolicy;
  tags: readonly string[];
  meta: Readonly<Record<string, unknown>>;
  snapshot: QuerySnapshot<TData>;
  listeners: Set<(snapshot: QuerySnapshot<TData>) => void>;
  promise?: Promise<TData>;
  controller?: AbortController;
  gcTimer?: ReturnType<typeof setTimeout>;
  intervalTimer?: ReturnType<typeof setInterval>;
}

export interface QuerySubscription<TData> {
  getSnapshot(): QuerySnapshot<TData>;
  fetch(force?: boolean): Promise<TData>;
  invalidate(): void;
  cancel(reason?: unknown): void;
  remove(): void;
  release(): void;
}

export class QueryClient {
  private readonly records = new Map<string, QueryRecord>();
  private readonly listeners = new Set<(event: QueryClientEvent) => void>();
  private readonly onlineWaiters = new Set<() => void>();
  private readonly now: () => number;
  private readonly onlineProvider: () => boolean;
  private onlineOverride: boolean | undefined;
  private disposed = false;

  constructor(options: QueryClientOptions = {}) {
    this.now = options.now ?? Date.now;
    this.onlineProvider = options.online ?? defaultOnline;
  }

  observe<TInput, TData>(
    key: readonly unknown[],
    input: TInput,
    descriptor: Pick<QueryDescriptor<TInput, TData>, 'source' | 'policy' | 'tags' | 'meta' | 'initialData'>,
    listener: (snapshot: QuerySnapshot<TData>) => void
  ): QuerySubscription<TData> {
    this.assertActive();
    const hash = hashQueryKey(key);
    const record = this.getOrCreateRecord(key, hash, input, descriptor);
    if (record.gcTimer) {
      clearTimeout(record.gcTimer);
      delete record.gcTimer;
    }
    record.listeners.add(listener as (snapshot: QuerySnapshot<unknown>) => void);
    listener(record.snapshot);
    this.startInterval(record);

    return {
      getSnapshot: () => record.snapshot,
      fetch: (force = false) => this.fetchRecord(record, force),
      invalidate: () => this.invalidateHash(hash),
      cancel: (reason) => this.cancelHash(hash, reason),
      remove: () => this.removeHash(hash),
      release: () => this.release(record, listener)
    };
  }

  prefetch<TInput, TData>(descriptor: QueryDescriptor<TInput, TData>, input: TInput = descriptor.input()): Promise<TData> {
    this.assertActive();
    const key = Object.freeze([descriptor.name, input] as const);
    const hash = hashQueryKey(key);
    const record = this.getOrCreateRecord(key, hash, input, descriptor);
    return this.fetchRecord(record, false);
  }

  async ensureQueryData<TInput, TData>(descriptor: QueryDescriptor<TInput, TData>, input: TInput = descriptor.input()): Promise<TData> {
    const key = Object.freeze([descriptor.name, input] as const);
    const existing = this.getData<TData>(key);
    const snapshot = this.getSnapshot<TData>(key);
    if (existing !== undefined && snapshot && isFresh(snapshot, resolveQueryPolicy(descriptor.policy), this.now())) return existing;
    return this.prefetch(descriptor, input);
  }

  getData<TData>(key: readonly unknown[]): TData | undefined {
    this.assertActive();
    return this.records.get(hashQueryKey(key))?.snapshot.data as TData | undefined;
  }

  getSnapshot<TData>(key: readonly unknown[]): QuerySnapshot<TData> | undefined {
    this.assertActive();
    return this.records.get(hashQueryKey(key))?.snapshot as QuerySnapshot<TData> | undefined;
  }

  getQueries(filter?: QueryFilter): readonly { key: readonly unknown[]; tags: readonly string[]; snapshot: QuerySnapshot<unknown> }[] {
    this.assertActive();
    return [...this.records.values()]
      .filter((record) => matchesFilter(record, filter))
      .map((record) => ({ key: record.key, tags: record.tags, snapshot: record.snapshot }));
  }

  invalidate(target?: string | readonly unknown[] | ((key: readonly unknown[]) => boolean) | QueryFilter): void {
    this.assertActive();
    for (const record of this.records.values()) {
      if (!matchesTarget(record, target)) continue;
      record.snapshot = { ...record.snapshot, invalidated: true };
      this.notify(record, 'invalidated');
      if (record.listeners.size > 0) void this.fetchRecord(record, true).catch(() => undefined);
    }
  }

  invalidateTags(tags: readonly string[]): void {
    const wanted = new Set(tags);
    this.invalidate({ predicate: (_key, recordTags) => recordTags.some((tag) => wanted.has(tag)) });
  }

  cancelQueries(filter?: QueryFilter, reason?: unknown): void {
    this.assertActive();
    for (const record of this.records.values()) if (matchesFilter(record, filter)) this.cancelRecord(record, reason);
  }

  removeQueries(filter?: QueryFilter): void {
    this.assertActive();
    for (const record of [...this.records.values()]) if (matchesFilter(record, filter)) this.removeHash(record.hash);
  }

  setData<TData>(
    key: readonly unknown[],
    updater: TData | ((current: TData | undefined) => TData),
    options: { tags?: readonly string[]; policy?: Partial<QueryPolicy> } = {}
  ): () => void {
    this.assertActive();
    const hash = hashQueryKey(key);
    let record = this.records.get(hash) as QueryRecord<unknown, TData> | undefined;
    const created = !record;
    if (!record) {
      record = {
        key,
        hash,
        input: key[1],
        source: async () => {
          const current = this.records.get(hash)?.snapshot.data;
          if (current === undefined) throw new Error(`Query '${hash}' has no source.`);
          return current as TData;
        },
        policy: resolveQueryPolicy(options.policy),
        tags: normalizeTags(options.tags),
        meta: Object.freeze({}),
        snapshot: idleSnapshot<TData>(),
        listeners: new Set()
      };
      this.records.set(hash, record as QueryRecord);
    }
    const previous = record.snapshot;
    const data = typeof updater === 'function'
      ? (updater as (current: TData | undefined) => TData)(previous.data)
      : updater;
    record.tags = options.tags ? normalizeTags(options.tags) : record.tags;
    record.snapshot = successSnapshot(
      record.policy.structuralSharing ? replaceEqualDeep(previous.data, data) : data,
      this.now()
    );
    this.notify(record, created ? 'added' : 'updated');
    return () => {
      if (created) this.removeHash(hash);
      else {
        record.snapshot = previous;
        this.notify(record, 'updated');
      }
    };
  }

  hydrate(entries: readonly DehydratedQuery[]): void {
    this.assertActive();
    for (const entry of entries) {
      const existing = this.records.get(entry.hash);
      const snapshot = {
        ...successSnapshot(entry.data, entry.updatedAt),
        invalidated: entry.invalidated ?? false
      };
      if (existing) {
        existing.snapshot = snapshot;
        if (entry.tags) existing.tags = normalizeTags(entry.tags);
        this.notify(existing, 'updated');
        continue;
      }
      const record: QueryRecord = {
        key: entry.key,
        hash: entry.hash,
        input: entry.key[1],
        source: async () => entry.data,
        policy: resolveQueryPolicy(entry.policy),
        tags: normalizeTags(entry.tags),
        meta: Object.freeze({}),
        snapshot,
        listeners: new Set()
      };
      this.records.set(entry.hash, record);
      this.emit({ type: 'added', hash: record.hash, key: record.key, tags: record.tags, snapshot: record.snapshot });
    }
  }

  dehydrate(options: { persistOnly?: boolean; predicate?: (entry: DehydratedQuery) => boolean } = {}): DehydratedQuery[] {
    this.assertActive();
    const output: DehydratedQuery[] = [];
    for (const record of this.records.values()) {
      if (record.snapshot.status !== 'success' || record.snapshot.data === undefined || record.snapshot.updatedAt === undefined) continue;
      if (options.persistOnly && !record.policy.persist) continue;
      const entry: DehydratedQuery = {
        key: record.key,
        hash: record.hash,
        data: record.snapshot.data,
        updatedAt: record.snapshot.updatedAt,
        tags: record.tags,
        invalidated: record.snapshot.invalidated,
        policy: record.policy
      };
      if (!options.predicate || options.predicate(entry)) output.push(entry);
    }
    return output;
  }

  subscribe(listener: (event: QueryClientEvent) => void): () => void {
    this.assertActive();
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setOnline(online: boolean): void {
    this.assertActive();
    this.onlineOverride = online;
    if (online) {
      for (const resume of [...this.onlineWaiters]) resume();
      this.onlineWaiters.clear();
      this.refreshOnReconnect();
    }
  }

  isOnline(): boolean {
    return this.onlineOverride ?? this.onlineProvider();
  }

  refreshOnFocus(): void {
    this.refreshMatching((record) => record.policy.refreshOnFocus);
  }

  refreshOnReconnect(): void {
    this.refreshMatching((record) => record.policy.refreshOnReconnect || record.snapshot.paused);
  }

  clear(): void {
    this.assertActive();
    for (const record of [...this.records.values()]) this.removeHash(record.hash, false);
    this.emit({ type: 'cleared' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const record of this.records.values()) {
      record.controller?.abort(new DOMException('Query client disposed', 'AbortError'));
      if (record.gcTimer) clearTimeout(record.gcTimer);
      if (record.intervalTimer) clearInterval(record.intervalTimer);
      record.listeners.clear();
    }
    for (const resume of this.onlineWaiters) resume();
    this.onlineWaiters.clear();
    this.listeners.clear();
    this.records.clear();
  }

  private getOrCreateRecord<TInput, TData>(
    key: readonly unknown[],
    hash: string,
    input: TInput,
    descriptor: Pick<QueryDescriptor<TInput, TData>, 'source' | 'policy' | 'tags' | 'meta' | 'initialData'>
  ): QueryRecord<TInput, TData> {
    const existing = this.records.get(hash) as QueryRecord<TInput, TData> | undefined;
    const tags = resolveTags(descriptor.tags, input);
    if (existing) {
      existing.input = input;
      existing.source = descriptor.source;
      existing.policy = resolveQueryPolicy(descriptor.policy);
      existing.tags = tags;
      existing.meta = descriptor.meta ?? Object.freeze({});
      return existing;
    }
    const initial = typeof descriptor.initialData === 'function'
      ? (descriptor.initialData as () => TData)()
      : descriptor.initialData;
    const record: QueryRecord<TInput, TData> = {
      key,
      hash,
      input,
      source: descriptor.source,
      policy: resolveQueryPolicy(descriptor.policy),
      tags,
      meta: descriptor.meta ?? Object.freeze({}),
      snapshot: initial === undefined ? idleSnapshot<TData>() : successSnapshot(initial, this.now()),
      listeners: new Set()
    };
    this.records.set(hash, record as QueryRecord);
    this.emit({ type: 'added', hash, key, tags, snapshot: record.snapshot as QuerySnapshot<unknown> });
    return record;
  }

  private async fetchRecord<TInput, TData>(record: QueryRecord<TInput, TData>, force: boolean): Promise<TData> {
    this.assertActive();
    if (!force && record.promise && record.policy.deduplicate) return record.promise;
    if (!force && isFresh(record.snapshot, record.policy, this.now())) return record.snapshot.data as TData;

    record.controller?.abort(new DOMException('Superseded query execution', 'AbortError'));
    const controller = new AbortController();
    record.controller = controller;

    const run = async (): Promise<TData> => {
      if (!this.isOnline() && record.policy.networkMode !== 'always') {
        record.snapshot = pausedSnapshot(record.snapshot);
        this.notify(record, 'updated');
        if (record.policy.networkMode === 'offline-first' && record.snapshot.data !== undefined) {
          return record.snapshot.data;
        }
        await this.waitUntilOnline(controller.signal);
        this.assertActive();
      }

      if (controller.signal.aborted) throw controller.signal.reason;
      record.snapshot = pendingSnapshot(record.snapshot);
      this.notify(record, 'updated');

      let attempt = 0;
      for (;;) {
        attempt += 1;
        try {
          const value = await record.source(record.input, {
            signal: controller.signal,
            attempt,
            key: record.key,
            meta: record.meta
          });
          if (controller.signal.aborted) throw controller.signal.reason;
          const data = record.policy.structuralSharing
            ? replaceEqualDeep(record.snapshot.data, value)
            : value;
          record.snapshot = successSnapshot(data, this.now());
          this.notify(record, 'updated');
          return data;
        } catch (caught) {
          if (controller.signal.aborted) throw caught;
          const error = normalizeQueryError(caught);
          const failureCount = attempt;
          if (shouldRetry(error, attempt, record.policy)) {
            record.snapshot = { ...record.snapshot, failureCount };
            this.notify(record, 'updated');
            await waitForRetry(retryDelay(attempt, record.policy), controller.signal);
            continue;
          }
          record.snapshot = errorSnapshot(record.snapshot, error, failureCount);
          this.notify(record, 'updated');
          throw caught;
        }
      }
    };

    const promise = run().finally(() => {
      if (record.promise === promise) delete record.promise;
      if (record.controller === controller) delete record.controller;
    });
    record.promise = promise;
    return promise;
  }

  private invalidateHash(hash: string): void {
    const record = this.records.get(hash);
    if (!record) return;
    record.snapshot = { ...record.snapshot, invalidated: true };
    this.notify(record, 'invalidated');
    if (record.listeners.size > 0) void this.fetchRecord(record, true).catch(() => undefined);
  }

  private cancelHash(hash: string, reason?: unknown): void {
    const record = this.records.get(hash);
    if (record) this.cancelRecord(record, reason);
  }

  private cancelRecord(record: QueryRecord, reason?: unknown): void {
    if (!record.controller) return;
    record.controller.abort(reason ?? new DOMException('Query cancelled', 'AbortError'));
    record.snapshot = {
      ...record.snapshot,
      fetchStatus: 'idle',
      loading: false,
      refreshing: false,
      paused: false
    };
    this.notify(record, 'cancelled');
  }

  private removeHash(hash: string, emit = true): void {
    const record = this.records.get(hash);
    if (!record) return;
    record.controller?.abort(new DOMException('Query removed', 'AbortError'));
    if (record.gcTimer) clearTimeout(record.gcTimer);
    if (record.intervalTimer) clearInterval(record.intervalTimer);
    record.listeners.clear();
    this.records.delete(hash);
    if (emit) this.emit({ type: 'removed', hash, key: record.key, tags: record.tags, snapshot: record.snapshot });
  }

  private release<TInput, TData>(record: QueryRecord<TInput, TData>, listener: (snapshot: QuerySnapshot<TData>) => void): void {
    record.listeners.delete(listener as (snapshot: QuerySnapshot<unknown>) => void);
    if (record.listeners.size > 0) return;
    record.controller?.abort(new DOMException('Query has no active observers', 'AbortError'));
    if (record.intervalTimer) {
      clearInterval(record.intervalTimer);
      delete record.intervalTimer;
    }
    if (record.policy.retentionTimeMs === 0) {
      this.removeHash(record.hash);
      return;
    }
    record.gcTimer = setTimeout(() => {
      if (record.listeners.size === 0) this.removeHash(record.hash);
    }, record.policy.retentionTimeMs);
  }

  private refreshMatching(predicate: (record: QueryRecord<unknown, unknown>) => boolean): void {
    for (const record of this.records.values()) {
      if (record.listeners.size > 0 && predicate(record as QueryRecord<unknown, unknown>)) {
        void this.fetchRecord(record, false).catch(() => undefined);
      }
    }
  }

  private startInterval<TInput, TData>(record: QueryRecord<TInput, TData>): void {
    if (record.intervalTimer || record.policy.refetchIntervalMs <= 0) return;
    record.intervalTimer = setInterval(() => {
      if (record.listeners.size === 0) return;
      if (!this.isOnline() && record.policy.networkMode !== 'always') return;
      void this.fetchRecord(record, true).catch(() => undefined);
    }, record.policy.refetchIntervalMs);
  }

  private notify<TInput, TData>(record: QueryRecord<TInput, TData>, type: QueryClientEvent['type']): void {
    for (const listener of record.listeners) listener(record.snapshot);
    this.emit({
      type,
      hash: record.hash,
      key: record.key,
      tags: record.tags,
      snapshot: record.snapshot as QuerySnapshot<unknown>
    });
  }

  private emit(event: QueryClientEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* Observability cannot break query execution. */ }
    }
  }

  private waitUntilOnline(signal: AbortSignal): Promise<void> {
    if (this.isOnline()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const resume = (): void => {
        signal.removeEventListener('abort', abort);
        this.onlineWaiters.delete(resume);
        resolve();
      };
      const abort = (): void => {
        this.onlineWaiters.delete(resume);
        reject(signal.reason ?? new DOMException('Query cancelled', 'AbortError'));
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener('abort', abort, { once: true });
      this.onlineWaiters.add(resume);
    });
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('QueryClient has been disposed.');
  }
}

function matchesTarget(
  record: QueryRecord<unknown, unknown>,
  target: string | readonly unknown[] | ((key: readonly unknown[]) => boolean) | QueryFilter | undefined
): boolean {
  if (target === undefined) return true;
  if (typeof target === 'function') return target(record.key);
  if (typeof target === 'string') return record.key[0] === target || record.tags.includes(target);
  if (Array.isArray(target)) return prefixMatches(record.key, target, false);
  return matchesFilter(record, target as QueryFilter);
}

function matchesFilter(record: QueryRecord<unknown, unknown>, filter: QueryFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.name !== undefined && record.key[0] !== filter.name) return false;
  if (filter.key && !prefixMatches(record.key, filter.key, filter.exact ?? false)) return false;
  if (filter.tags && !filter.tags.every((tag) => record.tags.includes(tag))) return false;
  return filter.predicate ? filter.predicate(record.key, record.tags) : true;
}

function prefixMatches(key: readonly unknown[], target: readonly unknown[], exact: boolean): boolean {
  if (exact && target.length !== key.length) return false;
  if (target.length > key.length) return false;
  return target.every((part, index) => Object.is(part, key[index]) || stableSerialize(part) === stableSerialize(key[index]));
}

function resolveTags<TInput>(
  tags: readonly string[] | ((input: TInput) => readonly string[]) | undefined,
  input: TInput
): readonly string[] {
  return normalizeTags(typeof tags === 'function' ? tags(input) : tags);
}

function normalizeTags(tags: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].sort());
}

function idleSnapshot<T>(): QuerySnapshot<T> {
  return {
    status: 'idle', fetchStatus: 'idle', data: undefined, error: undefined,
    loading: false, refreshing: false, paused: false, updatedAt: undefined,
    invalidated: false, failureCount: 0
  };
}

function pendingSnapshot<T>(previous: QuerySnapshot<T>): QuerySnapshot<T> {
  return {
    ...previous,
    status: previous.data === undefined ? 'loading' : previous.status === 'error' ? 'success' : previous.status,
    fetchStatus: 'fetching',
    error: undefined,
    loading: previous.data === undefined,
    refreshing: previous.data !== undefined,
    paused: false
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

function successSnapshot<T>(data: T, updatedAt: number): QuerySnapshot<T> {
  return {
    status: 'success', fetchStatus: 'idle', data, error: undefined,
    loading: false, refreshing: false, paused: false, updatedAt,
    invalidated: false, failureCount: 0
  };
}

function errorSnapshot<T>(previous: QuerySnapshot<T>, error: ReturnType<typeof normalizeQueryError>, failureCount: number): QuerySnapshot<T> {
  return {
    ...previous,
    status: 'error', fetchStatus: 'idle', error,
    loading: false, refreshing: false, paused: false,
    invalidated: false, failureCount
  };
}

function isFresh<T>(snapshot: QuerySnapshot<T>, policy: QueryPolicy, now: number): boolean {
  return snapshot.status === 'success' && !snapshot.invalidated && snapshot.updatedAt !== undefined && now - snapshot.updatedAt <= policy.staleTimeMs;
}

function replaceEqualDeep<T>(previous: T | undefined, next: T): T {
  if (Object.is(previous, next)) return previous as T;
  if (Array.isArray(previous) && Array.isArray(next)) {
    let equal = previous.length === next.length;
    const result = next.map((item, index) => {
      const value = replaceEqualDeep(previous[index], item);
      if (!Object.is(value, previous[index])) equal = false;
      return value;
    });
    return (equal ? previous : result) as T;
  }
  if (isPlainObject(previous) && isPlainObject(next)) {
    const previousKeys = Object.keys(previous);
    const nextKeys = Object.keys(next);
    let equal = previousKeys.length === nextKeys.length;
    const result: Record<string, unknown> = {};
    for (const key of nextKeys) {
      const value = replaceEqualDeep(previous[key], next[key]);
      result[key] = value;
      if (!Object.is(value, previous[key])) equal = false;
    }
    return (equal ? previous : result) as T;
  }
  return next;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

function defaultOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}
