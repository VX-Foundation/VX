export type DependencyKind = 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies';

export interface VXPackageExportConditions { readonly [condition: string]: VXPackageExportTarget; }
export type VXPackageExportTarget = string | null | readonly VXPackageExportTarget[] | VXPackageExportConditions;

export interface VXPackageDeprecation {
  message: string;
  replacement?: string;
  since?: string;
  removal?: string;
}

export interface VXPackageMigration {
  from: string;
  to: string;
  command?: string;
  documentation?: string;
  automatic: boolean;
  breaking?: boolean;
  description?: string;
}

export interface VXPublicContract {
  integrity: string;
  declarationsIntegrity?: string;
  symbols?: readonly string[];
}

export interface VXPackageProvenanceReference {
  integrity: string;
  builder?: string;
  sourceRevision?: string;
}

export interface VXPackageMetadata {
  schema: 'https://vx.dev/schemas/package/v1';
  version: 1;
  name: string;
  packageVersion: string;
  exports: Readonly<Record<string, VXPackageExportTarget>>;
  privateModules: readonly string[];
  publicContracts: Readonly<Record<string, string | VXPublicContract>>;
  engines?: Readonly<Record<string, string>>;
  types?: string;
  files?: readonly string[];
  sideEffects?: boolean | readonly string[];
  license?: string;
  repository?: string;
  provenance?: VXPackageProvenanceReference;
  deprecation?: VXPackageDeprecation;
  migrations?: readonly VXPackageMigration[];
}

export interface VXLockPackage {
  name: string;
  version: string;
  integrity: string;
  resolved?: string;
  signature?: string;
  signer?: string;
  dependencies: Readonly<Record<string, string>>;
  deprecated?: string;
}

export interface VXLockImporter {
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
  peerDependencies?: Readonly<Record<string, string>>;
  optionalDependencies?: Readonly<Record<string, string>>;
}

export interface VXLockedWorkspacePackage {
  name: string;
  version: string;
  root: string;
  dependencies: Readonly<Record<string, string>>;
}

export interface VXLockfile {
  schema: 'https://vx.dev/schemas/lockfile/v1';
  version: 1;
  lockfileVersion: 1;
  workspace: string;
  packages: Readonly<Record<string, VXLockPackage>>;
  importers?: Readonly<Record<string, VXLockImporter>>;
  workspacePackages?: Readonly<Record<string, VXLockedWorkspacePackage>>;
}

export interface WorkspacePackage {
  name: string;
  version: string;
  root: string;
  relativeRoot: string;
  private: boolean;
  dependencies: Readonly<Record<string, string>>;
  dependencyGroups: Readonly<Partial<Record<DependencyKind, Readonly<Record<string, string>>>>>;
}

export interface WorkspaceGraph {
  packages: readonly WorkspacePackage[];
  edges: Readonly<Record<string, readonly string[]>>;
  cycles: readonly (readonly string[])[];
}

export interface PackageMutation {
  action: 'add' | 'remove' | 'update';
  name: string;
  previous?: string;
  next?: string;
  kind: DependencyKind;
}

export interface PackageMutationResult {
  manifestPath: string;
  changed: boolean;
  mutations: readonly PackageMutation[];
}

export interface PublicContractSnapshot {
  schema: 'https://vx.dev/schemas/public-contract/v1';
  version: 1;
  packageName: string;
  packageVersion: string;
  exports: Readonly<Record<string, VXPublicContract>>;
}

export interface PublicContractChange {
  exportPath: string;
  kind: 'added' | 'removed' | 'changed';
  breaking: boolean;
  message: string;
}

export interface PublicContractComparison {
  compatible: boolean;
  recommendedBump: 'none' | 'patch' | 'minor' | 'major';
  changes: readonly PublicContractChange[];
}

export interface PublicationFile {
  path: string;
  size: number;
  integrity: string;
}

export interface PublicationManifest {
  schema: 'https://vx.dev/schemas/publication/v1';
  version: 1;
  packageName: string;
  packageVersion: string;
  files: readonly PublicationFile[];
  integrity: string;
}
