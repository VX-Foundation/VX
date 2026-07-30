import type { QueryError, QueryPolicy } from './types.js';

export function shouldRetry(error: QueryError, attempt: number, policy: QueryPolicy): boolean {
  return error.retryable && attempt <= policy.retries;
}

export function retryDelay(attempt: number, policy: QueryPolicy): number {
  if (policy.retryBackoff === 'fixed') return policy.retryDelayMs;
  return Math.min(policy.retryDelayMs * 2 ** Math.max(0, attempt - 1), 30_000);
}

export async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    const abort = (): void => {
      clearTimeout(timer);
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
