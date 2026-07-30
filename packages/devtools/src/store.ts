import type { DevtoolsEntity, DevtoolsEvent, DevtoolsMetric, DevtoolsSnapshot } from './protocol.js';

export class DevtoolsStore {
  readonly #entities = new Map<string, DevtoolsEntity>();
  readonly #metrics: DevtoolsMetric[] = [];
  readonly #hmr: DevtoolsEvent[] = [];
  readonly #serverPayloads: DevtoolsEvent[] = [];
  #sequence = 0;

  constructor(readonly applicationId: string, readonly maxTimelineEntries = 2000) {
    if (!applicationId.trim()) throw new TypeError('VX DevTools requires an application id.');
  }

  apply(event: DevtoolsEvent): void {
    if (event.sequence <= this.#sequence) return;
    this.#sequence = event.sequence;
    if (event.category === 'performance' || event.category === 'memory') {
      const metric = asMetric(event.payload);
      if (metric) pushLimited(this.#metrics, metric, this.maxTimelineEntries);
      return;
    }
    if (event.category === 'hmr') { pushLimited(this.#hmr, event, this.maxTimelineEntries); return; }
    if (event.category === 'server-payload') { pushLimited(this.#serverPayloads, redactEvent(event), this.maxTimelineEntries); return; }
    if (!event.id) return;
    if (event.type === 'remove') { this.#entities.delete(event.id); return; }
    const entity = asEntity(event.payload);
    if (entity) this.#entities.set(event.id, freezeEntity(entity));
  }

  snapshot(): DevtoolsSnapshot {
    return Object.freeze({
      protocolVersion: 1,
      applicationId: this.applicationId,
      sequence: this.#sequence,
      entities: Object.freeze([...this.#entities.values()].sort((left, right) => left.createdAt - right.createdAt)),
      metrics: Object.freeze([...this.#metrics]),
      hmr: Object.freeze([...this.#hmr]),
      serverPayloads: Object.freeze([...this.#serverPayloads])
    });
  }

  clear(): void {
    this.#entities.clear();
    this.#metrics.length = 0;
    this.#hmr.length = 0;
    this.#serverPayloads.length = 0;
  }
}

function asEntity(value: unknown): DevtoolsEntity | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entity = value as Partial<DevtoolsEntity>;
  if (typeof entity.id !== 'string' || typeof entity.name !== 'string' || typeof entity.category !== 'string' || typeof entity.createdAt !== 'number' || typeof entity.updatedAt !== 'number') return undefined;
  return entity as DevtoolsEntity;
}
function asMetric(value: unknown): DevtoolsMetric | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const metric = value as Partial<DevtoolsMetric>;
  if (typeof metric.id !== 'string' || typeof metric.name !== 'string' || typeof metric.value !== 'number' || typeof metric.timestamp !== 'number') return undefined;
  return metric as DevtoolsMetric;
}
function freezeEntity(entity: DevtoolsEntity): DevtoolsEntity { return Object.freeze({ ...entity, ...(entity.metadata ? { metadata: Object.freeze({ ...entity.metadata }) } : {}) }); }
function pushLimited<T>(items: T[], value: T, limit: number): void { items.push(value); if (items.length > limit) items.splice(0, items.length - limit); }
function redactEvent(event: DevtoolsEvent): DevtoolsEvent {
  return { ...event, payload: redact(event.payload) };
}
function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redact(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) result[key] = /token|secret|password|authorization|cookie/i.test(key) ? '[redacted]' : redact(item, depth + 1);
  return result;
}
