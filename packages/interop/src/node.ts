import { assertInteropBoundary } from './contracts.js';

export function assertNodeModule(module: string, environment: 'universal' | 'node' | 'server'): void {
  assertInteropBoundary('node', environment, module);
}

export async function importNodeModule<T = unknown>(specifier: string): Promise<T> {
  if (!specifier.startsWith('node:')) throw new Error(`Node interoperability requires a 'node:' specifier, received '${specifier}'.`);
  return import(specifier) as Promise<T>;
}
