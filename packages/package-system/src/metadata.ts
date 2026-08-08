import { readFileSync } from 'node:fs';
import { compareSemver, validSemver, validSemverRange } from './semver.js';
import { flattenPackageExportTargets, validatePackageExports } from './exports.js';
import type { VXPackageDeprecation, VXPackageMetadata, VXPackageMigration, VXPublicContract } from './types.js';

export interface MetadataIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  suggestion?: string;
}

const INTEGRITY = /^(?:sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}$/;

export function readPackageMetadata(path: string): VXPackageMetadata {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = validatePackageMetadata(parsed);
  if (!result.valid || !result.metadata) {
    throw new TypeError(result.issues.map((issue) => `[${issue.code}] ${issue.message}`).join('\n'));
  }
  return result.metadata;
}

export function validatePackageMetadata(value: unknown): { valid: boolean; metadata?: VXPackageMetadata; issues: MetadataIssue[] } {
  const issues: MetadataIssue[] = [];
  const error = (code: string, message: string, suggestion?: string): void => { issues.push({ code, severity: 'error', message, ...(suggestion ? { suggestion } : {}) }); };
  const warning = (code: string, message: string, suggestion?: string): void => { issues.push({ code, severity: 'warning', message, ...(suggestion ? { suggestion } : {}) }); };
  if (!record(value)) return { valid: false, issues: [{ code: 'VX_PACKAGE_METADATA_OBJECT', severity: 'error', message: 'Package metadata must be an object.' }] };

  if (value['schema'] !== 'https://vx.veelv.site/schemas/package/v1' || value['version'] !== 1) error('VX_PACKAGE_METADATA_SCHEMA', 'Unsupported VX package metadata schema.');
  if (typeof value['name'] !== 'string' || !validPackageName(value['name'])) error('VX_PACKAGE_METADATA_NAME', 'Package metadata requires a valid npm-compatible package name.');
  if (typeof value['packageVersion'] !== 'string' || !validSemver(value['packageVersion'])) error('VX_PACKAGE_METADATA_VERSION', 'Package metadata requires a valid semantic version.');

  const exportValidation = validatePackageExports(value['exports']);
  for (const issue of exportValidation.issues) error(issue.code, issue.message);
  const exportsMap = record(value['exports']) ? value['exports'] as VXPackageMetadata['exports'] : {};

  if (!Array.isArray(value['privateModules']) || value['privateModules'].some((item) => typeof item !== 'string')) {
    error('VX_PACKAGE_METADATA_PRIVATE', 'privateModules must be a string array.');
  }
  const privateModules = Array.isArray(value['privateModules']) ? value['privateModules'].filter((item): item is string => typeof item === 'string') : [];
  if (new Set(privateModules).size !== privateModules.length) error('VX_PACKAGE_METADATA_PRIVATE_DUPLICATE', 'privateModules cannot contain duplicates.');
  const exportedTargets = new Set(Object.values(exportsMap).flatMap(flattenPackageExportTargets));
  for (const privateModule of privateModules) {
    if (!safeRelative(privateModule)) error('VX_PACKAGE_METADATA_PRIVATE_TARGET', `Private module '${privateModule}' is unsafe.`);
    if (exportedTargets.has(privateModule)) error('VX_PACKAGE_METADATA_PRIVATE_EXPORTED', `Private module '${privateModule}' is also exposed by package exports.`);
  }

  if (!record(value['publicContracts'])) error('VX_PACKAGE_METADATA_CONTRACTS', 'publicContracts must map public entrypoints to integrity metadata.');
  const contracts = record(value['publicContracts']) ? value['publicContracts'] : {};
  for (const [subpath, contract] of Object.entries(contracts)) {
    if (!(subpath in exportsMap)) error('VX_PACKAGE_METADATA_CONTRACT_EXPORT', `Public contract '${subpath}' does not match a package export.`);
    validatePublicContract(subpath, contract, error);
  }
  for (const subpath of Object.keys(exportsMap)) {
    if (!(subpath in contracts)) error('VX_PACKAGE_METADATA_CONTRACT_MISSING', `Export '${subpath}' is missing a public contract integrity value.`);
  }

  if (value['engines'] !== undefined && !stringRecord(value['engines'])) error('VX_PACKAGE_METADATA_ENGINES', 'engines must map runtime names to version requirements.');
  else if (stringRecord(value['engines'])) {
    for (const [runtime, range] of Object.entries(value['engines'])) {
      if (!/^[a-z][a-z0-9._-]*$/i.test(runtime) || !validSemverRange(range)) error('VX_PACKAGE_METADATA_ENGINE_RANGE', `Engine '${runtime}' has invalid semantic version range '${range}'.`);
    }
  }

  if (value['types'] !== undefined && (typeof value['types'] !== 'string' || !safeRelative(value['types']))) error('VX_PACKAGE_METADATA_TYPES', 'types must be a safe package-relative declaration path.');
  if (value['files'] !== undefined) validateFiles(value['files'], error);
  if (value['sideEffects'] !== undefined) validateSideEffects(value['sideEffects'], error);
  if (value['license'] !== undefined && (typeof value['license'] !== 'string' || !cleanText(value['license'], 128))) error('VX_PACKAGE_METADATA_LICENSE', 'license must be a non-empty SPDX-like string.');
  if (value['repository'] !== undefined && (typeof value['repository'] !== 'string' || !safeRepository(value['repository']))) error('VX_PACKAGE_METADATA_REPOSITORY', 'repository must be a safe HTTPS or git+https URL.');
  if (value['provenance'] !== undefined) validateProvenance(value['provenance'], error);
  else warning('VX_PACKAGE_METADATA_PROVENANCE_MISSING', 'Published packages should include provenance metadata.', 'Generate provenance during vx publish.');
  if (value['deprecation'] !== undefined) validateDeprecation(value['deprecation'], error);
  if (value['migrations'] !== undefined) validateMigrations(value['migrations'], error);

  if (issues.some((issue) => issue.severity === 'error')) return { valid: false, issues };
  return { valid: true, metadata: value as unknown as VXPackageMetadata, issues };
}

