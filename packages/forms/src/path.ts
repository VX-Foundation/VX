import type { FormPath } from './types.js';

const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function parsePath(path: FormPath): string[] {
  if (!path) return [];
  const normalized = path.replace(/\[(\d+)\]/g, '.$1').replace(/^\./, '');
  const segments = normalized.split('.').filter(Boolean);
  for (const segment of segments) {
    if (FORBIDDEN_SEGMENTS.has(segment)) throw new TypeError(`Unsafe form path segment '${segment}'.`);
  }
  return segments;
}

export function getPath(root: unknown, path: FormPath): unknown {
  let current = root;
  for (const segment of parsePath(path)) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function setPath<T>(root: T, path: FormPath, value: unknown): T {
  const segments = parsePath(path);
  if (segments.length === 0) return value as T;
  const clone = cloneContainer(root);
  let current: Record<string, unknown> | unknown[] = clone as Record<string, unknown> | unknown[];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const last = index === segments.length - 1;
    if (last) {
      (current as Record<string, unknown>)[segment] = value;
      break;
    }
    const nextSegment = segments[index + 1]!;
    const existing = (current as Record<string, unknown>)[segment];
    const next = existing && typeof existing === 'object'
      ? cloneContainer(existing)
      : /^\d+$/.test(nextSegment) ? [] : {};
    (current as Record<string, unknown>)[segment] = next;
    current = next as Record<string, unknown> | unknown[];
  }
  return clone;
}

export function deletePath<T>(root: T, path: FormPath): T {
  const segments = parsePath(path);
  if (segments.length === 0) return root;
  const clone = cloneContainer(root);
  let current: Record<string, unknown> = clone as Record<string, unknown>;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const existing = current[segment];
    if (!existing || typeof existing !== 'object') return clone;
    const next = cloneContainer(existing) as Record<string, unknown>;
    current[segment] = next;
    current = next;
  }
  const last = segments.at(-1)!;
  if (Array.isArray(current)) current.splice(Number(last), 1);
  else delete current[last];
  return clone;
}

export function cloneValue<T>(value: T): T {
  if (typeof structuredClone === 'function') return structuredClone(value);
  if (Array.isArray(value)) return value.map(cloneValue) as T;
  if (value && typeof value === 'object') {
    const clone = Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype) as Record<string, unknown>;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) clone[key] = cloneValue(entry);
    return clone as T;
  }
  return value;
}

function cloneContainer<T>(value: T): T {
  if (Array.isArray(value)) return value.slice() as T;
  if (value && typeof value === 'object') return { ...(value as Record<string, unknown>) } as T;
  return {} as T;
}
