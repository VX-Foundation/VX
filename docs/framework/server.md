# Server Platform

`@vx-foundation/server` provides request context, cookies, signed sessions, authorization, middleware, endpoint contracts, body parsing, security headers, rate limiting, environment validation, tracing, and Node integration.

Keep server-only code behind public server entries and never import it from a client graph.

## Typed file-route endpoints

`defineEndpoint()` owns input limits, codecs, allowed methods, response serialization, and the handler contract. File-system endpoint modules receive a web `Request`, so expose a contract through the public bridge instead of exporting `endpoint.handle` directly:

```ts
import { createRouteEndpointHandler, defineEndpoint } from '@vx-foundation/server';

const createReport = defineEndpoint(
  { id: 'reports.create', methods: ['POST'], body: { maxBytes: 32_768 } },
  async ({ input, context, params }) => {
    context.responseHeaders.set('cache-control', 'no-store');
    return { accepted: true, reportId: params['reportId'] ?? null, input };
  }
);

export const POST = createRouteEndpointHandler(createReport);
```

The bridge reuses the router request runtime when available, propagates route parameters and locals, preserves cancellation, applies endpoint response headers, and disposes only runtimes it creates itself.
