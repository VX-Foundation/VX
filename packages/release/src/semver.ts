import type { SemverImpact } from './types.js';

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

export function parseVersion(value: string): ParsedVersion | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    ...(match[4] ? { prerelease: match[4] } : {})
  };
}

export function versionImpact(previous: string | undefined, current: string | undefined): SemverImpact {
  if (!previous && current) return 'minor';
  if (previous && !current) return 'major';
  if (!previous || !current || previous === current) return 'none';
  const left = parseVersion(previous);
  const right = parseVersion(current);
  if (!left || !right) return 'none';
  if (right.major > left.major) return 'major';
  if (right.major === left.major && right.minor > left.minor) return 'minor';
  if (right.major === left.major && right.minor === left.minor && right.patch > left.patch) return 'patch';
  if (right.major === left.major && right.minor === left.minor && right.patch === left.patch && right.prerelease !== left.prerelease) return 'patch';
  return 'none';
}

export function impactRank(value: SemverImpact): number {
  return { none: 0, patch: 1, minor: 2, major: 3 }[value];
}

export function maximumImpact(left: SemverImpact, right: SemverImpact): SemverImpact {
  return impactRank(left) >= impactRank(right) ? left : right;
}
