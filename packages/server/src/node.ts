import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { Socket } from 'node:net';

export interface FetchApplication { handle(request: Request): Promise<Response>; waitForBackgroundWork?(): Promise<void>; }


export interface StaticFileHandlerOptions {
  root: string;
  prefix?: string;
  immutablePrefix?: string;
  indexFiles?: readonly string[];
  maxAgeSeconds?: number;
}

export function createStaticFileHandler(options: StaticFileHandlerOptions): (request: Request) => Promise<Response | undefined> {
  const root = path.resolve(options.root);
  const prefix = normalizePrefix(options.prefix ?? '/');
  const immutablePrefix = options.immutablePrefix ?? '/assets/';
  const indexFiles = options.indexFiles ?? ['index.html'];
  return async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return undefined;
    const url = new URL(request.url);
    if (!url.pathname.startsWith(prefix)) return undefined;
    let decoded: string;
    try { decoded = decodeURIComponent(url.pathname.slice(prefix.length)); } catch { return new Response('Bad Request', { status: 400 }); }
    if (decoded.includes('\0')) return new Response('Bad Request', { status: 400 });
    const candidate = path.resolve(root, '.' + path.sep + decoded.replace(/^[/\\]+/, ''));
    if (candidate !== root && !candidate.startsWith(root + path.sep)) return new Response('Forbidden', { status: 403 });
    let filePath = candidate;
    let stat;
    try {
      stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        let found: string | undefined;
        for (const index of indexFiles) {
          const target = path.join(filePath, index);
          try { const targetStat = await fs.stat(target); if (targetStat.isFile()) { found = target; stat = targetStat; break; } } catch { /* ignore */ }
        }
        if (!found) return undefined;
        filePath = found;
      }
      if (!stat.isFile()) return undefined;
    } catch { return undefined; }
    const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag } });
    const headers = new Headers({
      'content-type': contentType(filePath),
      'content-length': String(stat.size),
      'last-modified': stat.mtime.toUTCString(),
      etag,
      'x-content-type-options': 'nosniff',
      'cache-control': url.pathname.startsWith(immutablePrefix)
        ? 'public, max-age=31536000, immutable'
        : `public, max-age=${Math.max(0, Math.floor(options.maxAgeSeconds ?? 300))}`
    });
    if (request.method === 'HEAD') return new Response(null, { status: 200, headers });
    return new Response(Readable.toWeb(createReadStream(filePath)) as never, { status: 200, headers });
  };
}

export interface NodeServerOptions {
  hostname?: string;
  port?: number;
  origin?: string;
  requestBodyLimitBytes?: number;
  gracefulShutdownMs?: number;
  compression?: boolean;
  onListen?: (address: Readonly<{ hostname: string; port: number }>) => void;
  onError?: (error: unknown) => void;
}

export interface RunningNodeServer {
  readonly server: Server;
  readonly hostname: string;
  readonly port: number;
  close(): Promise<void>;
}

