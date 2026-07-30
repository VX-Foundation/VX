import { setPath } from './path.js';

export interface DecodeFormDataOptions {
  maxFields?: number;
  maxDepth?: number;
  maxFieldBytes?: number;
  preserveEmptyStrings?: boolean;
}

export function decodeFormData(data: FormData | URLSearchParams, options: DecodeFormDataOptions = {}): Record<string, unknown> {
  const maxFields = options.maxFields ?? 1000;
  const maxDepth = options.maxDepth ?? 32;
  const maxFieldBytes = options.maxFieldBytes ?? 1024 * 1024;
  let count = 0;
  let output: Record<string, unknown> = {};

  for (const [rawName, rawValue] of data.entries()) {
    count += 1;
    if (count > maxFields) throw new RangeError(`Form contains more than ${maxFields} fields.`);
    const name = normalizeName(rawName);
    const depth = name.split('.').length;
    if (depth > maxDepth) throw new RangeError(`Form field '${rawName}' exceeds maximum nesting depth ${maxDepth}.`);
    if (typeof rawValue === 'string' && new TextEncoder().encode(rawValue).byteLength > maxFieldBytes) {
      throw new RangeError(`Form field '${rawName}' exceeds maximum size ${maxFieldBytes} bytes.`);
    }
    if (typeof rawValue === 'string' && rawValue === '' && options.preserveEmptyStrings === false) continue;
    const existing = readPath(output, name);
    if (existing === undefined) output = setPath(output, name, rawValue);
    else if (Array.isArray(existing)) output = setPath(output, name, [...existing, rawValue]);
    else output = setPath(output, name, [existing, rawValue]);
  }
  return output;
}

export function encodeFormData(value: unknown, data = new FormData(), prefix = ''): FormData {
  if (value === undefined || value === null) return data;
  if (isBlob(value)) {
    data.append(prefix, value);
    return data;
  }
  if (Array.isArray(value)) {
    for (const entry of value) encodeFormData(entry, data, prefix);
    return data;
  }
  if (value instanceof Date) {
    data.append(prefix, value.toISOString());
    return data;
  }
  if (typeof value === 'object') {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) encodeFormData(entry, data, prefix ? `${prefix}.${key}` : key);
    return data;
  }
  data.append(prefix, String(value));
  return data;
}

function normalizeName(name: string): string {
  return name.replace(/\[([^\]]*)\]/g, (_match, segment: string) => segment ? `.${segment}` : '').replace(/^\./, '');
}
function readPath(root: Record<string, unknown>, path: string): unknown { let current: unknown = root; for (const segment of path.split('.')) { if (!current || typeof current !== 'object') return undefined; current = (current as Record<string, unknown>)[segment]; } return current; }
function isBlob(value: unknown): value is Blob { return typeof Blob !== 'undefined' && value instanceof Blob; }
