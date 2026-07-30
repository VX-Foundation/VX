import type { Diagnostic } from '@vx/types';

export const VX_PACKAGE_MANIFEST_SCHEMA = 'vx.package-manifest';
export const VX_PACKAGE_MANIFEST_VERSION = 1;

export interface VXPackagePublicEntry {
  exportKey: string;
  sourcePath: string;
  absolutePath: string;
}

export interface VXPackageDiscoveryOptions {
  maxPublicFiles?: number;
  maxDirectoryDepth?: number;
}

export interface VXPackageDiscoveryResult {
  rootDir: string;
  sourceDir: string;
  entries: VXPackagePublicEntry[];
  diagnostics: Diagnostic[];
}

export interface VXGeneratedPackageManifest {
  schema: typeof VX_PACKAGE_MANIFEST_SCHEMA;
  manifestVersion: typeof VX_PACKAGE_MANIFEST_VERSION;
  generated: true;
  package: {
    name: string;
    version: string;
  };
  framework: {
    compiler: string;
  };
  exports: Record<string, string>;
  privateModules: string[];
  publicContracts: Record<string, string>;
  files: Record<string, string>;
  deprecation?: { message: string; replacement?: string; since?: string; removal?: string };
  migrations?: Array<{ from: string; to: string; command?: string; documentation?: string; automatic: boolean }>;
}

export interface BuildVXPackageOptions extends VXPackageDiscoveryOptions {
  outDir?: string;
  frameworkVersion?: string;
  maxModules?: number;
  maxDepth?: number;
  maxFileBytes?: number;
}

export interface BuildVXPackageResult {
  rootDir: string;
  outDir: string;
  manifest?: VXGeneratedPackageManifest;
  publicEntries: VXPackagePublicEntry[];
  copiedModules: string[];
  diagnostics: Diagnostic[];
}
