import type { StoreRegistry } from './registry.js';
import type { StoreDefinition, StoreLease, StoreLifetime } from './types.js';

export { StoreRegistry } from './registry.js';
export type {
  StoreLifetime,
  StoreFactoryContext,
  StoreDefinition,
  StoreRegistryOptions,
  StoreLease
} from './types.js';

export function defineStore<TStore>(definition: StoreDefinition<TStore>): StoreDefinition<TStore> {
  return Object.freeze({ ...definition });
}

export function acquireStore<TStore>(
  registry: StoreRegistry,
  key: string,
  lifetime: StoreLifetime,
  ownerId: string
): StoreLease<TStore> {
  return registry.acquire<TStore>(key, lifetime, ownerId);
}
