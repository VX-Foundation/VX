import type { QueryClient } from './client.js';

interface BrowserEventEntry {
  references: number;
  dispose(): void;
}

const entries = new WeakMap<QueryClient, BrowserEventEntry>();

export function attachQueryBrowserEvents(client: QueryClient): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => undefined;
  const existing = entries.get(client);
  if (existing) {
    existing.references += 1;
    return () => release(client, existing);
  }

  const onFocus = (): void => {
    if (document.visibilityState === 'visible') client.refreshOnFocus();
  };
  const onOnline = (): void => client.setOnline(true);
  const onOffline = (): void => client.setOnline(false);
  document.addEventListener('visibilitychange', onFocus);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  const entry: BrowserEventEntry = {
    references: 1,
    dispose() {
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    }
  };
  entries.set(client, entry);
  return () => release(client, entry);
}

function release(client: QueryClient, entry: BrowserEventEntry): void {
  entry.references = Math.max(0, entry.references - 1);
  if (entry.references > 0) return;
  entry.dispose();
  entries.delete(client);
}
