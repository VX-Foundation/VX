import { compareSemver } from './semver.js';
import type { PublicContractComparison, PublicContractSnapshot, VXPackageMetadata, VXPublicContract } from './types.js';

export function createPublicContractSnapshot(metadata: VXPackageMetadata): PublicContractSnapshot {
  const exports = Object.fromEntries(Object.entries(metadata.publicContracts).sort(([left], [right]) => left.localeCompare(right)).map(([subpath, contract]) => [subpath, normalize(contract)]));
  return Object.freeze({
    schema: 'https://vx.dev/schemas/public-contract/v1',
    version: 1,
    packageName: metadata.name,
    packageVersion: metadata.packageVersion,
    exports: Object.freeze(exports)
  });
}

export function comparePublicContracts(previous: PublicContractSnapshot, next: PublicContractSnapshot): PublicContractComparison {
  if (previous.packageName !== next.packageName) throw new TypeError('Public contract snapshots must belong to the same package.');
  const changes: PublicContractComparison['changes'][number][] = [];
  const paths = new Set([...Object.keys(previous.exports), ...Object.keys(next.exports)]);
  for (const exportPath of [...paths].sort()) {
    const before = previous.exports[exportPath];
    const after = next.exports[exportPath];
    if (!before && after) changes.push({ exportPath, kind: 'added', breaking: false, message: `Public export '${exportPath}' was added.` });
    else if (before && !after) changes.push({ exportPath, kind: 'removed', breaking: true, message: `Public export '${exportPath}' was removed.` });
    else if (before && after && !sameContract(before, after)) changes.push({ exportPath, kind: 'changed', breaking: true, message: `Public contract '${exportPath}' changed.` });
  }
  const breaking = changes.some((change) => change.breaking);
  const additions = changes.some((change) => change.kind === 'added');
  const versionMovedBackwards = compareSemver(next.packageVersion, previous.packageVersion) < 0;
  if (versionMovedBackwards) changes.push({ exportPath: '.', kind: 'changed', breaking: true, message: `Package version moved backwards from ${previous.packageVersion} to ${next.packageVersion}.` });
  return Object.freeze({
    compatible: !breaking && !versionMovedBackwards,
    recommendedBump: breaking || versionMovedBackwards ? 'major' : additions ? 'minor' : changes.length > 0 ? 'patch' : 'none',
    changes: Object.freeze(changes)
  });
}

function normalize(value: string | VXPublicContract): VXPublicContract {
  if (typeof value === 'string') return Object.freeze({ integrity: value });
  return Object.freeze({
    integrity: value.integrity,
    ...(value.declarationsIntegrity ? { declarationsIntegrity: value.declarationsIntegrity } : {}),
    ...(value.symbols ? { symbols: Object.freeze([...value.symbols].sort()) } : {})
  });
}
function sameContract(left: VXPublicContract, right: VXPublicContract): boolean {
  return left.integrity === right.integrity
    && left.declarationsIntegrity === right.declarationsIntegrity
    && JSON.stringify(left.symbols ?? []) === JSON.stringify(right.symbols ?? []);
}
