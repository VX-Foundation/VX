import type { AdapterCapabilities, DeploymentAdapter, DeploymentContext, DeploymentResult } from './types.js';
import { awsLambdaAdapter } from './aws-lambda.js';
import { bunAdapter } from './bun.js';
import { cloudflarePagesAdapter, cloudflareWorkersAdapter } from './cloudflare.js';
import { denoAdapter } from './deno.js';
import { dockerAdapter } from './docker.js';
import { edgeRuntimeAdapter } from './edge.js';
import { netlifyAdapter, genericServerlessAdapter, vercelAdapter } from './serverless.js';
import { nodeAdapter } from './node-deployment.js';
import { staticDeploymentAdapter } from './static-deployment.js';

const ADAPTERS = new Map<string, DeploymentAdapter>([
  nodeAdapter, dockerAdapter, staticDeploymentAdapter, cloudflareWorkersAdapter, cloudflarePagesAdapter,
  vercelAdapter, netlifyAdapter, awsLambdaAdapter, genericServerlessAdapter, bunAdapter, denoAdapter, edgeRuntimeAdapter
].map((adapter) => [adapter.name, adapter]));

const ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'node-standalone': 'node', 'generic-serverless': 'serverless', 'edge-runtime': 'edge'
});

export function normalizeAdapterName(name: string): string { return ALIASES[name] ?? name; }

export function adapterCapabilities(name: string): AdapterCapabilities {
  const adapter = ADAPTERS.get(normalizeAdapterName(name));
  if (!adapter) throw new TypeError(`Unknown VX adapter '${name}'. Official adapters: ${[...ADAPTERS.keys()].sort().join(', ')}.`);
  return adapter;
}

export async function runDeploymentAdapter(name: string, context: DeploymentContext): Promise<DeploymentResult> {
  const adapter = ADAPTERS.get(normalizeAdapterName(name));
  if (!adapter) throw new TypeError(`Unknown VX adapter '${name}'.`);
  return await adapter.deploy(context);
}

export function officialAdapters(): readonly AdapterCapabilities[] {
  return Object.freeze([...ADAPTERS.values()].map(({ deploy: _deploy, ...capabilities }) => Object.freeze(capabilities)).sort((a, b) => a.name.localeCompare(b.name)));
}
