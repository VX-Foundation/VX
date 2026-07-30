import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canonicalJson } from './canonical.js';
import { validPackageName } from './metadata.js';
import { validRegistrySelector } from './semver.js';
import type { DependencyKind, PackageMutation, PackageMutationResult } from './types.js';

export interface MutatePackageOptions {
  kind?: DependencyKind;
  version?: string;
}

export function addPackage(root: string, specification: string, options: MutatePackageOptions = {}): PackageMutationResult {
  const parsed = parseSpecification(specification);
  const kind = options.kind ?? 'dependencies';
  const next = options.version ?? parsed.version ?? 'latest';
  return mutate(root, [{ action: 'add', name: parsed.name, next, kind }]);
}

export function removePackage(root: string, name: string): PackageMutationResult {
  assertPackageName(name);
  const manifest = readManifest(root);
  const mutations: PackageMutation[] = [];
  for (const kind of dependencyKinds) {
    const record = dependencyRecord(manifest, kind);
    const previous = record[name];
    if (previous !== undefined) mutations.push({ action: 'remove', name, previous, kind });
  }
  return writeMutations(root, manifest, mutations);
}

export function updatePackage(root: string, specification: string, version?: string): PackageMutationResult {
  const parsed = parseSpecification(specification);
  const manifest = readManifest(root);
  for (const kind of dependencyKinds) {
    const previous = dependencyRecord(manifest, kind)[parsed.name];
    if (previous !== undefined) return mutate(root, [{ action: 'update', name: parsed.name, previous, next: version ?? parsed.version ?? 'latest', kind }]);
  }
  throw new Error(`Package '${parsed.name}' is not declared in the project manifest.`);
}

export function parseSpecification(specification: string): { name: string; version?: string } {
  if (/^(?:https?:|git\+|file:|link:|workspace:)/i.test(specification)) throw new Error('VX package mutation accepts registry package names only.');
  const separator = specification.startsWith('@') ? specification.indexOf('@', 1 + specification.indexOf('/')) : specification.lastIndexOf('@');
  const name = separator > 0 ? specification.slice(0, separator) : specification;
  const version = separator > 0 ? specification.slice(separator + 1) : undefined;
  assertPackageName(name);
  if (version !== undefined && !validRegistrySelector(version)) throw new Error(`Invalid registry version selector '${version}'.`);
  return { name, ...(version ? { version } : {}) };
}

const dependencyKinds: readonly DependencyKind[] = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function mutate(root: string, mutations: readonly PackageMutation[]): PackageMutationResult {
  const manifest = readManifest(root);
  return writeMutations(root, manifest, mutations);
}

function writeMutations(root: string, manifest: Record<string, unknown>, mutations: readonly PackageMutation[]): PackageMutationResult {
  for (const mutation of mutations) {
    const record = dependencyRecord(manifest, mutation.kind, true);
    if (mutation.action === 'remove') delete record[mutation.name];
    else if (mutation.next) record[mutation.name] = mutation.next;
    manifest[mutation.kind] = Object.fromEntries(Object.entries(record).sort(([left], [right]) => left.localeCompare(right)));
  }
  const path = resolve(root, 'package.json');
  if (mutations.length > 0) writeFileSync(path, canonicalJson(manifest), 'utf8');
  return { manifestPath: path, changed: mutations.length > 0, mutations };
}

function readManifest(root: string): Record<string, unknown> {
  const path = resolve(root, 'package.json');
  if (!existsSync(path)) throw new Error(`Package manifest '${path}' does not exist.`);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Package manifest '${path}' must be an object.`);
  return value as Record<string, unknown>;
}

function dependencyRecord(manifest: Record<string, unknown>, kind: DependencyKind, create = false): Record<string, string> {
  const value = manifest[kind];
  if (value === undefined && create) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
function assertPackageName(name: string): void { if (!validPackageName(name)) throw new Error(`Invalid package name '${name}'.`); }
