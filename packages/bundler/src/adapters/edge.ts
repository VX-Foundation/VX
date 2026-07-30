import type { DeploymentAdapter, DeploymentContext } from './types.js';
import { deploymentDirectory, relativeImport, requireEntry, writeDeploymentFile } from './files.js';
import { fetchAdapterEntry } from './fetch-entry.js';
import { readDeploymentBootstrap } from './bootstrap.js';

export const edgeRuntimeAdapter: DeploymentAdapter = Object.freeze({
  name: 'edge', targets: ['browser', 'edge'] as const, runtime: 'edge', streaming: true, incrementalStaticRegeneration: false,
  deploy(context: DeploymentContext) {
    const edge = requireEntry(context.edgeEntry, 'Generic edge adapter');
    const directory = deploymentDirectory(context.outDir, 'edge');
    const entry = writeDeploymentFile(directory, 'worker.mjs', fetchAdapterEntry(relativeImport(directory, edge), { includeWaitUntil: true, applicationOptions: readDeploymentBootstrap(context.clientDir, context.clientEntry) }));
    const manifest = writeDeploymentFile(directory, 'vx.edge.json', `${JSON.stringify({ version: 1, entry: 'worker.mjs', assets: '../../client', compatibility: ['fetch', 'streams', 'web-crypto'] }, null, 2)}\n`);
    return { name: 'edge', primaryEntry: entry, files: [entry, manifest] };
  }
});
