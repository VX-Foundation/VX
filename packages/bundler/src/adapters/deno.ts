import type { DeploymentAdapter, DeploymentContext } from './types.js';
import { deploymentDirectory, relativeImport, requireEntry, writeDeploymentFile } from './files.js';
import { readDeploymentBootstrap } from './bootstrap.js';

export const denoAdapter: DeploymentAdapter = Object.freeze({
  name: 'deno', targets: ['browser', 'edge'] as const, runtime: 'deno', streaming: true, incrementalStaticRegeneration: false,
  deploy(context: DeploymentContext) {
    const edge = requireEntry(context.edgeEntry, 'Deno adapter');
    const directory = deploymentDirectory(context.outDir, 'deno');
    const bootstrap = JSON.stringify(readDeploymentBootstrap(context.clientDir, context.clientEntry));
    const entry = writeDeploymentFile(directory, 'server.ts', `import createVXServerApplication from ${JSON.stringify(relativeImport(directory, edge))};
const application = createVXServerApplication(${bootstrap});
const clientRoot = new URL('../../client/', import.meta.url);
Deno.serve({ hostname: Deno.env.get('HOST') ?? '0.0.0.0', port: Number(Deno.env.get('PORT') ?? 8000) }, async (request) => {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const target = new URL('.' + decodeURIComponent(new URL(request.url).pathname), clientRoot);
    if (target.href.startsWith(clientRoot.href)) {
      try {
        const body = await Deno.readFile(target);
        return new Response(request.method === 'HEAD' ? null : body, { headers: { 'cache-control': target.pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' } });
      } catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; }
    }
  }
  return application.handle(request);
});
`);
    const config = writeDeploymentFile(directory, 'deno.json', `${JSON.stringify({ tasks: { start: 'deno run --allow-env --allow-net --allow-read server.ts' }, compilerOptions: { lib: ['deno.ns', 'dom', 'dom.iterable', 'esnext'] } }, null, 2)}\n`);
    return { name: 'deno', primaryEntry: entry, files: [entry, config] };
  }
});
