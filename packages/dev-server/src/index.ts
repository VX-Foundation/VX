import { createServer, type InlineConfig } from 'vite';
import { vitePluginVX } from '@vx/bundler';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { Readable } from 'node:stream';
import { resolve } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface DevServerOptions {
  root: string;
  port?: number;
  https?: boolean;
  srcDir?: string;
}

/** Starts the route-aware VX development server with SSR, endpoints, actions, and Vite HMR. */
export async function startDevServer(options: DevServerOptions) {
  const config: InlineConfig = {
    root: resolve(options.root),
    server: {
      port: options.port ?? 3000,
      ...(options.https ? { https: {} } : {})
    },
    plugins: [vitePluginVX({ pagesDir: `${options.srcDir ?? 'src'}/pages` }) as unknown as NonNullable<InlineConfig['plugins']>[number]],
    appType: 'custom'
  };

  if (options.https) config.plugins!.push(basicSsl());
  const server = await createServer(config);

  server.middlewares.use(async (incoming: IncomingMessage, outgoing: ServerResponse, next: (error?: unknown) => void) => {
    if (!isApplicationRequest(incoming)) return next();
    const requestAbort = createRequestAbort(incoming);
    try {
      const serverModule = await server.ssrLoadModule('virtual:vx-server-app') as {
        createVXServerApplication(options?: Readonly<Record<string, unknown>>): { handle(request: Request): Promise<Response> };
      };
      const application = serverModule.createVXServerApplication({ clientEntry: '/@id/__x00__vx-browser-app', contentSecurityPolicy: false });
      const response = await application.handle(toRequest(incoming, requestAbort.signal));
      if (response.status === 404 && !acceptsApplicationDocument(incoming.method, incoming.url, incoming.headers.accept)) return next();
      await writeResponse(server, incoming, outgoing, response);
    } catch (cause) {
      server.ssrFixStacktrace(cause as Error);
      next(cause);
    } finally {
      requestAbort.dispose();
    }
  });

  await server.listen();
  server.printUrls();
  return server;
}

function isApplicationRequest(request: IncomingMessage): boolean {
  const rawURL = request.url ?? '/';
  const pathname = rawURL.split(/[?#]/, 1)[0] ?? '/';
  if (pathname.startsWith('/@') || pathname.startsWith('/__vite') || pathname.startsWith('/node_modules/') || pathname.startsWith('/src/')) return false;
  if (pathname.startsWith('/_vx/rpc/')) return true;
  if (request.method !== 'GET' && request.method !== 'HEAD') return true;
  if (acceptsApplicationDocument(request.method, rawURL, request.headers.accept)) return true;
  return !/\.[A-Za-z0-9]+$/.test(pathname);
}

function toRequest(incoming: IncomingMessage, signal: AbortSignal): Request {
  const host = incoming.headers.host ?? 'localhost';
  const protocol = 'encrypted' in incoming.socket && incoming.socket.encrypted ? 'https' : 'http';
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) for (const item of value) headers.append(name, item);
    else if (value !== undefined) headers.set(name, value);
  }
  const method = incoming.method ?? 'GET';
  const init: RequestInit & { duplex?: 'half' } = { method, headers, signal };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
    init.duplex = 'half';
  }
  return new Request(new URL(incoming.url ?? '/', `${protocol}://${host}`), init);
}

function createRequestAbort(incoming: IncomingMessage): { signal: AbortSignal; dispose(): void } {
  const controller = new AbortController();
  const abort = (): void => {
    if (!controller.signal.aborted) controller.abort(new DOMException('Client request disconnected.', 'AbortError'));
  };
  const close = (): void => { if (!incoming.complete) abort(); };
  const timeout = setTimeout(() => {
    if (!controller.signal.aborted) controller.abort(new DOMException('Request timed out.', 'TimeoutError'));
  }, 120_000);
  incoming.once('aborted', abort);
  incoming.once('close', close);
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timeout);
      incoming.removeListener('aborted', abort);
      incoming.removeListener('close', close);
    }
  };
}

async function writeResponse(
  server: { transformIndexHtml(url: string, html: string): Promise<string> },
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  response: Response
): Promise<void> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => { headers[name] = value; });
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    const html = await response.text();
    const transformed = await server.transformIndexHtml(incoming.url ?? '/', html);
    headers['content-length'] = String(Buffer.byteLength(transformed));
    outgoing.writeHead(response.status, headers);
    if (incoming.method === 'HEAD') outgoing.end();
    else outgoing.end(transformed);
    return;
  }
  outgoing.writeHead(response.status, headers);
  if (!response.body || incoming.method === 'HEAD') { outgoing.end(); return; }
  await new Promise<void>((resolvePromise, reject) => {
    const stream = Readable.fromWeb(response.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
    stream.on('error', reject);
    outgoing.on('error', reject);
    outgoing.on('finish', resolvePromise);
    stream.pipe(outgoing);
  });
}

function acceptsApplicationDocument(method: string | undefined, url: string | undefined, accept: string | string[] | undefined): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  if (!url) return false;
  const pathname = url.split(/[?#]/, 1)[0] ?? '/';
  if (/\.[A-Za-z0-9]+$/.test(pathname)) return false;
  const value = Array.isArray(accept) ? accept.join(',') : accept;
  return !value || value.includes('text/html') || value.includes('*/*');
}
