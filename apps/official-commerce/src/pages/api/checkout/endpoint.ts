import { createRouteEndpointHandler, defineEndpoint } from '@vx-foundation/server';

const checkout = defineEndpoint(
  { id: 'commerce.checkout', methods: ['POST'], body: { maxBytes: 65_536 } },
  async ({ input }) => ({ orderId: 'ord_demo', accepted: true, input })
);

export const POST = createRouteEndpointHandler(checkout);
