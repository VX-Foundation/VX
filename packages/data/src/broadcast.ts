import type { QueryClient, QueryClientEvent } from '@vx/runtime';

export interface DataBroadcastChannel {
  postMessage(value: unknown): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  close(): void;
}

export interface QueryBroadcastOptions {
  channel?: DataBroadcastChannel;
  name?: string;
  instanceId?: string;
  includeData?: boolean;
}

interface BroadcastEnvelope {
  version: 1;
  source: string;
  type: 'set' | 'invalidate' | 'remove' | 'clear';
  key?: readonly unknown[];
  tags?: readonly string[];
  data?: unknown;
}

export function synchronizeQueryClient(client: QueryClient, options: QueryBroadcastOptions = {}): () => void {
  const channel = options.channel ?? createNativeChannel(options.name ?? 'vx:data');
  if (!channel) return () => undefined;
  const source = options.instanceId ?? randomId();
  let applying = false;

  const unsubscribe = client.subscribe((event) => {
    if (applying) return;
    const envelope = toEnvelope(event, source, options.includeData ?? true);
    if (envelope) channel.postMessage(envelope);
  });

  const onMessage = (event: MessageEvent): void => {
    const envelope = validateEnvelope(event.data);
    if (!envelope || envelope.source === source) return;
    applying = true;
    try {
      switch (envelope.type) {
        case 'set':
          if (envelope.key) client.setData(envelope.key, envelope.data, envelope.tags ? { tags: envelope.tags } : {});
          break;
        case 'invalidate':
          if (envelope.tags?.length) client.invalidateTags(envelope.tags);
          else if (envelope.key) client.invalidate(envelope.key);
          break;
        case 'remove':
          if (envelope.key) client.removeQueries({ key: envelope.key, exact: true });
          break;
        case 'clear':
          client.clear();
          break;
      }
    } finally {
      applying = false;
    }
  };
  channel.addEventListener('message', onMessage);
  return () => {
    unsubscribe();
    channel.removeEventListener('message', onMessage);
    channel.close();
  };
}

function toEnvelope(event: QueryClientEvent, source: string, includeData: boolean): BroadcastEnvelope | undefined {
  if (event.type === 'cleared') return { version: 1, source, type: 'clear' };
  if (!event.key) return undefined;
  if (event.type === 'removed') return { version: 1, source, type: 'remove', key: event.key };
  if (event.type === 'invalidated') return { version: 1, source, type: 'invalidate', key: event.key, ...(event.tags ? { tags: event.tags } : {}) };
  if ((event.type === 'added' || event.type === 'updated') && includeData && event.snapshot?.status === 'success') {
    return { version: 1, source, type: 'set', key: event.key, ...(event.tags ? { tags: event.tags } : {}), data: event.snapshot.data };
  }
  return undefined;
}

function validateEnvelope(value: unknown): BroadcastEnvelope | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const envelope = value as Partial<BroadcastEnvelope>;
  if (envelope.version !== 1 || typeof envelope.source !== 'string') return undefined;
  if (!['set', 'invalidate', 'remove', 'clear'].includes(envelope.type ?? '')) return undefined;
  return envelope as BroadcastEnvelope;
}

function createNativeChannel(name: string): DataBroadcastChannel | undefined {
  return typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel(name);
}

function randomId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
