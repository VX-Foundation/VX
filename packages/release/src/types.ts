export type SemverImpact = 'none' | 'patch' | 'minor' | 'major';
export type ReleaseChannel = 'canary' | 'next' | 'stable';

export interface PublicSymbolSnapshot {
  name: string;
  kind: string;
  hash: string;
}

export interface PublicEntrypointSnapshot {
  subpath: string;
  typesPath: string;
  symbols: PublicSymbolSnapshot[];
}

export interface PublicPackageSnapshot {
  name: string;
  version: string;
  peerDependencies: Readonly<Record<string, string>>;
  entrypoints: PublicEntrypointSnapshot[];
}

export interface WorkspaceApiSnapshot {
  schema: 'https://vx.veelv.site/schemas/public-api-snapshot/v1';
  version: 1;
  packages: PublicPackageSnapshot[];
}

export interface CompatibilityChange {
  packageName: string;
  entrypoint?: string;
  symbol?: string;
  impact: Exclude<SemverImpact, 'none'>;
  code: string;
  message: string;
}

export interface PackageCompatibilityResult {
  packageName: string;
  previousVersion?: string;
  currentVersion?: string;
  requiredImpact: SemverImpact;
  actualImpact: SemverImpact;
  validVersionBump: boolean;
  changes: CompatibilityChange[];
}

export interface CompatibilityReport {
  valid: boolean;
  requiredImpact: SemverImpact;
  packages: PackageCompatibilityResult[];
  changes: CompatibilityChange[];
}

export interface PackagePolicyIssue {
  packageName: string;
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface PackagePolicyResult {
  valid: boolean;
  issues: PackagePolicyIssue[];
}

export interface ReleaseChannelPlan {
  channel: ReleaseChannel;
  npmTag: 'canary' | 'next' | 'latest';
  version: string;
  provenanceRequired: boolean;
  compatibilityRequired: boolean;
}

export interface ProvenanceFile {
  path: string;
  size: number;
  integrity: string;
}

export interface ProvenanceManifest {
  schema: 'https://vx.veelv.site/schemas/release-provenance/v1';
  version: 1;
  packageName: string;
  packageVersion: string;
  sourceRevision: string;
  files: ProvenanceFile[];
  integrity: string;
}
