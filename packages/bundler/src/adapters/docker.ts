import type { DeploymentAdapter, DeploymentContext } from './types.js';
import { deploymentDirectory, requireEntry, writeDeploymentFile } from './files.js';

export const dockerAdapter: DeploymentAdapter = Object.freeze({
  name: 'docker', targets: ['browser', 'server'] as const, runtime: 'node', streaming: true, incrementalStaticRegeneration: true,
  deploy(context: DeploymentContext) {
    requireEntry(context.serverEntry, 'Docker adapter');
    const directory = deploymentDirectory(context.outDir, 'docker');
    const dockerfile = writeDeploymentFile(directory, 'Dockerfile', `FROM node:22-alpine AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY client ./client
COPY server ./server
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD wget -q -O- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server/server.mjs"]
`);
    const ignore = writeDeploymentFile(directory, '.dockerignore', '.git\nnode_modules\n.vx\n*.log\n');
    const compose = writeDeploymentFile(directory, 'compose.yaml', `services:\n  vx:\n    build:\n      context: ../..\n      dockerfile: deploy/docker/Dockerfile\n    environment:\n      NODE_ENV: production\n      PORT: 3000\n    ports:\n      - "3000:3000"\n    restart: unless-stopped\n`);
    return { name: 'docker', primaryEntry: dockerfile, files: [dockerfile, ignore, compose] };
  }
});
