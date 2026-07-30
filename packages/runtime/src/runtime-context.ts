import { QueryClient } from './query/client.js';
import { StoreRegistry } from './store/registry.js';
import type { HydrationRegistry } from './hydration.js';

export interface RuntimeContext {
  queryClient: QueryClient;
  stores: StoreRegistry;
  hydration?: HydrationRegistry;
  formStates?: Readonly<Record<string, unknown>>;
}

export interface RuntimeContextInput {
  queryClient?: QueryClient;
  stores?: StoreRegistry;
  hydration?: HydrationRegistry;
  formStates?: Readonly<Record<string, unknown>>;
}

export interface OwnedRuntimeContext extends RuntimeContext {
  dispose(): void;
}

export function createRuntimeContext(input: RuntimeContextInput = {}): OwnedRuntimeContext {
  const queryClient = input.queryClient ?? new QueryClient();
  const stores = input.stores ?? new StoreRegistry();
  const ownsQueryClient = input.queryClient === undefined;
  const ownsStores = input.stores === undefined;
  return {
    queryClient,
    stores,
    ...(input.hydration ? { hydration: input.hydration } : {}),
    ...(input.formStates ? { formStates: input.formStates } : {}),
    dispose() {
      if (ownsQueryClient) queryClient.dispose();
      if (ownsStores) stores.dispose();
    }
  };
}

export function createOwnerId(prefix = 'component'): string {
  return `${prefix}:${cryptoRandomId()}`;
}

function cryptoRandomId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
