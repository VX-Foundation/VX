import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createMemoryRateLimiter, createServerPlatform, createSessionManager } from '../../packages/server/dist/index.js';

const sessions = createSessionManager({ secret: 'phase-14-benchmark-secret-at-least-thirty-two-bytes', createData: () => ({}) });
const platform = createServerPlatform(() => new Response('ok'), {
  sessions,
  rateLimiter: createMemoryRateLimiter({ limit: 100_000, windowMs: 60_000 }),
  rateLimitKey: () => 'benchmark',
  security: { contentSecurityPolicy: false }
});
const iterations = 10_000;
const start = performance.now();
for (let index = 0; index < iterations; index++) {
  const response = await platform.handle(new Request('https://vx.benchmark/'));
  assert.equal(response.status, 200);
  await response.text();
}
const duration = performance.now() - start;
const perRequest = duration / iterations;
assert.ok(perRequest < 1.5, `Phase 14 server overhead regression: ${perRequest.toFixed(3)} ms/request.`);
console.log(`Phase 14 server benchmark passed: ${iterations} requests in ${duration.toFixed(2)} ms (${perRequest.toFixed(3)} ms/request).`);