export function validPackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/.test(value) && value.length <= 214;
}

export { validSemver } from './semver.js';

function validatePublicContract(subpath: string, value: unknown, error: (code: string, message: string) => void): void {
  if (typeof value === 'string') {
    if (!INTEGRITY.test(value)) error('VX_PACKAGE_METADATA_CONTRACT_INTEGRITY', `Public contract '${subpath}' has invalid integrity metadata.`);
    return;
  }
  if (!record(value) || typeof value['integrity'] !== 'string' || !INTEGRITY.test(value['integrity'])) {
    error('VX_PACKAGE_METADATA_CONTRACT_INTEGRITY', `Public contract '${subpath}' requires a valid integrity value.`);
    return;
  }
  const contract = value as unknown as VXPublicContract;
  if (contract.declarationsIntegrity !== undefined && !INTEGRITY.test(contract.declarationsIntegrity)) error('VX_PACKAGE_METADATA_CONTRACT_DECLARATIONS', `Public contract '${subpath}' has invalid declaration integrity.`);
  if (contract.symbols !== undefined) {
    if (!Array.isArray(contract.symbols) || contract.symbols.length > 10_000 || contract.symbols.some((item) => typeof item !== 'string' || !validSymbol(item))) {
      error('VX_PACKAGE_METADATA_CONTRACT_SYMBOLS', `Public contract '${subpath}' has invalid exported symbol metadata.`);
    } else if (new Set(contract.symbols).size !== contract.symbols.length) error('VX_PACKAGE_METADATA_CONTRACT_SYMBOL_DUPLICATE', `Public contract '${subpath}' declares duplicate symbols.`);
  }
}

function validateDeprecation(value: unknown, error: (code: string, message: string) => void): void {
  if (!record(value) || typeof value['message'] !== 'string' || !cleanText(value['message'], 1024)) {
    error('VX_PACKAGE_METADATA_DEPRECATION', 'deprecation requires a non-empty message of at most 1024 characters.');
    return;
  }
  const deprecation = value as unknown as VXPackageDeprecation;
  if (deprecation.replacement !== undefined && !validPackageName(deprecation.replacement)) error('VX_PACKAGE_METADATA_DEPRECATION_REPLACEMENT', `Deprecation replacement '${deprecation.replacement}' is not a valid package name.`);
  for (const field of ['since', 'removal'] as const) {
    const version = deprecation[field];
    if (version !== undefined && !validSemver(version)) error('VX_PACKAGE_METADATA_DEPRECATION_VERSION', `Deprecation ${field} '${version}' must be a semantic version.`);
  }
  if (deprecation.since && deprecation.removal && validSemver(deprecation.since) && validSemver(deprecation.removal) && compareSemver(deprecation.since, deprecation.removal) >= 0) {
    error('VX_PACKAGE_METADATA_DEPRECATION_ORDER', 'Deprecation removal version must be later than the since version.');
  }
}

