import type { QueryPolicy } from './types.js';

export const DEFAULT_QUERY_POLICY: QueryPolicy = Object.freeze({
  staleTimeMs: 0,
  retentionTimeMs: 5 * 60_000,
  retries: 2,
  retryDelayMs: 250,
  retryBackoff: 'exponential',
  execution: 'universal',
  networkMode: 'online',
  deduplicate: true,
  refreshOnFocus: false,
  refreshOnReconnect: true,
  refetchIntervalMs: 0,
  structuralSharing: true,
  persist: false
});

export function resolveQueryPolicy(policy: Partial<QueryPolicy> | undefined): QueryPolicy {
  return {
    ...DEFAULT_QUERY_POLICY,
    ...policy,
    staleTimeMs: nonNegative(policy?.staleTimeMs, DEFAULT_QUERY_POLICY.staleTimeMs),
    retentionTimeMs: nonNegative(policy?.retentionTimeMs, DEFAULT_QUERY_POLICY.retentionTimeMs),
    retries: Math.floor(nonNegative(policy?.retries, DEFAULT_QUERY_POLICY.retries)),
    retryDelayMs: nonNegative(policy?.retryDelayMs, DEFAULT_QUERY_POLICY.retryDelayMs),
    refetchIntervalMs: nonNegative(policy?.refetchIntervalMs, DEFAULT_QUERY_POLICY.refetchIntervalMs)
  };
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}
