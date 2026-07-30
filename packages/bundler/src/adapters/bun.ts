import type { DeploymentAdapter, DeploymentContext } from './types.js';
import { deploymentDirectory, relativeImport, requireEntry, writeDeploymentFile } from './files.js';
import { readDeploymentBootstrap } from './bootstrap.js';

export const bunAdapter: DeploymentAdapter = Object.freeze({
  name: 'bun', targets: ['browser', 'server'] as const, runtime: 'bun', streaming: true, incrementalStaticRegeneration: true,
  deploy(context: DeploymentContext) {
    const server = requireEntry(context.serverEntry, 'Bun adapter');
    const directory = deploymentDirectory(context.outDir, 'bun');
    const bootstrap = JSON.stringify(readDeploymentBootstrap(context.clientDir, context.clientEntry));
    const entry = writeDeploymentFile(directory, 'server.mjs', `import createVXServerApplication from ${JSON.stringify(relativeImport(directory, server))};
const application = createVXServerApplication(${bootstrap});
const clientRoot = new URL('../../client/', import.meta.url);
Bun.serve({
  hostname: process.env.HOST ?? '0.0.0.0',
  port: Number(process.env.PORT ?? 3000),
  async fetch(request) {
    if (request.method === 'GET' || request.method === 'HEAD') {
      const target = new URL('.' + decodeURIComponent(new URL(request.url).pathname), clientRoot);
      if (target.href.startsWith(clientRoot.href)) {
        const file = Bun.file(target);
        if (await file.exists()) return new Response(request.method === 'HEAD' ? null : file, { headers: { 'content-type': file.type || 'application/octet-stream', 'cache-control': target.pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' } });
      }
    }
    return application.handle(request);
  }
});
`);
    const packagePath = writeDeploymentFile(directory, 'package.json', `${JSON.stringify({ private: true, type: 'module', scripts: { start: 'bun server.mjs' }, engines: { bun: '>=1.1.0' } }, null, 2)}\n`);
    return { name: 'bun', primaryEntry: entry, files: [entry, packagePath] };
  }
});
