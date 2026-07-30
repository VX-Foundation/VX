interface Version {
  major: number;
  minor: number;
  patch: number;
}

/** Minimal deterministic compatibility checker for VX package manifests. */
export function satisfiesVersion(versionText: string, rangeText: string): boolean {
  const version = parseVersion(versionText);
  const range = rangeText.trim();
  if (!version || range === '' || range === 'latest') return false;
  if (range === '*') return true;

  if (range.startsWith('^')) {
    const base = parseVersion(range.slice(1));
    if (!base) return false;
    const upper = base.major > 0
      ? { major: base.major + 1, minor: 0, patch: 0 }
      : base.minor > 0
        ? { major: 0, minor: base.minor + 1, patch: 0 }
        : { major: 0, minor: 0, patch: base.patch + 1 };
    return compare(version, base) >= 0 && compare(version, upper) < 0;
  }

  if (range.startsWith('~')) {
    const base = parseVersion(range.slice(1));
    if (!base) return false;
    const upper = { major: base.major, minor: base.minor + 1, patch: 0 };
    return compare(version, base) >= 0 && compare(version, upper) < 0;
  }

  const clauses = range.split(/\s+/).filter(Boolean);
  if (clauses.some((clause) => /^(>=|<=|>|<)/.test(clause))) {
    return clauses.every((clause) => matchClause(version, clause));
  }

  const exact = parseVersion(range);
  return exact ? compare(version, exact) === 0 : false;
}

function matchClause(version: Version, clause: string): boolean {
  const match = /^(>=|<=|>|<)(.+)$/.exec(clause);
  if (!match) return false;
  const target = parseVersion(match[2]!);
  if (!target) return false;
  const result = compare(version, target);
  switch (match[1]) {
    case '>=': return result >= 0;
    case '<=': return result <= 0;
    case '>': return result > 0;
    case '<': return result < 0;
    default: return false;
  }
}

function parseVersion(value: string): Version | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function compare(left: Version, right: Version): number {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}
