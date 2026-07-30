import type { QueryClient } from '../query/client.js';
import type { QueryResource } from '../query/types.js';

export type ActionStatus = 'idle' | 'queued' | 'running' | 'success' | 'partial' | 'error' | 'cancelled';
export type ActionNetworkMode = 'online' | 'always' | 'offline-first';

export interface ActionError {
  name: string;
  message: string;
  code?: string;
  cause?: unknown;
}

export interface ActionProgress {
  loaded: number;
  total?: number;
  message?: string;
}

export interface ActionSnapshot<TResult> {
  status: ActionStatus;
  running: boolean;
  queued: boolean;
  data: TResult | undefined;
  error: ActionError | undefined;
  progress: ActionProgress | undefined;
  attempt: number;
  idempotencyKey: string | undefined;
  startedAt: number | undefined;
  finishedAt: number | undefined;
}

export interface QueuedActionRequest<TResult = unknown> {
  action: string;
  args: readonly unknown[];
  idempotencyKey: string;
  createdAt: number;
  execute(signal: AbortSignal): Promise<TResult>;
}

export interface ActionQueue {
  isOnline(): boolean;
  enqueue<TResult>(request: QueuedActionRequest<TResult>): Promise<TResult>;
}

export interface ActionExecutionContext {
  readonly signal: AbortSignal;
  readonly attempt: number;
  readonly idempotencyKey: string;
  commit(operation: () => void): boolean;
  optimistic<T>(resource: QueryResource<T>, updater: T | ((current: T | undefined) => T)): void;
  invalidate<T>(target: string | readonly unknown[] | QueryResource<T>): void;
  invalidateTags(tags: readonly string[]): void;
  refresh<T>(resource: QueryResource<T>): void;
  reportProgress(progress: ActionProgress): void;
}

export type ActionHandler<TArgs extends unknown[], TResult> = (
  context: ActionExecutionContext,
  ...args: TArgs
) => TResult | Promise<TResult>;

export interface ActionOptions<TArgs extends unknown[] = unknown[]> {
  name: string;
  queryClient?: QueryClient;
  concurrent?: 'cancel-previous' | 'reject';
  retries?: number;
  retryDelayMs?: number;
  retryBackoff?: 'fixed' | 'exponential';
  timeoutMs?: number;
  networkMode?: ActionNetworkMode;
  queue?: ActionQueue;
  idempotencyKey?: (args: TArgs) => string;
  retryable?: (error: ActionError, attempt: number) => boolean;
}

export interface ManagedAction<TArgs extends unknown[], TResult> {
  (...args: TArgs): TResult | Promise<TResult>;
  readonly status: ActionStatus;
  readonly running: boolean;
  readonly queued: boolean;
  readonly data: TResult | undefined;
  readonly error: ActionError | undefined;
  readonly progress: ActionProgress | undefined;
  readonly attempt: number;
  readonly idempotencyKey: string | undefined;
  cancel(reason?: unknown): void;
  reset(): void;
}

export interface ActionBatchResult<T> {
  status: 'success' | 'partial' | 'error';
  values: Array<T | undefined>;
  errors: Array<ActionError | undefined>;
}
