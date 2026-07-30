export interface SemVerIdentifier {
  readonly value: string;
  readonly numeric: boolean;
}

export interface SemVer {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
  readonly prerelease: readonly SemVerIdentifier[];
  readonly build: readonly string[];
  readonly raw: string;
}

const EXACT = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const DIST_TAG = /^[a-z][a-z0-9._-]{0,127}$/i;

export function parseSemver(value: string): SemVer | undefined {
  const match = EXACT.exec(value);
  if (!match) return undefined;
  const numeric = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (numeric.some((item) => !Number.isSafeInteger(item))) return undefined;
  const prerelease = identifiers(match[4]);
  if (!prerelease) return undefined;
  const build = buildIdentifiers(match[5]);
  if (!build) return undefined;
  return Object.freeze({
    major: numeric[0]!,
    minor: numeric[1]!,
    patch: numeric[2]!,
    prerelease: Object.freeze(prerelease),
    build: Object.freeze(build),
    raw: value
  });
}

export function validSemver(value: string): boolean { return parseSemver(value) !== undefined; }

export function compareSemver(left: string | SemVer, right: string | SemVer): -1 | 0 | 1 {
  const a = typeof left === 'string' ? requireSemver(left) : left;
  const b = typeof right === 'string' ? requireSemver(right) : right;
  const core = compareNumber(a.major, b.major) || compareNumber(a.minor, b.minor) || compareNumber(a.patch, b.patch);
  if (core) return core;
  if (a.prerelease.length === 0 && b.prerelease.length === 0) return 0;
  if (a.prerelease.length === 0) return 1;
  if (b.prerelease.length === 0) return -1;
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = a.prerelease[index];
    const rightIdentifier = b.prerelease[index];
    if (!leftIdentifier) return -1;
    if (!rightIdentifier) return 1;
    if (leftIdentifier.value === rightIdentifier.value) continue;
    if (leftIdentifier.numeric && rightIdentifier.numeric) return compareNumber(Number(leftIdentifier.value), Number(rightIdentifier.value));
    if (leftIdentifier.numeric !== rightIdentifier.numeric) return leftIdentifier.numeric ? -1 : 1;
    return leftIdentifier.value < rightIdentifier.value ? -1 : 1;
  }
  return 0;
}

export function validSemverRange(range: string): boolean {
  try { compileRange(range); return true; }
  catch { return false; }
}

export function satisfiesSemver(version: string | SemVer, range: string): boolean {
  const parsed = typeof version === 'string' ? parseSemver(version) : version;
  if (!parsed) return false;
  let sets: readonly ComparatorSet[];
  try { sets = compileRange(range); }
  catch { return false; }
  return sets.some((set) => set.every((comparator) => comparator(parsed)) && prereleaseAllowed(parsed, set));
}

export function validRegistrySelector(value: string): boolean {
  if (!value || value.length > 256 || /[\0\r\n]/.test(value)) return false;
  return validSemverRange(value) || DIST_TAG.test(value);
}

type Comparator = ((version: SemVer) => boolean) & { readonly reference?: SemVer };
type ComparatorSet = readonly Comparator[];

function compileRange(range: string): readonly ComparatorSet[] {
  const normalized = range.trim();
  if (!normalized || normalized === '*' || /^x$/i.test(normalized)) return [[]];
  if (normalized.length > 1024 || /[\0\r\n]/.test(normalized)) throw new TypeError('Invalid semantic version range.');
  const alternatives = normalized.split('||').map((item) => item.trim());
  if (alternatives.some((item) => !item)) throw new TypeError('Invalid empty semantic version range alternative.');
  return alternatives.map(compileComparatorSet);
}

function compileComparatorSet(source: string): ComparatorSet {
  const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(source);
  if (hyphen) return compileHyphen(hyphen[1]!, hyphen[2]!);
  const tokens = source.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return tokens.flatMap(compileToken);
}

function compileHyphen(left: string, right: string): Comparator[] {
  const lower = partial(left);
  const upper = partial(right);
  if (!lower || !upper) throw new TypeError(`Invalid hyphen range '${left} - ${right}'.`);
  const minimum = lowerVersion(lower);
  const maximum = upper.exact ? lowerVersion(upper) : upperExclusive(upper);
  return upper.exact
    ? [comparator('>=', minimum), comparator('<=', maximum)]
    : [comparator('>=', minimum), comparator('<', maximum)];
}

function compileToken(token: string): Comparator[] {
  if (token === '*' || /^x$/i.test(token)) return [];
  if (token.startsWith('^')) return caret(token.slice(1));
  if (token.startsWith('~')) return tilde(token.slice(1));
  const match = /^(<=|>=|<|>|=)?(.+)$/.exec(token);
  if (!match) throw new TypeError(`Invalid comparator '${token}'.`);
  const operator = match[1] ?? '';
  const value = partial(match[2]!);
  if (!value) throw new TypeError(`Invalid comparator '${token}'.`);
  if (!operator) return wildcard(value);
  if (!value.exact) {
    if (operator === '=' || operator === '>=') return [comparator('>=', lowerVersion(value))];
    if (operator === '>') return [comparator('>=', upperExclusive(value))];
    if (operator === '<') return [comparator('<', lowerVersion(value))];
    if (operator === '<=') return [comparator('<', upperExclusive(value))];
  }
  return [comparator(operator as Operator, lowerVersion(value))];
}

function wildcard(value: PartialVersion): Comparator[] {
  if (value.major === undefined) return [];
  if (value.exact) return [comparator('=', lowerVersion(value))];
  return [comparator('>=', lowerVersion(value)), comparator('<', upperExclusive(value))];
}

