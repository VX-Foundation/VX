import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson } from './canonical.js';
import { validPackageName, validSemver } from './metadata.js';
import { discoverWorkspacePackages } from './workspace.js';
import type { DependencyKind, VXLockImporter, VXLockedWorkspacePackage, VXLockPackage, VXLockfile } from './types.js';

export const VX_LOCKFILE = 'vx.lock';
const INTEGRITY = /^(?:sha256|sha384|sha512)-[A-Za-z0-9+/]+={0,2}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const DEPENDENCY_KINDS: readonly DependencyKind[] = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

export function emptyLockfile(workspace = '.'): VXLockfile {
  return { schema: 'https://vx.dev/schemas/lockfile/v1', version: 1, lockfileVersion: 1, workspace: normalizeWorkspace(workspace), packages: {} };
}

export function createWorkspaceLockfile(root: string, base: VXLockfile = emptyLockfile()): VXLockfile {
  const packages = discoverWorkspacePackages(root);
  const importers: Record<string, VXLockImporter> = {};
  const workspacePackages: Record<string, VXLockedWorkspacePackage> = {};
  for (const pkg of packages) {
    importers[pkg.relativeRoot] = Object.freeze(Object.fromEntries(DEPENDENCY_KINDS.flatMap((kind) => {
      const group = pkg.dependencyGroups[kind];
      return group && Object.keys(group).length > 0 ? [[kind, group] as const] : [];
    }))) as VXLockImporter;
    workspacePackages[pkg.name] = Object.freeze({ name: pkg.name, version: pkg.version, root: pkg.relativeRoot, dependencies: pkg.dependencies });
  }
  const lockfile: VXLockfile = {
    ...base,
    workspace: '.',
    packages: sortRecord(base.packages),
    importers: sortRecord(importers),
    workspacePackages: sortRecord(workspacePackages)
  };
  validateLockfile(lockfile);
  return lockfile;
}

export function readLockfile(root: string): VXLockfile {
  const path = resolve(root, VX_LOCKFILE);
  if (!existsSync(path)) return emptyLockfile();
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  validateLockfile(value);
  return value;
}

export function writeLockfile(root: string, lockfile: VXLockfile): string {
  validateLockfile(lockfile);
  const path = resolve(root, VX_LOCKFILE);
  writeFileSync(path, canonicalJson(normalizeLockfile(lockfile)), { encoding: 'utf8', mode: 0o600 });
  return path;
}

export function updateLockedPackage(lockfile: VXLockfile, key: string, value: VXLockPackage | undefined): VXLockfile {
  const packages: Record<string, VXLockPackage> = { ...lockfile.packages };
  if (value) packages[key] = normalizeLockedPackage(value); else delete packages[key];
  const next = { ...lockfile, packages: sortRecord(packages) };
  validateLockfile(next);
  return next;
}

export function verifyLockfileGraph(lockfile: VXLockfile): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  const workspaceNames = new Set(Object.keys(lockfile.workspacePackages ?? {}));
  for (const [key, pkg] of Object.entries(lockfile.packages)) {
    for (const [dependency, selector] of Object.entries(pkg.dependencies)) {
      if (selector.startsWith('workspace:') && !workspaceNames.has(dependency)) issues.push(`Locked package '${key}' references missing workspace package '${dependency}'.`);
    }
  }
  for (const [importer, groups] of Object.entries(lockfile.importers ?? {})) {
    for (const kind of DEPENDENCY_KINDS) {
      for (const [dependency, selector] of Object.entries(groups[kind] ?? {})) {
        if (selector.startsWith('workspace:') && !workspaceNames.has(dependency)) issues.push(`Importer '${importer}' references missing workspace package '${dependency}'.`);
      }
    }
  }
  return { valid: issues.length === 0, issues };
}

export function validateLockfile(value: unknown): asserts value is VXLockfile {
  if (!record(value) || value['schema'] !== 'https://vx.dev/schemas/lockfile/v1' || value['version'] !== 1 || value['lockfileVersion'] !== 1 || typeof value['workspace'] !== 'string' || !validWorkspace(value['workspace']) || !record(value['packages'])) throw new TypeError('Unsupported or invalid VX lockfile.');
  for (const [key, candidate] of Object.entries(value['packages'])) validateLockedPackage(key, candidate);
  if (value['importers'] !== undefined) {
    if (!record(value['importers'])) throw new TypeError('VX lockfile importers must be an object.');
    for (const [path, importer] of Object.entries(value['importers'])) validateImporter(path, importer);
  }
  if (value['workspacePackages'] !== undefined) {
    if (!record(value['workspacePackages'])) throw new TypeError('VX lockfile workspacePackages must be an object.');
    for (const [name, pkg] of Object.entries(value['workspacePackages'])) validateWorkspacePackage(name, pkg);
  }
}

