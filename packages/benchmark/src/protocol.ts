export type BenchmarkFramework = 'vx' | 'react' | 'next' | 'svelte' | 'sveltekit' | 'solid' | 'vue' | 'nuxt';
export type BenchmarkScenario = 'lists' | 'reorder' | 'forms' | 'dashboards' | 'ssr' | 'streaming' | 'hydration' | 'islands' | 'cold-build' | 'incremental-build' | 'hmr' | 'memory' | 'bundle-size';
export type BenchmarkMetric = 'duration-ms' | 'memory-bytes' | 'bundle-bytes' | 'first-byte-ms' | 'hydration-ms' | 'hmr-ms';
export interface BenchmarkEnvironment {
  os: string;
  architecture: string;
  cpu: string;
  cores: number;
  memoryBytes: number;
  freeMemoryBytes?: number;
  totalMemoryBytes?: number;
  node: string;
  browser?: string;
  commit?: string;
  dirty?: boolean;
}
export interface FrameworkIdentity { framework: BenchmarkFramework; version: string; adapterVersion: string; lockfileIntegrity: string; }
export interface BenchmarkSample { value: number; metric: BenchmarkMetric; }
export interface BenchmarkEvidence { readonly [key: string]: string | number | boolean; }
export interface BenchmarkResult {
  schema: 'https://vx.veelv.site/schemas/benchmark-result/v1';
  suiteVersion: 1;
  scenario: BenchmarkScenario;
  identity: FrameworkIdentity;
  environment: BenchmarkEnvironment;
  warmupIterations: number;
  measuredIterations: number;
  samples: readonly BenchmarkSample[];
  metadata: Readonly<Record<string, string | number | boolean>>;
  evidence?: readonly BenchmarkEvidence[];
}
export interface BenchmarkAdapter {
  identity(): FrameworkIdentity | Promise<FrameworkIdentity>;
  prepare?(scenario: BenchmarkScenario, signal: AbortSignal): void | Promise<void>;
  execute(scenario: BenchmarkScenario, signal: AbortSignal): BenchmarkSample | Promise<BenchmarkSample>;
  cleanup?(scenario: BenchmarkScenario): void | Promise<void>;
}
export const ALL_FRAMEWORKS: readonly BenchmarkFramework[] = Object.freeze(['vx', 'react', 'next', 'svelte', 'sveltekit', 'solid', 'vue', 'nuxt']);
export const ALL_SCENARIOS: readonly BenchmarkScenario[] = Object.freeze(['lists', 'reorder', 'forms', 'dashboards', 'ssr', 'streaming', 'hydration', 'islands', 'cold-build', 'incremental-build', 'hmr', 'memory', 'bundle-size']);
