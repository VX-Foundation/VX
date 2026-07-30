/**
 * Generated package manifests are compiler-owned distribution metadata. They
 * preserve a closed public boundary without asking library authors to maintain
 * export maps or framework compatibility fields by hand.
 */
import type { Diagnostic, SourceSpan } from '@vx/types';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { satisfiesVersion } from '../components/semver.js';
import {
  VX_PACKAGE_MANIFEST_SCHEMA,
  VX_PACKAGE_MANIFEST_VERSION
} from './types.js';
import type { VXGeneratedPackageManifest } from './types.js';

export const VX_GENERATED_MANIFEST_FILE = 'vx.manifest.json';
export const VX_MAX_MANIFEST_BYTES = 256 * 1024;
export const VX_MAX_PACKAGE_EXPORTS = 2048;
export const VX_MAX_INTEGRITY_FILES = 8192;

export interface ReadGeneratedManifestResult {
  manifest?: VXGeneratedPackageManifest;
  diagnostics: Diagnostic[];
}

export function readGeneratedVXPackageManifest(
  packageRoot: string,
  expectedPackageName: string,
  frameworkVersion: string,
  span: SourceSpan
): ReadGeneratedManifestResult {
  const diagnostics: Diagnostic[] = [];
  const manifestPath = join(packageRoot, VX_GENERATED_MANIFEST_FILE);
  if (!existsSync(manifestPath)) return { diagnostics };

  const raw = readManifestObject(manifestPath, span, diagnostics);
  if (!raw) return { diagnostics };
  if (raw['schema'] !== VX_PACKAGE_MANIFEST_SCHEMA || raw['manifestVersion'] !== VX_PACKAGE_MANIFEST_VERSION || raw['generated'] !== true) {
    diagnostics.push(error(
      'VX_PACKAGE_GENERATED_MANIFEST_FORMAT',
      `Generated VX package manifest '${manifestPath}' has an unsupported schema or version.`,
      span
    ));
    return { diagnostics };
  }

  const packageMetadata = raw['package'];
  const framework = raw['framework'];
  const packageName = isRecord(packageMetadata) ? packageMetadata['name'] : undefined;
  const packageVersion = isRecord(packageMetadata) ? packageMetadata['version'] : undefined;
  const compilerRange = isRecord(framework) ? framework['compiler'] : undefined;
  if (packageName !== expectedPackageName || typeof packageVersion !== 'string' || typeof compilerRange !== 'string') {
    diagnostics.push(error(
      'VX_PACKAGE_GENERATED_MANIFEST_METADATA',
      `Generated VX package manifest '${manifestPath}' does not match package '${expectedPackageName}'.`,
      span
    ));
    return { diagnostics };
  }
  if (!satisfiesVersion(frameworkVersion, compilerRange)) {
    diagnostics.push(error(
      'VX_COMPONENT_FRAMEWORK_VERSION',
      `Package '${expectedPackageName}' requires VX '${compilerRange}', but the compiler is '${frameworkVersion}'.`,
      span
    ));
    return { diagnostics };
  }

  const exportsMap = validatePathMap(raw['exports'], manifestPath, VX_MAX_PACKAGE_EXPORTS, 'export', span, diagnostics);
  const files = validateIntegrityMap(raw['files'], manifestPath, span, diagnostics);
  const privateModules = validatePrivateModules(raw['privateModules'], manifestPath, span, diagnostics);
  const publicContracts = validatePublicContracts(raw['publicContracts'], exportsMap, files, manifestPath, span, diagnostics);
  const deprecation = validateDeprecation(raw['deprecation'], manifestPath, span, diagnostics);
  const migrations = validateMigrations(raw['migrations'], manifestPath, span, diagnostics);
  if (!exportsMap || !files || !privateModules || !publicContracts || diagnostics.some((item) => item.severity === 'error')) return { diagnostics };

  return {
    manifest: {
      schema: VX_PACKAGE_MANIFEST_SCHEMA,
      manifestVersion: VX_PACKAGE_MANIFEST_VERSION,
      generated: true,
      package: { name: packageName, version: packageVersion },
      framework: { compiler: compilerRange },
      exports: exportsMap,
      privateModules,
      publicContracts,
      files,
      ...(deprecation ? { deprecation } : {}),
      ...(migrations ? { migrations } : {})
    },
    diagnostics
  };
}

export function createFileIntegrity(source: string | Buffer): string {
  return `sha256-${createHash('sha256').update(source).digest('base64')}`;
}

export function verifyFileIntegrity(source: string | Buffer, expected: string): boolean {
  return createFileIntegrity(source) === expected;
}

function readManifestObject(
  path: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): Record<string, unknown> | undefined {
  try {
    const stats = statSync(path);
    if (!stats.isFile()) throw new Error('manifest path is not a file');
    if (stats.size > VX_MAX_MANIFEST_BYTES) {
      diagnostics.push(error(
        'VX_PACKAGE_GENERATED_MANIFEST_SIZE',
        `Generated VX package manifest '${path}' exceeds the ${VX_MAX_MANIFEST_BYTES}-byte safety limit.`,
        span
      ));
      return undefined;
    }
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(parsed)) throw new Error('manifest root must be a JSON object');
    return parsed;
  } catch (cause) {
    diagnostics.push(error(
      'VX_PACKAGE_GENERATED_MANIFEST_READ',
      `Unable to read generated VX package manifest '${path}': ${message(cause)}.`,
      span
    ));
    return undefined;
  }
}

