export interface JsonResponseOptions extends ResponseInit {
  replacer?: (key: string, value: unknown) => unknown;
}

export function json(value: unknown, options: JsonResponseOptions = {}): Response {
  const headers = new Headers(options.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value, options.replacer), { ...options, headers });
}

export function text(value: string, options: ResponseInit = {}): Response {
  const headers = new Headers(options.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(value, { ...options, headers });
}

export function redirect(location: string | URL, status = 303, headers?: HeadersInit): Response {
  if (![301, 302, 303, 307, 308].includes(status)) throw new TypeError('Redirect status must be 301, 302, 303, 307, or 308.');
  const output = new Headers(headers);
  output.set('location', String(location));
  return new Response(null, { status, headers: output });
}

export function noContent(headers?: HeadersInit): Response { return new Response(null, { status: 204, ...(headers ? { headers } : {}) }); }

export function stream(body: ReadableStream<Uint8Array>, options: ResponseInit = {}): Response {
  return new Response(body, options);
}
