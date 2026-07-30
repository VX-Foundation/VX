import fs from 'node:fs';
import path from 'node:path';
import type { DeploymentAdapter, DeploymentContext } from './types.js';
import { deploymentDirectory, requireEntry, writeDeploymentFile } from './files.js';

export const nodeAdapter: DeploymentAdapter = Object.freeze({
  name: 'node', targets: ['browser', 'server', 'static'] as const, runtime: 'node', streaming: true, incrementalStaticRegeneration: true,
  deploy(context: DeploymentContext) {
    const entry = requireEntry(context.serverEntry, 'Node adapter');
    const directory = deploymentDirectory(context.outDir, 'node');
    const launcher = path.join(path.dirname(entry), 'server.mjs');
    if (!fs.existsSync(launcher)) throw new Error('Node build did not emit the standalone server launcher.');
    const packagePath = writeDeploymentFile(directory, 'package.json', `${JSON.stringify({ name: 'vx-node-deployment', private: true, type: 'module', scripts: { start: 'node ../../server/server.mjs' }, engines: { node: '>=22.11.0 <23 || >=24.11.0 <25' } }, null, 2)}\n`);
    const readme = writeDeploymentFile(directory, 'README.md', '# VX Node standalone deployment\n\nRun `node ../../server/server.mjs` with `PORT`, `HOST`, and production secrets configured.\n');
    return { name: 'node', primaryEntry: launcher, files: [launcher, packagePath, readme] };
  }
});
