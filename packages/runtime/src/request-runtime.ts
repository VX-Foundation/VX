import { QueryClient } from './query/client.js';
import { StoreRegistry } from './store/registry.js';

export interface RequestRuntimeOptions {
  requestId: string;
  applicationId?: string;
  sessionId?: string;
  routeId?: string;
}

export interface RequestRuntime {
  readonly requestId: string;
  readonly applicationId?: string;
  readonly sessionId?: string;
  readonly routeId?: string;
  queryClient: QueryClient;
  stores: StoreRegistry;
  dispose(): void;
}

export function createRequestRuntime(options: RequestRuntimeOptions): RequestRuntime {
  if (!options.requestId) throw new TypeError('A request-scoped VX runtime requires a request id.');
  const queryClient = new QueryClient();
  const stores = new StoreRegistry({
    requestId: options.requestId,
    ...(options.applicationId ? { applicationId: options.applicationId } : {}),
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    ...(options.routeId ? { routeId: options.routeId } : {})
  });
  let active = true;

  return {
    requestId: options.requestId,
    ...(options.applicationId ? { applicationId: options.applicationId } : {}),
    ...(options.sessionId ? { sessionId: options.sessionId } : {}),
    ...(options.routeId ? { routeId: options.routeId } : {}),
    queryClient,
    stores,
    dispose() {
      if (!active) return;
      active = false;
      const errors: unknown[] = [];
      try { stores.dispose(); } catch (error) { errors.push(error); }
      try { queryClient.dispose(); } catch (error) { errors.push(error); }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'Failed to dispose the VX request runtime.');
    }
  };
}