function validateMigrations(value: unknown, error: (code: string, message: string) => void): void {
  if (!Array.isArray(value) || value.length > 256) { error('VX_PACKAGE_METADATA_MIGRATIONS', 'migrations must be an array with at most 256 entries.'); return; }
  const identities = new Set<string>();
  for (const candidate of value) {
    if (!record(candidate) || typeof candidate['from'] !== 'string' || typeof candidate['to'] !== 'string' || typeof candidate['automatic'] !== 'boolean') {
      error('VX_PACKAGE_METADATA_MIGRATION', 'Each migration requires from, to, and automatic fields.'); continue;
    }
    const migration = candidate as unknown as VXPackageMigration;
    if (!validSemver(migration.from) || !validSemver(migration.to) || compareSemver(migration.from, migration.to) >= 0) error('VX_PACKAGE_METADATA_MIGRATION_RANGE', `Migration '${migration.from}' -> '${migration.to}' must move to a later semantic version.`);
    const identity = `${migration.from}->${migration.to}`;
    if (identities.has(identity)) error('VX_PACKAGE_METADATA_MIGRATION_DUPLICATE', `Migration '${identity}' is declared more than once.`);
    identities.add(identity);
    if (migration.command !== undefined && !cleanText(migration.command, 512)) error('VX_PACKAGE_METADATA_MIGRATION_COMMAND', `Migration '${identity}' has an invalid command.`);
    if (migration.documentation !== undefined && !safeDocumentation(migration.documentation)) error('VX_PACKAGE_METADATA_MIGRATION_DOCUMENTATION', `Migration '${identity}' has unsafe documentation metadata.`);
    if (migration.description !== undefined && !cleanText(migration.description, 2048)) error('VX_PACKAGE_METADATA_MIGRATION_DESCRIPTION', `Migration '${identity}' has an invalid description.`);
    if (migration.automatic && !migration.command) error('VX_PACKAGE_METADATA_MIGRATION_AUTOMATIC', `Automatic migration '${identity}' requires a command.`);
  }
}

function validateFiles(value: unknown, error: (code: string, message: string) => void): void {
  if (!Array.isArray(value) || value.length > 4096 || value.some((item) => typeof item !== 'string' || !safeFilePattern(item))) error('VX_PACKAGE_METADATA_FILES', 'files must contain safe package-relative paths or glob patterns.');
  else if (new Set(value).size !== value.length) error('VX_PACKAGE_METADATA_FILES_DUPLICATE', 'files cannot contain duplicates.');
}
function validateSideEffects(value: unknown, error: (code: string, message: string) => void): void {
  if (typeof value === 'boolean') return;
  if (!Array.isArray(value) || value.length > 4096 || value.some((item) => typeof item !== 'string' || !safeFilePattern(item))) error('VX_PACKAGE_METADATA_SIDE_EFFECTS', 'sideEffects must be a boolean or safe package-relative glob array.');
}
function validateProvenance(value: unknown, error: (code: string, message: string) => void): void {
  if (!record(value) || typeof value['integrity'] !== 'string' || !INTEGRITY.test(value['integrity'])) { error('VX_PACKAGE_METADATA_PROVENANCE', 'provenance requires a valid integrity value.'); return; }
  if (value['builder'] !== undefined && (typeof value['builder'] !== 'string' || !cleanText(value['builder'], 512))) error('VX_PACKAGE_METADATA_PROVENANCE_BUILDER', 'provenance builder is invalid.');
  if (value['sourceRevision'] !== undefined && (typeof value['sourceRevision'] !== 'string' || !cleanText(value['sourceRevision'], 512))) error('VX_PACKAGE_METADATA_PROVENANCE_REVISION', 'provenance source revision is invalid.');
}
function safeDocumentation(value: string): boolean { return cleanText(value, 2048) && (/^https:\/\//.test(value) || safeRelative(value)); }
function safeRepository(value: string): boolean { return cleanText(value, 2048) && (/^https:\/\//.test(value) || /^git\+https:\/\//.test(value)); }
function cleanText(value: string, max: number): boolean { return Boolean(value.trim()) && value.length <= max && !/[\0\r\n]/.test(value); }
function safeRelative(value: string): boolean { return Boolean(value) && value.startsWith('./') && value.length <= 2048 && !value.includes('\\') && !value.split('/').includes('..') && !/[\0\r\n]/.test(value); }
function safeFilePattern(value: string): boolean { return Boolean(value) && value.length <= 2048 && !value.startsWith('/') && !value.includes('\\') && !value.split('/').includes('..') && !/[\0\r\n]/.test(value); }
function validSymbol(value: string): boolean { return value === 'default' || /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(value); }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringRecord(value: unknown): value is Record<string, string> { return record(value) && Object.values(value).every((item) => typeof item === 'string'); }
