import type { DevtoolsEntity, DevtoolsEvent, DevtoolsMetric, DevtoolsSnapshot, DevtoolsTransport } from './protocol.js';
import { DevtoolsStore } from './store.js';

export const VX_DEVTOOLS_SYMBOL = Symbol.for('vx.devtools.bridge');

export interface DevtoolsBridge {
  readonly applicationId: string;
  emit(category: DevtoolsEvent['category'], type: DevtoolsEvent['type'], id?: string, payload?: unknown): DevtoolsEvent;
  register(entity: Omit<DevtoolsEntity, 'createdAt' | 'updatedAt'>): () => void;
  update(id: string, category: DevtoolsEntity['category'], patch: Partial<DevtoolsEntity>): void;
  measure(metric: Omit<DevtoolsMetric, 'id' | 'timestamp'> & { id?: string }): void;
  snapshot(): DevtoolsSnapshot;
  subscribe(listener: (event: DevtoolsEvent) => void): () => void;
}

export function createDevtoolsBridge(applicationId: string, transport?: DevtoolsTransport): DevtoolsBridge {
  const store = new DevtoolsStore(applicationId);
  const listeners = new Set<(event: DevtoolsEvent) => void>();
  let sequence = 0;
  const publish = (event: DevtoolsEvent): void => {
    store.apply(event);
    transport?.send(event);
    for (const listener of [...listeners]) listener(event);
  };
  const bridge: DevtoolsBridge = {
    applicationId,
    emit(category, type, id, payload) {
      const event: DevtoolsEvent = { sequence: ++sequence, timestamp: Date.now(), category, type, ...(id ? { id } : {}), ...(payload !== undefined ? { payload } : {}) };
      publish(event);
      return event;
    },
    register(input) {
      const now = Date.now();
      const entity: DevtoolsEntity = { ...input, createdAt: now, updatedAt: now };
      bridge.emit(entity.category, 'register', entity.id, entity);
      return () => bridge.emit(entity.category, 'remove', entity.id);
    },
    update(id, category, patch) {
      const current = store.snapshot().entities.find((entity) => entity.id === id);
      if (!current) return;
      bridge.emit(category, 'update', id, { ...current, ...patch, id, category, updatedAt: Date.now() });
    },
    measure(metric) {
      bridge.emit(metric.category, 'measure', metric.id, { ...metric, id: metric.id ?? `${metric.category}:${metric.name}:${sequence + 1}`, timestamp: Date.now() });
    },
    snapshot: () => store.snapshot(),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
  transport?.subscribe((event) => { if (event.sequence > sequence) { sequence = event.sequence; store.apply(event); for (const listener of [...listeners]) listener(event); } });
  return bridge;
}

export function installGlobalDevtoolsBridge(bridge: DevtoolsBridge, target: object = globalThis): () => void {
  const record = target as Record<PropertyKey, unknown>;
  const previous = record[VX_DEVTOOLS_SYMBOL];
  Object.defineProperty(record, VX_DEVTOOLS_SYMBOL, { value: bridge, configurable: true, enumerable: false });
  return () => {
    if (previous === undefined) delete record[VX_DEVTOOLS_SYMBOL];
    else Object.defineProperty(record, VX_DEVTOOLS_SYMBOL, { value: previous, configurable: true, enumerable: false });
  };
}

export function getGlobalDevtoolsBridge(target: object = globalThis): DevtoolsBridge | undefined {
  const value = (target as Record<PropertyKey, unknown>)[VX_DEVTOOLS_SYMBOL];
  return value && typeof value === 'object' && 'emit' in value ? value as DevtoolsBridge : undefined;
}
