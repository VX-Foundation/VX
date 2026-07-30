import { assertInteropBoundary } from './contracts.js';

export function assertBrowserModule(module: string, environment: 'universal' | 'browser' | 'client'): void {
  assertInteropBoundary('browser', environment, module);
}

export function browserApi<K extends keyof Window>(name: K): Window[K] {
  if (typeof window === 'undefined') throw new Error(`Browser API 'window.${String(name)}' is unavailable during server execution.`);
  return window[name];
}
