import path from 'node:path';
import type { DeploymentAdapter, DeploymentContext } from './types.js';
import { deploymentDirectory, writeDeploymentFile } from './files.js';
import { runStaticAdapter } from './static.js';
import { readDeploymentBootstrap } from './bootstrap.js';

export const staticDeploymentAdapter: DeploymentAdapter = Object.freeze({
  name: 'static', targets: ['browser', 'server', 'static'] as const, runtime: 'static', streaming: false, incrementalStaticRegeneration: false,
  async deploy(context: DeploymentContext) {
    const written = await runStaticAdapter(context.outDir, readDeploymentBootstrap(context.clientDir, context.clientEntry));
    const directory = deploymentDirectory(context.outDir, 'static');
    const headers = writeDeploymentFile(directory, '_headers', `/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/*\n  Cache-Control: public, max-age=0, must-revalidate\n`);
    const manifest = writeDeploymentFile(directory, 'deployment.json', `${JSON.stringify({ version: 1, root: path.relative(context.outDir, context.clientDir).split(path.sep).join('/'), fallback: false }, null, 2)}\n`);
    return { name: 'static', primaryEntry: context.clientDir, files: [...written, headers, manifest] };
  }
});