function validatePathMap(
  value: unknown,
  manifestPath: string,
  limit: number,
  label: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_EXPORTS', `Generated VX ${label} map in '${manifestPath}' must be an object.`, span));
    return undefined;
  }
  const entries = Object.entries(value);
  if (entries.length > limit) {
    diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_EXPORT_LIMIT', `Generated VX package manifest '${manifestPath}' exceeds the ${limit}-${label} limit.`, span));
    return undefined;
  }
  const output: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, target] of entries) {
    if ((key !== '.' && !key.startsWith('./')) || !isSafeRelativeVXPath(target)) {
      diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_EXPORT_ENTRY', `Invalid generated VX package ${label} '${key}' in '${manifestPath}'.`, span));
      continue;
    }
    output[key] = target;
  }
  return output;
}


function validatePrivateModules(
  value: unknown,
  manifestPath: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): string[] | undefined {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > VX_MAX_INTEGRITY_FILES) {
    diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_PRIVATE_MODULES', `Generated VX private module list in '${manifestPath}' must be an array.`, span));
    return undefined;
  }
  const output: string[] = [];
  for (const path of value) {
    if (!isSafeRelativeVXPath(path)) {
      diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_PRIVATE_MODULE', `Invalid private VX module '${String(path)}' in '${manifestPath}'.`, span));
      continue;
    }
    if (!output.includes(path)) output.push(path);
  }
  return output.sort();
}

function validatePublicContracts(
  value: unknown,
  exportsMap: Record<string, string> | undefined,
  files: Record<string, string> | undefined,
  manifestPath: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): Record<string, string> | undefined {
  if (!exportsMap || !files) return undefined;
  if (value === undefined) {
    return Object.fromEntries(Object.entries(exportsMap).map(([key, path]) => [key, files[path] ?? '']));
  }
  if (!isRecord(value)) {
    diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_PUBLIC_CONTRACTS', `Generated VX public contracts in '${manifestPath}' must be an object.`, span));
    return undefined;
  }
  const output: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [key, integrity] of Object.entries(value)) {
    if (!(key in exportsMap) || typeof integrity !== 'string' || !/^sha256-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
      diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_PUBLIC_CONTRACT', `Invalid public contract '${key}' in '${manifestPath}'.`, span));
      continue;
    }
    output[key] = integrity;
  }
  return output;
}

function validateDeprecation(
  value: unknown,
  manifestPath: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): VXGeneratedPackageManifest['deprecation'] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value['message'] !== 'string') {
    diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_DEPRECATION', `Invalid deprecation metadata in '${manifestPath}'.`, span));
    return undefined;
  }
  return {
    message: value['message'],
    ...(typeof value['replacement'] === 'string' ? { replacement: value['replacement'] } : {}),
    ...(typeof value['since'] === 'string' ? { since: value['since'] } : {}),
    ...(typeof value['removal'] === 'string' ? { removal: value['removal'] } : {})
  };
}

function validateMigrations(
  value: unknown,
  manifestPath: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): VXGeneratedPackageManifest['migrations'] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 256) {
    diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_MIGRATIONS', `Invalid migration metadata in '${manifestPath}'.`, span));
    return undefined;
  }
  const output: NonNullable<VXGeneratedPackageManifest['migrations']> = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item['from'] !== 'string' || typeof item['to'] !== 'string' || typeof item['automatic'] !== 'boolean') {
      diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_MIGRATION', `Invalid migration entry in '${manifestPath}'.`, span));
      continue;
    }
    output.push({
      from: item['from'],
      to: item['to'],
      automatic: item['automatic'],
      ...(typeof item['command'] === 'string' ? { command: item['command'] } : {}),
      ...(typeof item['documentation'] === 'string' ? { documentation: item['documentation'] } : {})
    });
  }
  return output;
}

function validateIntegrityMap(
  value: unknown,
  manifestPath: string,
  span: SourceSpan,
  diagnostics: Diagnostic[]
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_FILES', `Generated VX file integrity map in '${manifestPath}' must be an object.`, span));
    return undefined;
  }
  const entries = Object.entries(value);
  if (entries.length > VX_MAX_INTEGRITY_FILES) {
    diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_FILE_LIMIT', `Generated VX package manifest '${manifestPath}' exceeds the ${VX_MAX_INTEGRITY_FILES}-file integrity limit.`, span));
    return undefined;
  }
  const output: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const [path, integrity] of entries) {
    if (!isSafeRelativeVXPath(path) || typeof integrity !== 'string' || !/^sha256-[A-Za-z0-9+/]+={0,2}$/.test(integrity)) {
      diagnostics.push(error('VX_PACKAGE_GENERATED_MANIFEST_FILE_ENTRY', `Invalid generated VX file integrity entry '${path}' in '${manifestPath}'.`, span));
      continue;
    }
    output[path] = integrity;
  }
  return output;
}

function isSafeRelativeVXPath(value: unknown): value is string {
  return typeof value === 'string' &&
    value.startsWith('./') &&
    value.toLowerCase().endsWith('.vx') &&
    !value.includes('\\') &&
    !value.includes('\0') &&
    !value.includes('?') &&
    !value.includes('#') &&
    !isAbsolute(value) &&
    !value.split('/').includes('..');
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
