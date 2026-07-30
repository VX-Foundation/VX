import type { Awaitable, ServerRequestContext } from './types.js';

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  consume(key: string, cost?: number, now?: number): Awaitable<RateLimitDecision>;
}

export interface MemoryRateLimiterOptions {
  limit: number;
  windowMs: number;
  maxEntries?: number;
}

export function createMemoryRateLimiter(options: MemoryRateLimiterOptions): RateLimiter {
  if (!Number.isSafeInteger(options.limit) || options.limit <= 0) throw new TypeError('Rate limit must be a positive safe integer.');
  if (!Number.isSafeInteger(options.windowMs) || options.windowMs <= 0) throw new TypeError('Rate-limit window must be a positive safe integer.');
  const buckets = new Map<string, { count: number; resetAt: number }>();
  const maxEntries = options.maxEntries ?? 10_000;
  return {
    consume(key, cost = 1, now = Date.now()) {
      if (!key) throw new TypeError('Rate-limit keys cannot be empty.');
      if (!Number.isSafeInteger(cost) || cost <= 0) throw new TypeError('Rate-limit cost must be a positive safe integer.');
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + options.windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += cost;
      if (buckets.size > maxEntries) prune(buckets, now, maxEntries);
      const remaining = Math.max(0, options.limit - bucket.count);
      return {
        allowed: bucket.count <= options.limit,
        limit: options.limit,
        remaining,
        resetAt: bucket.resetAt,
        ...(bucket.count > options.limit ? { retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) } : {})
      };
    }
  };
}

export function rateLimitKeyFromRequest(context: ServerRequestContext): string {
  const forwarded = context.request.headers.get('x-forwarded-for')?.split(',', 1)[0]?.trim();
  return context.session?.principal?.id ?? forwarded ?? context.request.headers.get('x-real-ip') ?? 'anonymous';
}

function prune(buckets: Map<string, { count: number; resetAt: number }>, now: number, max: number): void {
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  while (buckets.size > max) buckets.delete(buckets.keys().next().value as string);
}
