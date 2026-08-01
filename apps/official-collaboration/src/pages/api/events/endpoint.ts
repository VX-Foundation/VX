import { applySecurityHeaders, createRouteEndpointHandler, defineEndpoint } from '@vx-foundation/server';

const endpoint = defineEndpoint(
  { id: 'collaboration.events', methods: ['POST'], body: { maxBytes: 131_072 } },
  async ({ input, context }) => {
    applySecurityHeaders(context.responseHeaders, { contentSecurityPolicy: true });
    return { accepted: true, version: Date.now(), input };
  }
);

export const POST = createRouteEndpointHandler(endpoint);
