import type { BuildTarget } from '@vx/types';

export interface DeploymentContext {
  outDir: string;
  clientDir: string;
  serverEntry?: string;
  edgeEntry?: string;
  clientEntry: string;
  options: Readonly<Record<string, unknown>>;
}

export interface DeploymentResult {
  name: string;
  primaryEntry?: string;
  files: readonly string[];
}

export interface AdapterCapabilities {
  name: string;
  targets: readonly BuildTarget[];
  runtime: 'node' | 'edge' | 'static' | 'bun' | 'deno';
  streaming: boolean;
  incrementalStaticRegeneration: boolean;
}

export interface DeploymentAdapter extends AdapterCapabilities {
  deploy(context: DeploymentContext): Promise<DeploymentResult> | DeploymentResult;
}
