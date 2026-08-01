import { createRouteEndpointHandler, defineEndpoint } from '@vx-foundation/server';

const updateSettings = defineEndpoint(
  { id: 'dashboard.settings.update', methods: ['POST'], body: { maxBytes: 32_768, maxFields: 16 } },
  async ({ input, context }) => {
    context.responseHeaders.set('cache-control', 'no-store');
    return { saved: true, input };
  }
);

export const POST = createRouteEndpointHandler(updateSettings);
