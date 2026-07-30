import path from 'node:path';
import fs from 'node:fs';

export interface NodeAdapterOptions {
  serverEntry?: string;
  clientEntry?: string;
}

/** Emits the production Node entry backed by the shared @vx/server adapter. */
export function runNodeAdapter(outDir: string, options: NodeAdapterOptions = {}): string {
  const serverDir = path.join(outDir, 'server');
  const compiledEntry = options.serverEntry ?? 'vx-server.mjs';
  if (!fs.existsSync(path.join(serverDir, compiledEntry))) {
    throw new Error(`VX Node adapter cannot find compiled server entry '${compiledEntry}'.`);
  }
  const outputPath = path.join(serverDir, 'server.mjs');
  fs.writeFileSync(outputPath, nodeEntry(compiledEntry, options.clientEntry ?? '/assets/vx-client.js'));
  fs.writeFileSync(path.join(serverDir, 'package.json'), JSON.stringify({ type: 'module', private: true }, null, 2));
  return outputPath;
}

function nodeEntry(serverEntry: string, clientEntry: string): string {
  return `import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStaticFileHandler, startNodeServer } from '@vx/server/node';
import createVXServerApplication from ${JSON.stringify(`./${serverEntry}`)};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const staticFiles = createStaticFileHandler({ root: path.resolve(currentDir, '../client'), prefix: '/', immutablePrefix: '/assets/' });
const application = createVXServerApplication({
  clientEntry: ${JSON.stringify(clientEntry)},
  csrfSecret: process.env.VX_CSRF_SECRET,
  platform: {
    requestTimeoutMs: positiveInteger(process.env.VX_REQUEST_TIMEOUT_MS, 120_000),
    security: {
      contentSecurityPolicy: true,
      strictTransportSecurity: process.env.NODE_ENV === 'production' ? 'max-age=31536000; includeSubDomains' : false
    }
  }
});
const fetchApplication = {
  async handle(request) { return await staticFiles(request) ?? application.handle(request); },
  waitForBackgroundWork: () => application.waitForBackgroundWork()
};
const running = await startNodeServer(fetchApplication, {
  hostname: process.env.HOST ?? '0.0.0.0',
  port: positiveInteger(process.env.PORT, 3000),
  requestBodyLimitBytes: positiveInteger(process.env.VX_REQUEST_BODY_LIMIT, 16 * 1024 * 1024),
  gracefulShutdownMs: positiveInteger(process.env.VX_SHUTDOWN_TIMEOUT_MS, 10_000),
  compression: process.env.VX_COMPRESSION !== 'false',
  onListen: ({ hostname, port }) => console.log(\`[VX] Node server listening on http://\${hostname}:\${port}\`),
  onError: (error) => console.error('[VX] Node adapter failure.', error)
});

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.info(\`[VX] Received \${signal}; draining requests.\`);
  try { await running.close(); process.exitCode = 0; }
  catch (error) { console.error('[VX] Graceful shutdown failed.', error); process.exitCode = 1; }
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
`;
}