function caret(source: string): Comparator[] {
  const value = partial(source);
  if (!value || value.major === undefined) throw new TypeError(`Invalid caret range '^${source}'.`);
  const lower = lowerVersion(value);
  let upper: SemVer;
  if (value.minor === undefined || value.major > 0) upper = synthetic(value.major + 1, 0, 0);
  else if (value.patch === undefined || value.minor > 0) upper = synthetic(0, value.minor + 1, 0);
  else upper = synthetic(0, 0, value.patch + 1);
  return [comparator('>=', lower), comparator('<', upper)];
}

function tilde(source: string): Comparator[] {
  const value = partial(source);
  if (!value || value.major === undefined) throw new TypeError(`Invalid tilde range '~${source}'.`);
  const lower = lowerVersion(value);
  const upper = value.minor === undefined
    ? synthetic(value.major + 1, 0, 0)
    : synthetic(value.major, value.minor + 1, 0);
  return [comparator('>=', lower), comparator('<', upper)];
}

type Operator = '=' | '>' | '>=' | '<' | '<=';
function comparator(operator: Operator, reference: SemVer): Comparator {
  const predicate = ((version: SemVer): boolean => {
    const result = compareSemver(version, reference);
    if (operator === '=') return result === 0;
    if (operator === '>') return result > 0;
    if (operator === '>=') return result >= 0;
    if (operator === '<') return result < 0;
    return result <= 0;
  }) as Comparator;
  Object.defineProperty(predicate, 'reference', { value: reference, enumerable: false });
  return predicate;
}

interface PartialVersion {
  readonly major?: number;
  readonly minor?: number;
  readonly patch?: number;
  readonly prerelease: readonly SemVerIdentifier[];
  readonly build: readonly string[];
  readonly exact: boolean;
}

function partial(value: string): PartialVersion | undefined {
  const normalized = value.trim();
  if (!normalized || normalized === '*' || /^x$/i.test(normalized)) return { prerelease: [], build: [], exact: false };
  const match = /^(0|[1-9]\d*|[xX*])(?:\.(0|[1-9]\d*|[xX*]))?(?:\.(0|[1-9]\d*|[xX*]))?(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(normalized);
  if (!match) return undefined;
  for (const candidate of [match[1], match[2], match[3]]) {
    if (candidate !== undefined && !/^[xX*]$/.test(candidate) && !Number.isSafeInteger(Number(candidate))) return undefined;
  }
  const major = numericPart(match[1]);
  const minor = numericPart(match[2]);
  const patch = numericPart(match[3]);
  if (major === undefined && (minor !== undefined || patch !== undefined)) return undefined;
  if (minor === undefined && patch !== undefined) return undefined;
  const prerelease = identifiers(match[4]);
  const build = buildIdentifiers(match[5]);
  if (!prerelease || !build) return undefined;
  const exact = major !== undefined && minor !== undefined && patch !== undefined;
  if (!exact && (prerelease.length > 0 || build.length > 0)) return undefined;
  return { ...(major !== undefined ? { major } : {}), ...(minor !== undefined ? { minor } : {}), ...(patch !== undefined ? { patch } : {}), prerelease, build, exact };
}

function lowerVersion(value: PartialVersion): SemVer {
  return synthetic(value.major ?? 0, value.minor ?? 0, value.patch ?? 0, value.prerelease, value.build);
}

function upperExclusive(value: PartialVersion): SemVer {
  if (value.major === undefined) return synthetic(Number.MAX_SAFE_INTEGER, 0, 0);
  if (value.minor === undefined) return synthetic(value.major + 1, 0, 0);
  if (value.patch === undefined) return synthetic(value.major, value.minor + 1, 0);
  return synthetic(value.major, value.minor, value.patch + 1);
}

function prereleaseAllowed(version: SemVer, set: ComparatorSet): boolean {
  if (version.prerelease.length === 0) return true;
  return set.some((item) => item.reference && item.reference.major === version.major && item.reference.minor === version.minor && item.reference.patch === version.patch && item.reference.prerelease.length > 0);
}

function requireSemver(value: string): SemVer {
  const parsed = parseSemver(value);
  if (!parsed) throw new TypeError(`Invalid semantic version '${value}'.`);
  return parsed;
}

function identifiers(value: string | undefined): SemVerIdentifier[] | undefined {
  if (!value) return [];
  const result: SemVerIdentifier[] = [];
  for (const identifier of value.split('.')) {
    if (!identifier || !/^[0-9A-Za-z-]+$/.test(identifier)) return undefined;
    const numeric = /^\d+$/.test(identifier);
    if (numeric && identifier.length > 1 && identifier.startsWith('0')) return undefined;
    result.push(Object.freeze({ value: identifier, numeric }));
  }
  return result;
}

function buildIdentifiers(value: string | undefined): string[] | undefined {
  if (!value) return [];
  const parts = value.split('.');
  return parts.every((item) => Boolean(item) && /^[0-9A-Za-z-]+$/.test(item)) ? parts : undefined;
}
function numericPart(value: string | undefined): number | undefined { return value === undefined || /^[xX*]$/.test(value) ? undefined : Number(value); }
function synthetic(major: number, minor: number, patch: number, prerelease: readonly SemVerIdentifier[] = [], build: readonly string[] = []): SemVer {
  return { major, minor, patch, prerelease, build, raw: `${major}.${minor}.${patch}` };
}
function compareNumber(left: number, right: number): -1 | 0 | 1 { return left === right ? 0 : left < right ? -1 : 1; }
