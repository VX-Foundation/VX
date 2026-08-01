/**
 * Resolves package imports through compiler-generated manifests or safe source
 * conventions. User-authored export maps are intentionally not part of the VX
 * authoring contract.
 */
import type { Diagnostic, SourceSpan } from '@vx-foundation/types';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { discoverVXPackagePublicAPI } from '../package/discovery.js';
import {
  readGeneratedVXPackageManifest,
  VX_GENERATED_MANIFEST_FILE
} from '../package/manifest.js';

const MAX_PACKAGE_JSON_BYTES = 256 * 1024;

export interface ResolvedVXPackageImport {
  filePath: string;
  boundary: string;
  integrity: Map<string, string>;
}

export function resolveVXPackageImport(
  specifier: string,
  importerPath: string,
  frameworkVersion: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): ResolvedVXPackageImport | undefined {
  const { packageName, exportKey } = splitPackageSpecifier(specifier);
  const packageRoot = findPackageRoot(dirname(importerPath), packageName);
  if (!packageRoot) {
    diagnostics.push(error('VX_COMPONENT_PACKAGE_NOT_FOUND', `VX package '${packageName}' could not be resolved.`, span));
    return undefined;
  }

  const descriptor = readPackageDescriptor(packageRoot, span, diagnostics);
  if (!descriptor) return undefined;
  if (descriptor.name !== packageName) {
    diagnostics.push(error(
      'VX_COMPONENT_PACKAGE_NAME_MISMATCH',
      descriptor.name
        ? `Resolved package declares name '${descriptor.name}', expected '${packageName}'.`
        : `VX package '${packageName}' must declare its exact package name in package.json.`,
      span
    ));
    return undefined;
  }

  const manualManifest = join(packageRoot, 'vx.package.json');
  if (existsSync(manualManifest)) {
    diagnostics.push(error(
      'VX_PACKAGE_MANUAL_MANIFEST',
      `Package '${packageName}' contains the obsolete manual manifest 'vx.package.json'. VX package boundaries are discovered and generated automatically.`,
      span
    ));
    return undefined;
  }

  const generatedPath = join(packageRoot, VX_GENERATED_MANIFEST_FILE);
  if (existsSync(generatedPath)) {
    return resolveGeneratedPackage(packageRoot, packageName, exportKey, frameworkVersion, span, diagnostics);
  }
  return resolveSourcePackage(packageRoot, packageName, exportKey, span, diagnostics);
}

function resolveGeneratedPackage(
  packageRoot: string,
  packageName: string,
  exportKey: string,
  frameworkVersion: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): ResolvedVXPackageImport | undefined {
  const loaded = readGeneratedVXPackageManifest(packageRoot, packageName, frameworkVersion, span);
  diagnostics.push(...loaded.diagnostics);
  if (!loaded.manifest) return undefined;

  const target = loaded.manifest.exports[exportKey];
  if (!target) {
    diagnostics.push(error('VX_COMPONENT_PACKAGE_EXPORT', `Package '${packageName}' does not expose VX module '${exportKey}'.`, span));
    return undefined;
  }

  const integrity = new Map<string, string>();
  for (const [relativePath, expected] of Object.entries(loaded.manifest.files)) {
    const canonical = canonicalPackageFile(packageRoot, relativePath, span, diagnostics, packageName);
    if (canonical) integrity.set(canonical, expected);
  }
  const filePath = canonicalPackageFile(packageRoot, target, span, diagnostics, packageName);
  if (!filePath) return undefined;
  if (!integrity.has(filePath)) {
    diagnostics.push(error(
      'VX_PACKAGE_INTEGRITY_MISSING',
      `Generated manifest for package '${packageName}' does not contain integrity metadata for '${target}'.`,
      span
    ));
    return undefined;
  }
  return { filePath, boundary: packageRoot, integrity };
}

function resolveSourcePackage(
  packageRoot: string,
  packageName: string,
  exportKey: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): ResolvedVXPackageImport | undefined {
  const discovery = discoverVXPackagePublicAPI(packageRoot);
  diagnostics.push(...discovery.diagnostics);
  const entry = discovery.entries.find((candidate) => candidate.exportKey === exportKey);
  if (!entry) {
    diagnostics.push(error(
      'VX_COMPONENT_PACKAGE_EXPORT',
      `Package '${packageName}' does not expose VX module '${exportKey}' through the conventional public source surfaces.`,
      span
    ));
    return undefined;
  }
  return { filePath: entry.absolutePath, boundary: packageRoot, integrity: new Map() };
}

function canonicalPackageFile(
  packageRoot: string,
  relativeTarget: string,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  packageName: string
): string | undefined {
  if (!isSafeRelativeVXPath(relativeTarget)) {
    diagnostics.push(error('VX_COMPONENT_PACKAGE_EXPORT', `Package '${packageName}' contains an invalid generated VX path '${relativeTarget}'.`, span));
    return undefined;
  }
  try {
    const canonical = realpathSync(resolve(packageRoot, relativeTarget));
    if (!isWithin(packageRoot, canonical)) {
      diagnostics.push(error('VX_COMPONENT_BOUNDARY_ESCAPE', `Package '${packageName}' path resolves outside its package root: '${canonical}'.`, span));
      return undefined;
    }
    return canonical;
  } catch (cause) {
    diagnostics.push(error('VX_COMPONENT_RESOLUTION', `Unable to resolve VX package path '${relativeTarget}': ${message(cause)}.`, span));
    return undefined;
  }
}

function readPackageDescriptor(
  packageRoot: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): { name?: string } | undefined {
  const path = join(packageRoot, 'package.json');
  try {
    const stats = statSync(path);
    if (!stats.isFile()) throw new Error('package.json is not a file');
    if (stats.size > MAX_PACKAGE_JSON_BYTES) throw new Error(`package.json exceeds ${MAX_PACKAGE_JSON_BYTES} bytes`);
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(parsed)) throw new Error('package.json root must be an object');
    return typeof parsed['name'] === 'string' ? { name: parsed['name'] } : {};
  } catch (cause) {
    diagnostics.push(error('VX_COMPONENT_PACKAGE_MANIFEST', `Unable to read package metadata '${path}': ${message(cause)}.`, span));
    return undefined;
  }
}

function splitPackageSpecifier(specifier: string): { packageName: string; exportKey: string } {
  const parts = specifier.split('/');
  const scoped = specifier.startsWith('@');
  const packageName = scoped ? parts.slice(0, 2).join('/') : parts[0]!;
  const subpath = parts.slice(scoped ? 2 : 1).join('/');
  return { packageName, exportKey: subpath ? `./${subpath}` : '.' };
}

function findPackageRoot(start: string, packageName: string): string | undefined {
  let current = start;
  for (;;) {
    const candidate = join(current, 'node_modules', ...packageName.split('/'));
    if (existsSync(candidate)) return realpathSync(candidate);
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function isSafeRelativeVXPath(value: string): boolean {
  return value.startsWith('./') &&
    value.toLowerCase().endsWith('.vx') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.includes('?') &&
    !value.includes('#') &&
    !isAbsolute(value) &&
    !value.split('/').includes('..');
}

function isWithin(boundary: string, candidate: string): boolean {
  const result = relative(boundary, candidate);
  return result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !isAbsolute(result));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function error(code: string, messageText: string, span: SourceSpan): Diagnostic {
  return { code, message: messageText, severity: 'error', span };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
