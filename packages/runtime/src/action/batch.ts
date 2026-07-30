import { normalizeActionError } from './error.js';
import type { ActionBatchResult } from './types.js';

export async function runActionBatch<T>(
  operations: readonly (() => T | Promise<T>)[],
  options: { stopOnError?: boolean; concurrency?: number } = {}
): Promise<ActionBatchResult<T>> {
  const values: Array<T | undefined> = Array.from({ length: operations.length }, () => undefined);
  const errors: ActionBatchResult<T>['errors'] = Array.from({ length: operations.length }, () => undefined);
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? (operations.length || 1)));
  let cursor = 0;
  let stopped = false;

  const worker = async (): Promise<void> => {
    while (!stopped) {
      const index = cursor++;
      if (index >= operations.length) return;
      try {
        values[index] = await operations[index]!();
      } catch (error) {
        errors[index] = normalizeActionError(error);
        if (options.stopOnError) stopped = true;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, operations.length) }, worker));
  const failureCount = errors.filter(Boolean).length;
  return {
    status: failureCount === 0 ? 'success' : failureCount === operations.length ? 'error' : 'partial',
    values,
    errors
  };
}
