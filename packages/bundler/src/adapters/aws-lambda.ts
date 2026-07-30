import path from 'node:path';
import type { DeploymentAdapter, DeploymentContext } from './types.js';
import { copyDirectory, deploymentDirectory, relativeImport, requireEntry, writeDeploymentFile } from './files.js';
import { readDeploymentBootstrap } from './bootstrap.js';

export const awsLambdaAdapter: DeploymentAdapter = Object.freeze({
  name: 'aws-lambda', targets: ['browser', 'server'] as const, runtime: 'node', streaming: false, incrementalStaticRegeneration: false,
  deploy(context: DeploymentContext) {
    const server = requireEntry(context.serverEntry, 'AWS Lambda adapter');
    const directory = deploymentDirectory(context.outDir, 'aws-lambda');
    const runtimeDirectory = path.join(directory, 'runtime');
    const runtimeFiles = copyDirectory(path.dirname(server), runtimeDirectory);
    const stagedServer = path.join(runtimeDirectory, path.basename(server));
    const staticFiles = copyDirectory(context.clientDir, path.join(directory, 'client'));
    const bootstrap = JSON.stringify(readDeploymentBootstrap(context.clientDir, context.clientEntry));
    const entry = writeDeploymentFile(directory, 'lambda.mjs', lambdaEntry(relativeImport(directory, stagedServer), bootstrap));
    const template = writeDeploymentFile(directory, 'template.yaml', `AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Resources:
  VXFunction:
    Type: AWS::Serverless::Function
    Properties:
      Runtime: nodejs22.x
      Handler: lambda.handler
      CodeUri: .
      MemorySize: 512
      Timeout: 30
      Events:
        Proxy:
          Type: HttpApi
`);
    return { name: 'aws-lambda', primaryEntry: entry, files: [entry, template, ...runtimeFiles, ...staticFiles] };
  }
});

function lambdaEntry(serverImport: string, bootstrap: string): string {
  return `import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import createVXServerApplication from ${JSON.stringify(serverImport)};
const application = createVXServerApplication(${bootstrap});
const clientRoot = resolve(fileURLToPath(new URL('./client/', import.meta.url)));
export async function handler(event, lambdaContext) {
  const rawPath = event.rawPath ?? event.path ?? '/';
  const rawQuery = event.rawQueryString ? \`?\${event.rawQueryString}\` : '';
  const protocol = event.headers?.['x-forwarded-proto'] ?? 'https';
  const host = event.headers?.host ?? 'lambda.vx.local';
  const method = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
  if (method === 'GET' || method === 'HEAD') {
    const asset = await staticAsset(rawPath, method);
    if (asset) return asset;
  }
  const headers = new Headers(event.headers ?? {});
  const body = event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body) : undefined;
  const init = { method, headers };
  if (body !== undefined && method !== 'GET' && method !== 'HEAD') init.body = body;
  const request = new Request(protocol + '://' + host + rawPath + rawQuery, init);
  const response = await application.handle(request);
  const responseBody = new Uint8Array(await response.arrayBuffer());
  if (lambdaContext) lambdaContext.callbackWaitsForEmptyEventLoop = false;
  return { statusCode: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(responseBody).toString('base64'), isBase64Encoded: true };
}
async function staticAsset(pathname, method) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return { statusCode: 400, body: '', isBase64Encoded: false }; }
  const relative = decoded.replace(/^\\/+/, '');
  const target = resolve(clientRoot, relative || 'index.html');
  if (target !== clientRoot && !target.startsWith(clientRoot + sep)) return { statusCode: 400, body: '', isBase64Encoded: false };
  try {
    const content = await readFile(target);
    return { statusCode: 200, headers: { 'content-type': mediaType(target), 'cache-control': target.includes(sep + 'assets' + sep) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate' }, body: method === 'HEAD' ? '' : content.toString('base64'), isBase64Encoded: method !== 'HEAD' };
  } catch (error) { if (error?.code !== 'ENOENT' && error?.code !== 'EISDIR') throw error; }
}
function mediaType(file) { return ({ '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.woff2': 'font/woff2' })[extname(file).toLowerCase()] ?? 'application/octet-stream'; }
`;
}
