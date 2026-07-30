export type RuntimeDevtoolsCategory =
  | 'component' | 'state' | 'derive' | 'effect' | 'query' | 'action' | 'cache'
  | 'route' | 'hydration' | 'island' | 'boundary' | 'performance' | 'memory'
  | 'hmr' | 'server-payload';

interface RuntimeDevtoolsBridge {
  emit(category: RuntimeDevtoolsCategory, type: 'register' | 'update' | 'remove' | 'measure' | 'error' | 'snapshot', id?: string, payload?: unknown): unknown;
}

const SYMBOL = Symbol.for('vx.devtools.bridge');

export function emitDevtoolsEvent(
  category: RuntimeDevtoolsCategory,
  type: 'register' | 'update' | 'remove' | 'measure' | 'error' | 'snapshot',
  id?: string,
  payload?: unknown
): void {
  const bridge = (globalThis as Record<PropertyKey, unknown>)[SYMBOL] as RuntimeDevtoolsBridge | undefined;
  if (!bridge || typeof bridge.emit !== 'function') return;
  bridge.emit(category, type, id, sanitize(payload));
}

export function devtoolsRegistration(category: Exclude<RuntimeDevtoolsCategory, 'performance' | 'memory' | 'hmr' | 'server-payload'>, id: string, payload: unknown): () => void {
  emitDevtoolsEvent(category, 'register', id, payload);
  return () => emitDevtoolsEvent(category, 'remove', id);
}

export function measureDevtools(name: string, value: number, unit: 'ms' | 'bytes' | 'count' | 'percent' = 'ms', metadata?: Readonly<Record<string, unknown>>): void {
  emitDevtoolsEvent(unit === 'bytes' ? 'memory' : 'performance', 'measure', undefined, { name, value, unit, ...(metadata ? { metadata } : {}) });
}

function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return '[truncated]';
  if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
  if (typeof Node !== 'undefined' && value instanceof Node) return `[${value.nodeName.toLowerCase()}]`;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitize(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) output[key] = /password|secret|token|cookie|authorization/i.test(key) ? '[redacted]' : sanitize(item, depth + 1);
  return output;
}