function validateLockedPackage(key: string, candidate: unknown): void {
  if (!record(candidate) || typeof candidate['name'] !== 'string' || !validPackageName(candidate['name']) || typeof candidate['version'] !== 'string' || !validSemver(candidate['version']) || typeof candidate['integrity'] !== 'string' || !INTEGRITY.test(candidate['integrity']) || !stringRecord(candidate['dependencies'])) throw new TypeError(`Invalid VX lockfile package '${key}'.`);
  if (key !== `${candidate['name']}@${candidate['version']}`) throw new TypeError(`VX lockfile package key '${key}' does not match its name and version.`);
  if (candidate['resolved'] !== undefined && (typeof candidate['resolved'] !== 'string' || !validResolved(candidate['resolved']))) throw new TypeError(`VX lockfile package '${key}' has an unsafe resolved location.`);
  if ((candidate['signature'] === undefined) !== (candidate['signer'] === undefined)) throw new TypeError(`VX lockfile package '${key}' has incomplete signature metadata.`);
  if (candidate['signature'] !== undefined && (typeof candidate['signature'] !== 'string' || !BASE64.test(candidate['signature']) || typeof candidate['signer'] !== 'string' || !clean(candidate['signer'], 256))) throw new TypeError(`VX lockfile package '${key}' has invalid signature metadata.`);
  if (candidate['deprecated'] !== undefined && (typeof candidate['deprecated'] !== 'string' || !clean(candidate['deprecated'], 1024))) throw new TypeError(`VX lockfile package '${key}' has invalid deprecation metadata.`);
  validateDependencyMap(candidate['dependencies'], `package '${key}'`);
}

function validateImporter(path: string, candidate: unknown): void {
  if (!validWorkspace(path) || !record(candidate)) throw new TypeError(`Invalid VX lockfile importer '${path}'.`);
  for (const kind of DEPENDENCY_KINDS) {
    const group = candidate[kind];
    if (group !== undefined) {
      if (!stringRecord(group)) throw new TypeError(`Importer '${path}' field '${kind}' must be an object.`);
      validateDependencyMap(group, `importer '${path}'`);
    }
  }
}

function validateWorkspacePackage(name: string, candidate: unknown): void {
  if (!validPackageName(name) || !record(candidate) || candidate['name'] !== name || typeof candidate['version'] !== 'string' || !validSemver(candidate['version']) || typeof candidate['root'] !== 'string' || !validWorkspace(candidate['root']) || !stringRecord(candidate['dependencies'])) throw new TypeError(`Invalid VX workspace package '${name}'.`);
  validateDependencyMap(candidate['dependencies'], `workspace package '${name}'`);
}

function validateDependencyMap(value: Record<string, string>, label: string): void {
  for (const [dependency, selector] of Object.entries(value)) if (!validPackageName(dependency) || !clean(selector, 512)) throw new TypeError(`VX lockfile ${label} has invalid dependency '${dependency}'.`);
}
function normalizeLockfile(lockfile: VXLockfile): VXLockfile {
  return {
    ...lockfile,
    packages: sortRecord(Object.fromEntries(Object.entries(lockfile.packages).map(([key, pkg]) => [key, normalizeLockedPackage(pkg)]))),
    ...(lockfile.importers ? { importers: sortRecord(Object.fromEntries(Object.entries(lockfile.importers).map(([path, importer]) => [path, normalizeImporter(importer)]))) } : {}),
    ...(lockfile.workspacePackages ? { workspacePackages: sortRecord(Object.fromEntries(Object.entries(lockfile.workspacePackages).map(([name, pkg]) => [name, { ...pkg, dependencies: sortRecord(pkg.dependencies) }]))) } : {})
  };
}
function normalizeLockedPackage(value: VXLockPackage): VXLockPackage { return { ...value, dependencies: sortRecord(value.dependencies) }; }
function normalizeImporter(value: VXLockImporter): VXLockImporter {
  return Object.freeze(Object.fromEntries(DEPENDENCY_KINDS.flatMap((kind) => value[kind] ? [[kind, sortRecord(value[kind]!)] as const] : [])));
}
function sortRecord<T>(value: Readonly<Record<string, T>>): Record<string, T> { return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))); }
function normalizeWorkspace(value: string): string { return validWorkspace(value) ? value : '.'; }
function validWorkspace(value: string): boolean { return value === '.' || (safeRelative(value) && value.length <= 512); }
function validResolved(value: string): boolean { if (/^https:\/\//.test(value)) return value.length <= 4096 && !/[\0\r\n]/.test(value); return safeRelative(value); }
function safeRelative(value: string): boolean { return Boolean(value) && !value.startsWith('/') && !value.startsWith('\\') && !value.split(/[\\/]+/).includes('..') && !/[\0\r\n]/.test(value); }
function clean(value: string, max: number): boolean { return Boolean(value.trim()) && value.length <= max && !/[\0\r\n]/.test(value); }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringRecord(value: unknown): value is Record<string, string> { return record(value) && Object.values(value).every((item) => typeof item === 'string'); }
