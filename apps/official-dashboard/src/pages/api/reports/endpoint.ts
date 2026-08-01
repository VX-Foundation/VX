import { createRouteEndpointHandler, defineEndpoint } from '@vx-foundation/server';

const reportEndpoint = defineEndpoint(
  { id: 'dashboard.reports.create', methods: ['POST'], body: { maxBytes: 32_768 } },
  async ({ input }) => ({ accepted: true, input })
);

export const POST = createRouteEndpointHandler(reportEndpoint);
