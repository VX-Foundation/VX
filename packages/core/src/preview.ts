import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

export interface PreviewOptions {
  host?: string;
  port?: number;
  outDir: string;
  root: string;
}

export interface PreviewHandle {
  url: string;
  close(): Promise<void>;
}

export async function startPreview(options: PreviewOptions): Promise<PreviewHandle> {
  const host = options.host ?? '127.0.0.1';
  const port = validatePort(options.port ?? 4173);
  const outDir = resolve(options.root, options.outDir);
  const serverEntry = join(outDir, 'server', 'server.mjs');
  if (existsSync(serverEntry)) return startNodePreview(serverEntry, options.root, host, port);
  const clientDir = join(outDir, 'client');
  if (!existsSync(clientDir) || !statSync(clientDir).isDirectory()) throw new Error(`VX preview output '${clientDir}' does not exist. Run 'vx build' first.`);
  return startStaticPreview(clientDir, host, port);
}

async function startNodePreview(entry: string, root: string, host: string, port: number): Promise<PreviewHandle> {
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, NODE_ENV: 'production', HOST: host, PORT: String(port) }
  });
  await waitForSpawn(child);
  const close = async (): Promise<void> => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    child.kill('SIGTERM');
    await new Promise<void>((resolveClose) => child.once('exit', () => resolveClose()));
  };
  installSignalHandlers(close);
  return { url: `http://${displayHost(host)}:${port}`, close };
}

async function startStaticPreview(root: string, host: string, port: number): Promise<PreviewHandle> {
  const server = createServer((request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
      const path = resolveStaticPath(root, url.pathname);
      if (!path) { response.writeHead(400).end('Bad Request'); return; }
      const target = resolveIndex(path);
      if (!target) { response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not Found'); return; }
      const stats = statSync(target);
      response.writeHead(200, {
        'content-type': contentType(target),
        'content-length': String(stats.size),
        'cache-control': target.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'strict-origin-when-cross-origin'
      });
      createReadStream(target).on('error', () => response.destroy()).pipe(response);
    } catch {
      if (!response.headersSent) response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Internal Server Error');
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolveListen(); });
  });
  const close = () => closeServer(server);
  installSignalHandlers(close);
  return { url: `http://${displayHost(host)}:${port}`, close };
}

function resolveStaticPath(root: string, pathname: string): string | undefined {
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return undefined; }
  if (decoded.includes('\0') || decoded.includes('\\')) return undefined;
  const relative = normalize(decoded).replace(/^([/\\])+/, '');
  const target = resolve(root, relative);
  return target === root || target.startsWith(`${root}${sep}`) ? target : undefined;
}
function resolveIndex(path: string): string | undefined {
  if (existsSync(path) && statSync(path).isFile()) return path;
  const index = join(path, 'index.html');
  return existsSync(index) && statSync(index).isFile() ? index : undefined;
}
function contentType(path: string): string {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.wasm': 'application/wasm' } as Record<string, string>)[extname(path).toLowerCase()] ?? 'application/octet-stream';
}
function validatePort(port: number): number { if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new TypeError(`Invalid preview port '${port}'.`); return port; }
function displayHost(host: string): string { return host === '0.0.0.0' || host === '::' ? 'localhost' : host; }
function waitForSpawn(child: ChildProcess): Promise<void> { return new Promise((resolveSpawn, reject) => { child.once('spawn', resolveSpawn); child.once('error', reject); }); }
function closeServer(server: Server): Promise<void> { return new Promise((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())); }
function installSignalHandlers(close: () => Promise<void>): void {
  let closing = false;
  const shutdown = (): void => { if (closing) return; closing = true; void close().finally(() => { process.exitCode = 0; }); };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
