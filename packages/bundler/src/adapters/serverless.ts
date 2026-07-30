import path from 'node:path';
import type { DeploymentAdapter, DeploymentContext } from './types.js';
import { copyDirectory, deploymentDirectory, relativeImport, requireEntry, writeDeploymentFile } from './files.js';
import { readDeploymentBootstrap } from './bootstrap.js';

const NODE_BRIDGE = `function nodeRequest(request) {
  const protocol = request.headers['x-forwarded-proto'] ?? 'https';
  const host = request.headers.host ?? 'localhost';
  const url = new URL(request.url ?? '/', protocol + '://' + host);
  const method = request.method ?? 'GET';
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : String(value));
  const body = method === 'GET' || method === 'HEAD' ? undefined : request;
  const init = { method, headers };
  if (body) { init.body = body; init.duplex = 'half'; }
  return new Request(url, init);
}
async function writeNodeResponse(response, output) {
  output.statusCode = response.status;
  response.headers.forEach((value, name) => output.setHeader(name, value));
  if (!response.body) return output.end();
  const reader = response.body.getReader();
  while (true) { const { done, value } = await reader.read(); if (done) break; if (value) output.write(Buffer.from(value)); }
  output.end();
}`;

function nodeServerlessAdapter(name: 'vercel' | 'netlify' | 'serverless'): DeploymentAdapter {
  return Object.freeze({
    name,
    targets: ['browser', 'server'] as const,
    runtime: 'node',
    streaming: true,
    incrementalStaticRegeneration: name === 'vercel',
    deploy(context: DeploymentContext) {
      const server = requireEntry(context.serverEntry, `${name} adapter`);
      const directory = deploymentDirectory(context.outDir, name);
      const bootstrap = JSON.stringify(readDeploymentBootstrap(context.clientDir, context.clientEntry));
      if (name === 'vercel') return emitVercel(directory, context.clientDir, server, bootstrap);
      if (name === 'netlify') return emitNetlify(directory, context.clientDir, server, bootstrap);
      return emitGenericServerless(directory, context.clientDir, server, bootstrap);
    }
  });
}

function emitVercel(directory: string, clientDir: string, server: string, bootstrap: string) {
  const functionDirectory = path.join(directory, '.vercel', 'output', 'functions', 'index.func');
  const runtimeDirectory = path.join(functionDirectory, 'runtime');
  const runtimeFiles = copyDirectory(path.dirname(server), runtimeDirectory);
  const stagedServer = path.join(runtimeDirectory, path.basename(server));
  const entry = writeDeploymentFile(directory, '.vercel/output/functions/index.func/index.mjs', nodeHandler(relativeImport(functionDirectory, stagedServer), bootstrap));
  const functionConfig = writeDeploymentFile(directory, '.vercel/output/functions/index.func/.vc-config.json', `${JSON.stringify({ runtime: 'nodejs22.x', handler: 'index.mjs', launcherType: 'Nodejs', supportsResponseStreaming: true }, null, 2)}\n`);
  const config = writeDeploymentFile(directory, '.vercel/output/config.json', `${JSON.stringify({ version: 3, routes: [{ handle: 'filesystem' }, { src: '/(.*)', dest: '/index' }] }, null, 2)}\n`);
  const staticFiles = copyDirectory(clientDir, path.join(directory, '.vercel', 'output', 'static'));
  return { name: 'vercel', primaryEntry: entry, files: [entry, functionConfig, config, ...runtimeFiles, ...staticFiles] };
}

function emitNetlify(directory: string, clientDir: string, server: string, bootstrap: string) {
  const runtimeDirectory = path.join(directory, 'runtime');
  const runtimeFiles = copyDirectory(path.dirname(server), runtimeDirectory);
  const stagedServer = path.join(runtimeDirectory, path.basename(server));
  const staticFiles = copyDirectory(clientDir, path.join(directory, 'public'));
  const entry = writeDeploymentFile(directory, 'function.mjs', `import createVXServerApplication from ${JSON.stringify(relativeImport(directory, stagedServer))};\nconst application = createVXServerApplication(${bootstrap});\nexport default async (request, context) => { const response = await application.handle(request); context?.waitUntil?.(application.waitForBackgroundWork?.()); return response; };\n`);
  const config = writeDeploymentFile(directory, 'netlify.toml', `[build]\npublish = "public"\nfunctions = "."\n[[redirects]]\nfrom = "/*"\nto = "/.netlify/functions/function"\nstatus = 200\nforce = false\n`);
  return { name: 'netlify', primaryEntry: entry, files: [entry, config, ...runtimeFiles, ...staticFiles] };
}

function emitGenericServerless(directory: string, clientDir: string, server: string, bootstrap: string) {
  const runtimeDirectory = path.join(directory, 'runtime');
  const runtimeFiles = copyDirectory(path.dirname(server), runtimeDirectory);
  const stagedServer = path.join(runtimeDirectory, path.basename(server));
  const staticFiles = copyDirectory(clientDir, path.join(directory, 'client'));
  const entry = writeDeploymentFile(directory, 'handler.mjs', nodeHandler(relativeImport(directory, stagedServer), bootstrap));
  const config = writeDeploymentFile(directory, 'serverless.json', `${JSON.stringify({ version: 1, runtime: 'nodejs22', entry: 'handler.mjs', assets: 'client', requestModel: 'node-http' }, null, 2)}\n`);
  return { name: 'serverless', primaryEntry: entry, files: [entry, config, ...runtimeFiles, ...staticFiles] };
}

function nodeHandler(applicationImport: string, bootstrap: string): string {
  return `import createVXServerApplication from ${JSON.stringify(applicationImport)};\nconst application = createVXServerApplication(${bootstrap});\n${NODE_BRIDGE}\nexport default async function handler(request, response) { return writeNodeResponse(await application.handle(nodeRequest(request)), response); }\nexport { application };\n`;
}

export const vercelAdapter = nodeServerlessAdapter('vercel');
export const netlifyAdapter = nodeServerlessAdapter('netlify');
export const genericServerlessAdapter = nodeServerlessAdapter('serverless');
