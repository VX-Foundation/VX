import { AsyncLocalStorage } from 'node:async_hooks';
import type { ServerRequestContext } from './types.js';

const storage = new AsyncLocalStorage<ServerRequestContext>();

export function runWithServerContext<T>(context: ServerRequestContext, operation: () => T): T {
  return storage.run(context, operation);
}

export function currentServerContext(): ServerRequestContext {
  const context = storage.getStore();
  if (!context) throw new Error('No active VX server platform context.');
  return context;
}

export function optionalServerContext(): ServerRequestContext | undefined { return storage.getStore(); }
