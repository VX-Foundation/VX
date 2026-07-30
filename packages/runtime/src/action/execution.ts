import type { QueryClient } from '../query/client.js';
import type { QueryResource } from '../query/types.js';

interface InvalidatableQueryResource { invalidate(): void; }
interface RefreshableQueryResource { refetch(): Promise<unknown>; }

export interface ActionTransaction {
  queryClient?: QueryClient;
  rollbacks: Array<() => void>;
  invalidations: Array<string | readonly unknown[] | InvalidatableQueryResource>;
  tagInvalidations: string[][];
  refreshes: RefreshableQueryResource[];
}

export function applyOptimistic<T>(
  transaction: ActionTransaction,
  resource: QueryResource<T>,
  updater: T | ((current: T | undefined) => T)
): void {
  transaction.rollbacks.push(resource.update(updater));
}

export function scheduleInvalidation<T>(
  transaction: ActionTransaction,
  target: string | readonly unknown[] | QueryResource<T>
): void {
  transaction.invalidations.push(target);
}

export function scheduleTagInvalidation(transaction: ActionTransaction, tags: readonly string[]): void {
  transaction.tagInvalidations.push([...tags]);
}

export function scheduleRefresh<T>(transaction: ActionTransaction, resource: QueryResource<T>): void {
  transaction.refreshes.push(resource);
}

export function rollbackTransaction(transaction: ActionTransaction): void {
  for (const rollback of [...transaction.rollbacks].reverse()) rollback();
  clearTransaction(transaction);
}

export function commitTransaction(transaction: ActionTransaction): void {
  const invalidations = [...transaction.invalidations];
  const tagInvalidations = [...transaction.tagInvalidations];
  const refreshes = [...transaction.refreshes];
  const queryClient = transaction.queryClient;
  clearTransaction(transaction);
  queueMicrotask(() => {
    for (const target of invalidations) {
      try {
        if (isQueryResource(target)) target.invalidate();
        else queryClient?.invalidate(target);
      } catch {
        // The owner may have been disposed before the post-action invalidation phase.
      }
    }
    for (const tags of tagInvalidations) {
      try { queryClient?.invalidateTags(tags); } catch { /* The query client may already be disposed. */ }
    }
    for (const resource of refreshes) void resource.refetch().catch(() => undefined);
  });
}

function clearTransaction(transaction: ActionTransaction): void {
  transaction.rollbacks.length = 0;
  transaction.invalidations.length = 0;
  transaction.tagInvalidations.length = 0;
  transaction.refreshes.length = 0;
}

function isQueryResource(value: unknown): value is InvalidatableQueryResource {
  return Boolean(value && typeof value === 'object' && 'invalidate' in value && typeof (value as { invalidate?: unknown }).invalidate === 'function');
}
