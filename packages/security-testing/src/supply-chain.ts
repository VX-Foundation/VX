export interface SupplyChainIssue { code: string; severity: 'warning' | 'error'; message: string; path?: string; }
export interface SupplyChainPolicy {
  requireExactPackageManager?: boolean;
  requirePackageManager?: boolean;
  requireIntegrity?: boolean;
  denyLifecycleScripts?: boolean;
  denyRemoteSpecifications?: boolean;
  allowedRegistries?: readonly string[];
  allowedBuiltDependencies?: readonly string[];
}
export function reviewPackageManifest(manifest: Record<string, unknown>, policy: SupplyChainPolicy = {}): readonly SupplyChainIssue[] {
  const issues: SupplyChainIssue[] = [];
  const packageManager = typeof manifest['packageManager'] === 'string' ? manifest['packageManager'] : undefined;
  if ((policy.requirePackageManager ?? false) && !packageManager) issues.push({ code: 'VX_SUPPLY_PACKAGE_MANAGER_MISSING', severity: 'error', message: 'packageManager is required by policy.', path: 'packageManager' });
  if ((policy.requireExactPackageManager ?? true) && packageManager && !/^(?:pnpm|npm|yarn|bun)@\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(packageManager)) issues.push({ code: 'VX_SUPPLY_PACKAGE_MANAGER', severity: 'error', message: 'packageManager must pin an exact supported semantic version.', path: 'packageManager' });
  const scripts = isRecord(manifest['scripts']) ? manifest['scripts'] : {};
  if (policy.denyLifecycleScripts ?? true) for (const name of ['preinstall', 'install', 'postinstall']) if (typeof scripts[name] === 'string') issues.push({ code: 'VX_SUPPLY_LIFECYCLE', severity: 'error', message: `Install lifecycle script '${name}' is not allowed.`, path: `scripts.${name}` });
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const dependencies = isRecord(manifest[section]) ? manifest[section] : {};
    for (const [name, specification] of Object.entries(dependencies)) {
      if (typeof specification !== 'string') continue;
      if ((policy.denyRemoteSpecifications ?? true) && /^(?:git(?:\+[^:]+)?:|github:|gitlab:|bitbucket:|https?:|ssh:|file:|link:)/iu.test(specification)) issues.push({ code: 'VX_SUPPLY_REMOTE_SPEC', severity: 'error', message: `Dependency '${name}' uses a remote or filesystem specification.`, path: `${section}.${name}` });
    }
  }
  const publishConfig = isRecord(manifest['publishConfig']) ? manifest['publishConfig'] : undefined;
  const registry = typeof publishConfig?.['registry'] === 'string' ? publishConfig['registry'] : undefined;
  if (registry && policy.allowedRegistries?.length && !registryAllowed(registry, policy.allowedRegistries)) issues.push({ code: 'VX_SUPPLY_REGISTRY', severity: 'error', message: `Publication registry '${registry}' is not allowed.`, path: 'publishConfig.registry' });
  return Object.freeze(issues);
}
export function reviewLockfileText(source: string, policy: SupplyChainPolicy = {}): readonly SupplyChainIssue[] {
  const issues: SupplyChainIssue[] = [];
  if (/^\s+(?:specifier|version):\s*(?:git(?:\+[^:]+)?:|github:|gitlab:|bitbucket:|https?:|ssh:|file:)/imu.test(source) || /^\s+tarball:\s*https?:/imu.test(source)) issues.push({ code: 'VX_SUPPLY_LOCK_REMOTE', severity: 'error', message: 'Lockfile contains a Git, filesystem, or arbitrary remote archive resolution.' });
  if (/\b(?:hasBin|requiresBuild):\s*true/iu.test(source) && !(policy.allowedBuiltDependencies?.length)) issues.push({ code: 'VX_SUPPLY_BINARY_REVIEW', severity: 'warning', message: 'Lockfile contains executable package binaries or build requirements; review their provenance.' });
  if (!/\bintegrity:\s*sha(?:256|384|512)-[A-Za-z0-9+/=]+/iu.test(source)) issues.push({ code: 'VX_SUPPLY_INTEGRITY', severity: policy.requireIntegrity ?? true ? 'error' : 'warning', message: 'No package integrity entries were detected in the lockfile.' });
  return Object.freeze(issues);
}
function registryAllowed(registry: string, allowed: readonly string[]): boolean {
  let normalized: string;
  try { normalized = new URL(registry).origin; } catch { return false; }
  return allowed.some((candidate) => { try { return new URL(candidate).origin === normalized; } catch { return false; } });
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
