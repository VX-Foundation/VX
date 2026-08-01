import type {
  AdapterConfig,
  AdapterName,
  AssetBuildConfig,
  BuildMode,
  BuildTarget,
  ChunkPolicyConfig,
  DependencyOptimizationConfig,
  LibraryBuildConfig,
  SourceMapPolicy
} from '@vx-foundation/types';
import type { AssetManifest, ResourceHintManifest } from '../assets/types.js';

export interface BuildOptions {
  root: string;
  outDir?: string;
  adapter?: AdapterName | AdapterConfig;
  srcDir?: string;
  mode?: BuildMode;
  targets?: readonly BuildTarget[];
  sourceMaps?: SourceMapPolicy;
  incremental?: boolean;
  deterministic?: boolean;
  reproducible?: boolean;
  bundleAnalysis?: boolean;
  chunkPolicy?: ChunkPolicyConfig;
  dependencyOptimization?: DependencyOptimizationConfig;
  assets?: AssetBuildConfig;
  library?: LibraryBuildConfig;
}

export type LibraryBuildOptions = LibraryBuildConfig;

export interface NormalizedBuildOptions {
  root: string;
  outDir: string;
  srcDir: string;
  pagesDir: string;
  publicDir: string;
  adapter: AdapterConfig;
  mode: BuildMode;
  targets: readonly BuildTarget[];
  sourceMaps: SourceMapPolicy;
  incremental: boolean;
  deterministic: boolean;
  reproducible: boolean;
  bundleAnalysis: boolean;
  chunkPolicy: Required<ChunkPolicyConfig>;
  dependencyOptimization: Required<DependencyOptimizationConfig>;
  assets: Required<AssetBuildConfig>;
  library?: LibraryBuildConfig;
}

export interface BuildArtifact {
  path: string;
  bytes: number;
  gzipBytes: number;
  brotliBytes: number;
  hash: string;
  kind: 'entry' | 'chunk' | 'asset' | 'manifest' | 'adapter';
  target: BuildTarget | 'deployment';
}

export interface BundleAnalysis {
  version: 1;
  totals: Readonly<Record<string, { bytes: number; gzipBytes: number; brotliBytes: number; files: number }>>;
  artifacts: readonly BuildArtifact[];
  violations: readonly string[];
}

export interface BuildMetadata {
  version: 1;
  mode: BuildMode;
  adapter: string;
  targets: readonly BuildTarget[];
  sourceFingerprint: string;
  artifactFingerprint: string;
  deterministic: boolean;
  reproducible: boolean;
}

export interface BuildResult {
  outDir: string;
  adapter: string;
  targets: readonly BuildTarget[];
  routeManifest?: string;
  serverEntry?: string;
  edgeEntry?: string;
  clientEntry?: string;
  assetManifest?: string;
  resourceHints?: string;
  analysis?: string;
  metadata: string;
  reused: boolean;
  assets?: AssetManifest;
  hints?: ResourceHintManifest;
}
