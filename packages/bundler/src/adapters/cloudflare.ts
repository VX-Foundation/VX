import type { DeploymentAdapter, DeploymentContext } from './types.js';
import { deploymentDirectory, relativeImport, requireEntry, writeDeploymentFile } from './files.js';
import { fetchAdapterEntry } from './fetch-entry.js';
import { readDeploymentBootstrap } from './bootstrap.js';

function cloudflareAdapter(name: 'cloudflare-workers' | 'cloudflare-pages'): DeploymentAdapter {
  return Object.freeze({
    name, targets: ['browser', 'edge'] as const, runtime: 'edge', streaming: true, incrementalStaticRegeneration: false,
    deploy(context: DeploymentContext) {
      const edge = requireEntry(context.edgeEntry, `${name} edge adapter`);
      const directory = deploymentDirectory(context.outDir, name);
      const entryName = name === 'cloudflare-pages' ? '_worker.js' : 'worker.mjs';
      const entry = writeDeploymentFile(directory, entryName, fetchAdapterEntry(relativeImport(directory, edge), { includeWaitUntil: true, applicationOptions: readDeploymentBootstrap(context.clientDir, context.clientEntry), assetBinding: 'ASSETS' }));
      const config = writeDeploymentFile(directory, 'wrangler.jsonc', `${JSON.stringify({ name: 'vx-application', main: entryName, compatibility_date: '2026-01-01', compatibility_flags: ['nodejs_compat'], assets: { directory: '../../client', binding: 'ASSETS' }, observability: { enabled: true } }, null, 2)}\n`);
      return { name, primaryEntry: entry, files: [entry, config] };
    }
  });
}

export const cloudflareWorkersAdapter = cloudflareAdapter('cloudflare-workers');
export const cloudflarePagesAdapter = cloudflareAdapter('cloudflare-pages');
