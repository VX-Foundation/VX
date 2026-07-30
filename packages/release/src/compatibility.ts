import type {
  CompatibilityChange,
  CompatibilityReport,
  PackageCompatibilityResult,
  PublicPackageSnapshot,
  SemverImpact,
  WorkspaceApiSnapshot
} from './types.js';
import { impactRank, maximumImpact, versionImpact } from './semver.js';

export function compareApiSnapshots(previous: WorkspaceApiSnapshot, current: WorkspaceApiSnapshot): CompatibilityReport {
  validateSnapshot(previous);
  validateSnapshot(current);
  const left = new Map(previous.packages.map((item) => [item.name, item]));
  const right = new Map(current.packages.map((item) => [item.name, item]));
  const names = new Set([...left.keys(), ...right.keys()]);
  const packages = [...names].sort().map((name) => comparePackage(left.get(name), right.get(name)));
  const changes = packages.flatMap((item) => item.changes);
  const requiredImpact = packages.reduce<SemverImpact>((impact, item) => maximumImpact(impact, item.requiredImpact), 'none');
  return { valid: packages.every((item) => item.validVersionBump), requiredImpact, packages, changes };
}

function comparePackage(previous: PublicPackageSnapshot | undefined, current: PublicPackageSnapshot | undefined): PackageCompatibilityResult {
  const packageName = current?.name ?? previous!.name;
  const changes: CompatibilityChange[] = [];
  let requiredImpact: SemverImpact = 'none';
  if (!previous && current) add(changes, packageName, 'minor', 'VX_API_PACKAGE_ADDED', `Public package '${packageName}' was added.`);
  else if (previous && !current) add(changes, packageName, 'major', 'VX_API_PACKAGE_REMOVED', `Public package '${packageName}' was removed.`);
  else if (previous && current) {
    compareEntrypoints(previous, current, changes);
    comparePeers(previous, current, changes);
  }
  for (const change of changes) requiredImpact = maximumImpact(requiredImpact, change.impact);
  const actualImpact = versionImpact(previous?.version, current?.version);
  const validVersionBump = requiredImpact === 'none'
    ? actualImpact === 'none' || actualImpact === 'patch' || actualImpact === 'minor' || actualImpact === 'major'
    : impactRank(actualImpact) >= impactRank(requiredImpact);
  return {
    packageName,
    ...(previous ? { previousVersion: previous.version } : {}),
    ...(current ? { currentVersion: current.version } : {}),
    requiredImpact,
    actualImpact,
    validVersionBump,
    changes
  };
}

function compareEntrypoints(previous: PublicPackageSnapshot, current: PublicPackageSnapshot, changes: CompatibilityChange[]): void {
  const left = new Map(previous.entrypoints.map((entry) => [entry.subpath, entry]));
  const right = new Map(current.entrypoints.map((entry) => [entry.subpath, entry]));
  for (const subpath of new Set([...left.keys(), ...right.keys()])) {
    const before = left.get(subpath);
    const after = right.get(subpath);
    if (!before && after) {
      add(changes, current.name, 'minor', 'VX_API_ENTRYPOINT_ADDED', `Entrypoint '${subpath}' was added.`, subpath);
      continue;
    }
    if (before && !after) {
      add(changes, current.name, 'major', 'VX_API_ENTRYPOINT_REMOVED', `Entrypoint '${subpath}' was removed.`, subpath);
      continue;
    }
    if (!before || !after) continue;
    const beforeSymbols = new Map(before.symbols.map((symbol) => [`${symbol.kind}:${symbol.name}`, symbol]));
    const afterSymbols = new Map(after.symbols.map((symbol) => [`${symbol.kind}:${symbol.name}`, symbol]));
    for (const key of new Set([...beforeSymbols.keys(), ...afterSymbols.keys()])) {
      const oldSymbol = beforeSymbols.get(key);
      const newSymbol = afterSymbols.get(key);
      if (!oldSymbol && newSymbol) add(changes, current.name, 'minor', 'VX_API_SYMBOL_ADDED', `Public symbol '${newSymbol.name}' was added.`, subpath, newSymbol.name);
      else if (oldSymbol && !newSymbol) add(changes, current.name, 'major', 'VX_API_SYMBOL_REMOVED', `Public symbol '${oldSymbol.name}' was removed.`, subpath, oldSymbol.name);
      else if (oldSymbol && newSymbol && oldSymbol.hash !== newSymbol.hash) add(changes, current.name, 'major', 'VX_API_SYMBOL_CHANGED', `Public declaration '${oldSymbol.name}' changed.`, subpath, oldSymbol.name);
    }
  }
}

function comparePeers(previous: PublicPackageSnapshot, current: PublicPackageSnapshot, changes: CompatibilityChange[]): void {
  const names = new Set([...Object.keys(previous.peerDependencies), ...Object.keys(current.peerDependencies)]);
  for (const name of names) {
    const before = previous.peerDependencies[name];
    const after = current.peerDependencies[name];
    if (before === after) continue;
    const impact: 'minor' | 'major' = before === undefined ? 'major' : after === undefined ? 'minor' : 'major';
    add(changes, current.name, impact, 'VX_API_PEER_RANGE_CHANGED', `Peer dependency '${name}' changed from '${before ?? '(none)'}' to '${after ?? '(none)'}'.`);
  }
}

function add(
  changes: CompatibilityChange[],
  packageName: string,
  impact: CompatibilityChange['impact'],
  code: string,
  message: string,
  entrypoint?: string,
  symbol?: string
): void {
  changes.push({ packageName, impact, code, message, ...(entrypoint ? { entrypoint } : {}), ...(symbol ? { symbol } : {}) });
}

function validateSnapshot(snapshot: WorkspaceApiSnapshot): void {
  if (snapshot.schema !== 'https://vx.dev/schemas/public-api-snapshot/v1' || snapshot.version !== 1 || !Array.isArray(snapshot.packages)) {
    throw new TypeError('Unsupported VX public API snapshot.');
  }
}
