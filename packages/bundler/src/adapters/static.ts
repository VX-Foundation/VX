import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { generateStaticEntries, type RuntimeServerRouteRecord, type ServerApplication } from '@vx-foundation/router/server';

export interface StaticAdapterOptions {
  serverEntry?: string;
  clientEntry?: string;
  clientEntryIntegrity?: string;
  styleAssets?: readonly Readonly<{ href: string; integrity?: string; crossOrigin?: 'anonymous' }>[];
  resourceHints?: readonly Readonly<Record<string, unknown>>[];
}

interface BuiltServerModule {
  routes: readonly RuntimeServerRouteRecord[];
  createVXServerApplication(options?: Readonly<Record<string, unknown>>): ServerApplication;
}

/** Executes the compiled server renderer and writes one deterministic HTML document per static route entry. */
export async function runStaticAdapter(outDir: string, options: StaticAdapterOptions = {}): Promise<string[]> {
  const clientDir = path.join(outDir, 'client');
  const serverEntry = path.join(outDir, 'server', options.serverEntry ?? 'vx-server.mjs');
  if (!fs.existsSync(serverEntry) || !fs.existsSync(clientDir)) throw new Error('VX static adapter requires both client and server build outputs.');

  const module = await import(/* @vite-ignore */ pathToFileURL(serverEntry).href) as BuiltServerModule;
  if (!Array.isArray(module.routes) || typeof module.createVXServerApplication !== 'function') {
    throw new TypeError('Compiled VX server entry does not expose routes and createVXServerApplication().');
  }
  const application = module.createVXServerApplication({
    clientEntry: options.clientEntry ?? '/assets/vx-client.js',
    ...(options.clientEntryIntegrity ? { clientEntryIntegrity: options.clientEntryIntegrity } : {}),
    ...(options.styleAssets ? { styleAssets: options.styleAssets } : {}),
    ...(options.resourceHints ? { resourceHints: options.resourceHints } : {})
  });
  const entries = generateStaticEntries(module.routes);
  const written: string[] = [];
  const manifest: Array<{ routeId: string; pathname: string; file: string; revalidateSeconds?: number }> = [];
  for (const entry of entries) {
    const response = await application.render(entry.pathname, { headers: { accept: 'text/html' } });
    if (!response.ok) throw new Error(`Static generation failed for '${entry.pathname}' with HTTP ${response.status}.`);
    const filePath = outputFile(clientDir, entry.pathname);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, await response.text());
    written.push(filePath);
    manifest.push({ routeId: entry.routeId, pathname: entry.pathname, file: path.relative(clientDir, filePath).split(path.sep).join('/'), ...(entry.revalidateSeconds ? { revalidateSeconds: entry.revalidateSeconds } : {}) });
  }
  fs.writeFileSync(path.join(clientDir, 'vx.static.json'), JSON.stringify({ version: 1, entries: manifest }, null, 2));
  return written;
}

function outputFile(clientDir: string, pathname: string): string {
  const normalized = pathname.replace(/^\/+|\/+$/g, '');
  const segments = normalized ? normalized.split('/').map(safeSegment) : [];
  return path.join(clientDir, ...segments, 'index.html');
}

function safeSegment(segment: string): string {
  const decoded = decodeURIComponent(segment);
  if (!decoded || decoded === '.' || decoded === '..' || decoded.includes('/') || decoded.includes('\\') || decoded.includes('\0')) {
    throw new Error(`Unsafe static route segment '${segment}'.`);
  }
  return decoded;
}
