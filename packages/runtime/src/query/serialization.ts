import { hashQueryKey } from './key.js';
import type { QueryClient } from './client.js';
import type { DehydratedQuery, DehydratedQueryState } from './types.js';

export interface QueryDehydrateOptions {
  persistOnly?: boolean;
  predicate?: (entry: DehydratedQuery) => boolean;
  buster?: string;
}

interface TaggedValue {
  $vx: 'undefined' | 'bigint' | 'date' | 'url' | 'map' | 'set' | 'object';
  value?: unknown;
}

export function dehydrateQueryClient(client: QueryClient, options: QueryDehydrateOptions = {}): DehydratedQueryState {
  const queries = client.dehydrate(options).map((query) => ({
    ...query,
    key: encodeSerializable(query.key) as readonly unknown[],
    data: encodeSerializable(query.data)
  }));
  return {
    version: 1,
    queries,
    timestamp: Date.now(),
    ...(options.buster ? { buster: options.buster } : {})
  };
}

export function hydrateQueryClient(client: QueryClient, state: DehydratedQueryState): void {
  if (state.version !== 1 || !Array.isArray(state.queries)) throw new TypeError('Unsupported VX query hydration payload.');
  const queries: DehydratedQuery[] = state.queries.map((query) => {
    const key = decodeSerializable(query.key);
    if (!Array.isArray(key)) throw new TypeError('Query hydration keys must decode to arrays.');
    if (hashQueryKey(key) !== query.hash) throw new TypeError('Query hydration key hash does not match its payload.');
    return { ...query, key, data: decodeSerializable(query.data) };
  });
  client.hydrate(queries);
}

export function serializeQueryState(state: DehydratedQueryState): string {
  return JSON.stringify(state).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function encodeSerializable(value: unknown): unknown {
  return transform(value, 'encode');
}

function decodeSerializable(value: unknown): unknown {
  return transform(value, 'decode');
}

function transform(value: unknown, mode: 'encode' | 'decode'): unknown {
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (current: unknown, depth: number): unknown => {
    nodes += 1;
    if (nodes > 100_000) throw new TypeError('Query hydration data exceeds the supported node limit.');
    if (depth > 100) throw new TypeError('Query hydration data exceeds the supported nesting depth.');
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current;
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new TypeError('Query hydration data cannot contain non-finite numbers.');
      return current;
    }
    if (mode === 'encode') {
      if (typeof current === 'bigint') return { $vx: 'bigint', value: current.toString() } satisfies TaggedValue;
      if (typeof current === 'undefined') return { $vx: 'undefined' } satisfies TaggedValue;
      if (typeof current !== 'object') throw new TypeError(`Query hydration data cannot contain ${typeof current} values.`);
      if (seen.has(current)) throw new TypeError('Query hydration data cannot contain circular references.');
      seen.add(current);
      try {
        if (Array.isArray(current)) return current.map((item) => visit(item, depth + 1));
        if (current instanceof Date) return { $vx: 'date', value: current.toISOString() } satisfies TaggedValue;
        if (current instanceof URL) return { $vx: 'url', value: current.href } satisfies TaggedValue;
        if (current instanceof Map) return { $vx: 'map', value: [...current.entries()].map(([key, item]) => [visit(key, depth + 1), visit(item, depth + 1)]) } satisfies TaggedValue;
        if (current instanceof Set) return { $vx: 'set', value: [...current].map((item) => visit(item, depth + 1)) } satisfies TaggedValue;
        const prototype = Object.getPrototypeOf(current) as object | null;
        if (prototype !== Object.prototype && prototype !== null) throw new TypeError('Query hydration data must use supported structured values.');
        const entries: Array<[string, unknown]> = [];
        for (const [key, item] of Object.entries(current)) {
          assertSafeKey(key);
          entries.push([key, visit(item, depth + 1)]);
        }
        return { $vx: 'object', value: entries } satisfies TaggedValue;
      } finally {
        seen.delete(current);
      }
    }

    if (typeof current === 'bigint' || typeof current === 'undefined') return current;
    if (typeof current !== 'object') throw new TypeError(`Query hydration payload cannot contain ${typeof current} values.`);
    if (seen.has(current)) throw new TypeError('Query hydration payload cannot contain circular references.');
    seen.add(current);
    try {
      if (Array.isArray(current)) return current.map((item) => visit(item, depth + 1));
      const record = current as Record<string, unknown>;
      if (typeof record['$vx'] === 'string') {
        switch (record['$vx']) {
          case 'undefined': return undefined;
          case 'bigint': return BigInt(assertString(record['value'], 'bigint'));
          case 'date': return new Date(assertString(record['value'], 'date'));
          case 'url': return new URL(assertString(record['value'], 'url'));
          case 'map': return new Map(assertPairs(record['value']).map(([key, item]) => [visit(key, depth + 1), visit(item, depth + 1)]));
          case 'set': return new Set(assertArray(record['value'], 'set').map((item) => visit(item, depth + 1)));
          case 'object': {
            const output: Record<string, unknown> = {};
            for (const [key, item] of assertEntries(record['value'])) {
              assertSafeKey(key);
              output[key] = visit(item, depth + 1);
            }
            return output;
          }
          default: throw new TypeError(`Unknown VX query hydration tag '${record['$vx']}'.`);
        }
      }
      // Backward-compatible plain JSON payloads from earlier Phase 13 snapshots.
      const output: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(record)) {
        assertSafeKey(key);
        output[key] = visit(item, depth + 1);
      }
      return output;
    } finally {
      seen.delete(current);
    }
  };
  return visit(value, 0);
}

function assertSafeKey(key: string): void {
  if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
    throw new TypeError(`Query hydration data contains forbidden key '${key}'.`);
  }
}

function assertString(value: unknown, tag: string): string {
  if (typeof value !== 'string') throw new TypeError(`VX query hydration tag '${tag}' requires a string value.`);
  return value;
}

function assertArray(value: unknown, tag: string): unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`VX query hydration tag '${tag}' requires an array value.`);
  return value;
}

function assertPairs(value: unknown): Array<[unknown, unknown]> {
  return assertArray(value, 'map').map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2) throw new TypeError('VX query hydration map entries must contain two values.');
    return [entry[0], entry[1]];
  });
}

function assertEntries(value: unknown): Array<[string, unknown]> {
  return assertArray(value, 'object').map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw new TypeError('VX query hydration object entries must contain a string key and value.');
    }
    return [entry[0], entry[1]];
  });
}
