const TAG = '$vx';
const VALUE = 'value';
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export interface SerializedEnvelope {
  version: 1;
  value: unknown;
}

export interface ServerSerializationLimits {
  maxDepth: number;
  maxNodes: number;
  maxSourceBytes: number;
  maxStringBytes: number;
}

export const DEFAULT_SERVER_SERIALIZATION_LIMITS: Readonly<ServerSerializationLimits> = Object.freeze({
  maxDepth: 100,
  maxNodes: 100_000,
  maxSourceBytes: 8 * 1024 * 1024,
  maxStringBytes: 4 * 1024 * 1024
});

interface TraversalState {
  nodes: number;
  limits: ServerSerializationLimits;
}

/** Serializes request and hydration state without producing executable script text. */
export function serializeServerValue(value: unknown, limits: Partial<ServerSerializationLimits> = {}): string {
  const state = createTraversalState(limits);
  const envelope: SerializedEnvelope = { version: 1, value: encode(value, new Set(), 0, state) };
  const source = escapeScriptJson(JSON.stringify(envelope));
  assertByteLength(source, state.limits.maxSourceBytes, 'VX server serialization output');
  return source;
}

/** Parses only payloads created by serializeServerValue and rebuilds safe objects. */
export function deserializeServerValue(source: string, limits: Partial<ServerSerializationLimits> = {}): unknown {
  const state = createTraversalState(limits);
  assertByteLength(source, state.limits.maxSourceBytes, 'VX server serialization payload');
  const parsed: unknown = JSON.parse(source);
  if (!isRecord(parsed) || parsed['version'] !== 1 || !('value' in parsed)) {
    throw new TypeError('Unsupported VX server serialization payload.');
  }
  return decode(parsed['value'], 0, state);
}

export function escapeScriptJson(source: string): string {
  return source
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function encode(value: unknown, seen: Set<object>, depth: number, state: TraversalState): unknown {
  visit(depth, state);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') { assertByteLength(value, state.limits.maxStringBytes, 'VX server string'); return value; }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('VX server state cannot contain non-finite numbers.');
    return value;
  }
  if (typeof value === 'undefined') return { [TAG]: 'undefined' };
  if (typeof value === 'bigint') return { [TAG]: 'bigint', [VALUE]: value.toString(10) };
  if (typeof value === 'symbol' || typeof value === 'function') {
    throw new TypeError(`VX server state cannot contain ${typeof value} values.`);
  }
  if (seen.has(value)) throw new TypeError('VX server state cannot contain circular references.');
  seen.add(value);
  try {
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) throw new TypeError('VX server state cannot contain invalid dates.');
      return { [TAG]: 'date', [VALUE]: value.toISOString() };
    }
    if (value instanceof URL) return { [TAG]: 'url', [VALUE]: value.href };
    if (Array.isArray(value)) return value.map((item) => encode(item, seen, depth + 1, state));
    if (value instanceof Map) {
      return { [TAG]: 'map', [VALUE]: [...value].map(([key, item]) => [encode(key, seen, depth + 1, state), encode(item, seen, depth + 1, state)]) };
    }
    if (value instanceof Set) return { [TAG]: 'set', [VALUE]: [...value].map((item) => encode(item, seen, depth + 1, state)) };

    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('VX server state must use plain objects or supported built-in values.');
    }
    const output = Object.create(null) as Record<string, unknown>;
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new TypeError(`VX server state contains forbidden key '${key}'.`);
      assertByteLength(key, state.limits.maxStringBytes, 'VX server object key');
      output[key] = encode(item, seen, depth + 1, state);
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

function decode(value: unknown, depth: number, state: TraversalState): unknown {
  visit(depth, state);
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') { assertByteLength(value, state.limits.maxStringBytes, 'VX serialized string'); return value; }
  if (Array.isArray(value)) return value.map((item) => decode(item, depth + 1, state));
  if (!isRecord(value)) throw new TypeError('Invalid VX serialized value.');
  const tag = value[TAG];
  if (tag !== undefined) {
    if (typeof tag !== 'string') throw new TypeError('Invalid VX serialization tag.');
    const keys = Object.keys(value);
    if (keys.some((key) => key !== TAG && key !== VALUE)) throw new TypeError('Invalid VX tagged value shape.');
    const taggedValue = value[VALUE];
    switch (tag) {
      case 'undefined': return undefined;
      case 'bigint': return BigInt(expectString(taggedValue, tag, state));
      case 'date': {
        const source = expectString(taggedValue, tag, state);
        const date = new Date(source);
        if (Number.isNaN(date.getTime()) || date.toISOString() !== source) throw new TypeError('Invalid VX date payload.');
        return date;
      }
      case 'url': return new URL(expectString(taggedValue, tag, state));
      case 'map': {
        if (!Array.isArray(taggedValue)) throw new TypeError('Invalid VX map payload.');
        return new Map(taggedValue.map((entry) => {
          if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError('Invalid VX map entry.');
          return [decode(entry[0], depth + 1, state), decode(entry[1], depth + 1, state)];
        }));
      }
      case 'set': {
        if (!Array.isArray(taggedValue)) throw new TypeError('Invalid VX set payload.');
        return new Set(taggedValue.map((item) => decode(item, depth + 1, state)));
      }
      default: throw new TypeError(`Unknown VX serialization tag '${tag}'.`);
    }
  }

  const output = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new TypeError(`VX serialized state contains forbidden key '${key}'.`);
    assertByteLength(key, state.limits.maxStringBytes, 'VX serialized object key');
    output[key] = decode(item, depth + 1, state);
  }
  return output;
}

function createTraversalState(input: Partial<ServerSerializationLimits>): TraversalState {
  const limits: ServerSerializationLimits = { ...DEFAULT_SERVER_SERIALIZATION_LIMITS, ...input };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`VX serialization limit '${name}' must be a positive safe integer.`);
  }
  return { nodes: 0, limits };
}

function visit(depth: number, state: TraversalState): void {
  if (depth > state.limits.maxDepth) throw new RangeError(`VX server state exceeds the maximum depth of ${state.limits.maxDepth}.`);
  state.nodes += 1;
  if (state.nodes > state.limits.maxNodes) throw new RangeError(`VX server state exceeds the maximum node count of ${state.limits.maxNodes}.`);
}

function assertByteLength(value: string, maximum: number, label: string): void {
  if (new TextEncoder().encode(value).byteLength > maximum) throw new RangeError(`${label} exceeds the ${maximum}-byte safety limit.`);
}

function expectString(value: unknown, tag: string, state: TraversalState): string {
  if (typeof value !== 'string') throw new TypeError(`Invalid VX '${tag}' payload.`);
  assertByteLength(value, state.limits.maxStringBytes, `VX '${tag}' payload`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
