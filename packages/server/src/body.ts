export interface BodyLimits {
  maxBytes?: number;
  maxFields?: number;
  maxDepth?: number;
}

export type ParsedRequestBody =
  | { type: 'empty'; value: undefined }
  | { type: 'json'; value: unknown }
  | { type: 'text'; value: string }
  | { type: 'urlencoded'; value: URLSearchParams }
  | { type: 'multipart'; value: FormData }
  | { type: 'binary'; value: Uint8Array };

export async function parseRequestBody(request: Request, limits: BodyLimits = {}): Promise<ParsedRequestBody> {
  const maxBytes = normalizeLimit(limits.maxBytes, 1024 * 1024);
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBytes) throw new RangeError('Request body exceeds the configured size limit.');
  if (!request.body) return { type: 'empty', value: undefined };
  const rawContentType = request.headers.get('content-type') ?? 'application/octet-stream';
  const contentType = rawContentType.split(';', 1)[0]?.trim().toLowerCase() ?? 'application/octet-stream';
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new RangeError('Request body exceeds the configured size limit.');
  if (bytes.byteLength === 0) return { type: 'empty', value: undefined };
  if (contentType === 'multipart/form-data') {
    const bounded = new Request(request.url, { method: 'POST', headers: { 'content-type': rawContentType }, body: bytes });
    const form = await bounded.formData();
    enforceFieldLimit(form, normalizeLimit(limits.maxFields, 1024));
    return { type: 'multipart', value: form };
  }
  if (contentType === 'application/json' || contentType.endsWith('+json')) {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    assertSafeStructure(value, 0, { nodes: 0, maxDepth: normalizeLimit(limits.maxDepth, 64), maxNodes: 20_000 });
    return { type: 'json', value };
  }
  if (contentType === 'application/x-www-form-urlencoded') {
    const value = new URLSearchParams(new TextDecoder().decode(bytes));
    if ([...value].length > normalizeLimit(limits.maxFields, 1024)) throw new RangeError('Request body contains too many fields.');
    return { type: 'urlencoded', value };
  }
  if (contentType.startsWith('text/')) return { type: 'text', value: new TextDecoder().decode(bytes) };
  return { type: 'binary', value: bytes };
}

function enforceFieldLimit(form: FormData, limit: number): void {
  let count = 0;
  for (const _entry of form) if (++count > limit) throw new RangeError('Request body contains too many fields.');
}

function assertSafeStructure(value: unknown, depth: number, state: { nodes: number; maxDepth: number; maxNodes: number }): void {
  if (++state.nodes > state.maxNodes) throw new RangeError('JSON body contains too many values.');
  if (depth > state.maxDepth) throw new RangeError('JSON body exceeds the nesting limit.');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const item of value) assertSafeStructure(item, depth + 1, state); return; }
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw new TypeError(`Unsafe JSON key '${key}'.`);
    assertSafeStructure(item, depth + 1, state);
  }
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('Request body limits must be positive safe integers.');
  return value;
}
