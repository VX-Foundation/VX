import { createAction, state } from '@vx-foundation/runtime';
import { OfflineMutationQueue, createMemoryPersistenceAdapter } from '@vx-foundation/data';

export interface CartLine { productId: string; quantity: number; unitPrice: number; }
export const cartLines = state<readonly CartLine[]>([]);
export const cartQueue = new OfflineMutationQueue({
  adapter: createMemoryPersistenceAdapter(),
  execute: async (mutation) => ({ idempotencyKey: mutation.idempotencyKey })
});

export const updateCart = createAction(async (context, line: CartLine) => {
  context.commit(() => {
    const remaining = cartLines.value.filter((candidate) => candidate.productId !== line.productId);
    cartLines.value = line.quantity > 0 ? [...remaining, line] : remaining;
  });
  return line;
}, {
  name: 'commerce.cart.update',
  networkMode: 'offline-first',
  queue: cartQueue,
  idempotencyKey: ([line]) => `cart:${line.productId}:${line.quantity}`
});
