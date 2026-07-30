export type StoreLifetime = 'component' | 'tree' | 'route' | 'session' | 'application' | 'request' | 'manual';

export interface StoreFactoryContext {
  readonly lifetime: StoreLifetime;
  readonly scopeId: string;
  readonly signal: AbortSignal;
}

export interface StoreDefinition<TStore> {
  key: string;
  lifetime: StoreLifetime;
  create(context: StoreFactoryContext): TStore;
  dispose?: (store: TStore) => void;
}

export interface StoreRegistryOptions {
  applicationId?: string;
  sessionId?: string;
  routeId?: string;
  requestId?: string;
}

export interface StoreLease<TStore> {
  readonly value: TStore;
  release(): void;
}
