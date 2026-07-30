export function createQueryKey(name: string, input: unknown): readonly unknown[] {
  return Object.freeze([name, input]);
}

export function hashQueryKey(key: readonly unknown[]): string {
  return stableSerialize(key);
}

export function stableSerialize(value: unknown): string {
  const seen = new Set<object>();

  const visit = (current: unknown): string => {
    if (current === null) return 'null';
    switch (typeof current) {
      case 'string':
        return JSON.stringify(current);
      case 'boolean':
        return current ? 'true' : 'false';
      case 'number':
        if (!Number.isFinite(current)) throw new TypeError('Query keys cannot contain non-finite numbers.');
        return Object.is(current, -0) ? '0' : String(current);
      case 'bigint':
        return `{"$bigint":${JSON.stringify(current.toString())}}`;
      case 'undefined':
        return '{"$undefined":true}';
      case 'function':
      case 'symbol':
        throw new TypeError(`Query keys cannot contain ${typeof current} values.`);
      case 'object':
        break;
      default:
        throw new TypeError('Unsupported query key value.');
    }

    if (seen.has(current)) throw new TypeError('Query keys cannot contain circular references.');
    seen.add(current);
    try {
      if (Array.isArray(current)) return `[${current.map(visit).join(',')}]`;
      if (current instanceof Date) return `{"$date":${JSON.stringify(current.toISOString())}}`;
      if (current instanceof URL) return `{"$url":${JSON.stringify(current.href)}}`;
      const prototype = Object.getPrototypeOf(current) as object | null;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError('Query keys must contain plain objects, arrays, dates, URLs, and scalar values only.');
      }
      const record = current as Record<string, unknown>;
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${visit(record[key])}`).join(',')}}`;
    } finally {
      seen.delete(current);
    }
  };

  return visit(value);
}
