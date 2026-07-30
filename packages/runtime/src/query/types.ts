export type QueryStatus = 'idle' | 'paused' | 'loading' | 'success' | 'error';
export type QueryFetchStatus = 'idle' | 'fetching' | 'paused';
export type QueryExecutionMode = 'universal' | 'server' | 'client';
export type QueryNetworkMode = 'online' | 'always' | 'offline-first';

export interface QueryPolicy {
  staleTimeMs: number;
  retentionTimeMs: number;
  retries: number;
  retryDelayMs: number;
  retryBackoff: 'fixed' | 'exponential';
  execution: QueryExecutionMode;
  networkMode: QueryNetworkMode;
  deduplicate: boolean;
  refreshOnFocus: boolean;
  refreshOnReconnect: boolean;
  refetchIntervalMs: number;
  structuralSharing: boolean;
  persist: boolean;
}

export interface QuerySnapshot<T> {
  status: QueryStatus;
  fetchStatus: QueryFetchStatus;
  data: T | undefined;
  error: QueryError | undefined;
  loading: boolean;
  refreshing: boolean;
  paused: boolean;
  updatedAt: number | undefined;
  invalidated: boolean;
  failureCount: number;
}

export interface QueryError {
  name: string;
  message: string;
  code?: string;
  retryable: boolean;
  cause?: unknown;
}

export interface QueryExecutionContext {
  signal: AbortSignal;
  attempt: number;
  key: readonly unknown[];
  meta: Readonly<Record<string, unknown>>;
}

export type QuerySource<TInput, TData> = (
  input: TInput,
  context: QueryExecutionContext
) => TData | Promise<TData>;

export interface QueryDescriptor<TInput, TData> {
  name: string;
  source: QuerySource<TInput, TData>;
  input: () => TInput;
  policy?: Partial<QueryPolicy>;
  enabled?: () => boolean;
  tags?: readonly string[] | ((input: TInput) => readonly string[]);
  meta?: Readonly<Record<string, unknown>>;
  initialData?: TData | (() => TData);
}

export interface QueryResource<TData> {
  readonly status: QueryStatus;
  readonly fetchStatus: QueryFetchStatus;
  readonly data: TData | undefined;
  readonly error: QueryError | undefined;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly paused: boolean;
  readonly stale: boolean;
  readonly failureCount: number;
  readonly key: readonly unknown[];
  readonly tags: readonly string[];
  refetch(): Promise<TData>;
  prefetch(): Promise<TData>;
  read(): TData;
  invalidate(): void;
  cancel(reason?: unknown): void;
  remove(): void;
  update(updater: TData | ((current: TData | undefined) => TData)): () => void;
  dispose(): void;
}

export interface DehydratedQuery {
  key: readonly unknown[];
  hash: string;
  data: unknown;
  updatedAt: number;
  tags?: readonly string[];
  invalidated?: boolean;
  policy?: Partial<QueryPolicy>;
}

export interface DehydratedQueryState {
  version: 1;
  queries: DehydratedQuery[];
  timestamp?: number;
  buster?: string;
}

export type QueryEventType = 'added' | 'updated' | 'invalidated' | 'removed' | 'cancelled' | 'cleared';

export interface QueryClientEvent {
  type: QueryEventType;
  hash?: string;
  key?: readonly unknown[];
  tags?: readonly string[];
  snapshot?: QuerySnapshot<unknown>;
}

export interface QueryClientOptions {
  now?: () => number;
  online?: () => boolean;
}

export interface QueryFilter {
  key?: readonly unknown[];
  name?: string;
  tags?: readonly string[];
  predicate?: (key: readonly unknown[], tags: readonly string[]) => boolean;
  exact?: boolean;
}