export async function startNodeServer(application: FetchApplication, options: NodeServerOptions = {}): Promise<RunningNodeServer> {
  const hostname = options.hostname ?? '127.0.0.1';
  const port = options.port ?? 3000;
  const sockets = new Set<Socket>();
  let closing = false;
  const server = createServer(async (incoming, outgoing) => {
    if (closing) { outgoing.writeHead(503, { connection: 'close', 'retry-after': '1' }); outgoing.end('Server is shutting down.'); return; }
    try {
      const request = toWebRequest(incoming, options.origin ?? `http://${hostname}:${port}`, options.requestBodyLimitBytes ?? 16 * 1024 * 1024);
      let response = await application.handle(request);
      if (options.compression) response = await compressResponse(request, response);
      await writeNodeResponse(outgoing, response);
    } catch (error) {
      options.onError?.(error);
      if (!outgoing.headersSent) outgoing.writeHead(error instanceof RequestBodyTooLargeError ? 413 : 500, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
      outgoing.end(error instanceof RequestBodyTooLargeError ? 'Payload Too Large' : 'Internal Server Error');
    }
  });
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, hostname, () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;
  options.onListen?.({ hostname, port: actualPort });
  return {
    server,
    hostname,
    port: actualPort,
    async close() {
      if (closing) return;
      closing = true;
      server.closeIdleConnections?.();
      const deadline = setTimeout(() => {
        server.closeAllConnections?.();
        for (const socket of sockets) socket.destroy();
      }, options.gracefulShutdownMs ?? 10_000);
      deadline.unref();
      await Promise.all([
        new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
        application.waitForBackgroundWork?.() ?? Promise.resolve()
      ]).finally(() => clearTimeout(deadline));
    }
  };
}

export function toWebRequest(incoming: IncomingMessage, origin: string, maxBodyBytes: number): Request {
  const controller = new AbortController();
  incoming.once('aborted', () => controller.abort(new DOMException('Client disconnected.', 'AbortError')));
  incoming.once('close', () => { if (!incoming.complete) controller.abort(new DOMException('Client disconnected.', 'AbortError')); });
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  const host = headers.get('host');
  const base = host ? `${origin.startsWith('https:') ? 'https' : 'http'}://${host}` : origin;
  const url = new URL(incoming.url ?? '/', base);
  const method = incoming.method ?? 'GET';
  const declared = Number(headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > maxBodyBytes) throw new RequestBodyTooLargeError();
  const init: RequestInit & { duplex?: 'half' } = { method, headers, signal: controller.signal };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = limitNodeBody(incoming, maxBodyBytes);
    init.duplex = 'half';
  }
  return new Request(url, init);
}

export async function writeNodeResponse(outgoing: ServerResponse, response: Response): Promise<void> {
  outgoing.statusCode = response.status;
  outgoing.statusMessage = response.statusText;
  const getSetCookie = (response.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  for (const [name, value] of response.headers) if (name !== 'set-cookie') outgoing.setHeader(name, value);
  const setCookies = getSetCookie?.call(response.headers);
  if (setCookies?.length) outgoing.setHeader('set-cookie', setCookies);
  else {
    const cookie = response.headers.get('set-cookie');
    if (cookie) outgoing.setHeader('set-cookie', cookie);
  }
  if (!response.body) { outgoing.end(); return; }
  await new Promise<void>((resolve, reject) => {
    const body = Readable.fromWeb(response.body as never);
    body.once('error', reject);
    outgoing.once('error', reject);
    outgoing.once('finish', resolve);
    body.pipe(outgoing);
  });
}

async function compressResponse(request: Request, response: Response): Promise<Response> {
  if (!response.body || response.headers.has('content-encoding') || response.status === 204 || response.status === 304) return response;
  const type = response.headers.get('content-type') ?? '';
  if (!/^(text\/|application\/(json|javascript|xml|svg\+xml))/.test(type)) return response;
  const accepted = request.headers.get('accept-encoding') ?? '';
  if (!accepted.split(',').some((entry) => entry.trim().startsWith('gzip'))) return response;
  const Compression = globalThis.CompressionStream;
  if (!Compression) return response;
  const headers = new Headers(response.headers);
  headers.set('content-encoding', 'gzip');
  headers.delete('content-length');
  headers.append('vary', 'Accept-Encoding');
  return new Response(response.body.pipeThrough(new Compression('gzip')), { status: response.status, statusText: response.statusText, headers });
}

function limitNodeBody(incoming: IncomingMessage, limit: number): ReadableStream<Uint8Array> {
  let bytes = 0;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      incoming.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > limit) { controller.error(new RequestBodyTooLargeError()); incoming.destroy(); return; }
        controller.enqueue(new Uint8Array(chunk));
        if (controller.desiredSize !== null && controller.desiredSize <= 0) incoming.pause();
      });
      incoming.once('end', () => controller.close());
      incoming.once('error', (error) => controller.error(error));
    },
    pull() { incoming.resume(); },
    cancel() { incoming.destroy(); }
  });
}

class RequestBodyTooLargeError extends Error { constructor() { super('Request body exceeds the configured limit.'); this.name = 'RequestBodyTooLargeError'; } }

function normalizePrefix(value: string): string {
  const prefix = value.startsWith('/') ? value : `/${value}`;
  return prefix.endsWith('/') ? prefix : `${prefix}/`;
}

function contentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
    '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8', '.wasm': 'application/wasm', '.map': 'application/json; charset=utf-8'
  } as Record<string, string>)[extension] ?? 'application/octet-stream';
}
