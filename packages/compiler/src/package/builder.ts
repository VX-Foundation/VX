/**
 * Builds a publication-ready VX package staging directory. The builder owns
 * generated export maps, framework metadata, integrity records, and source
 * selection so library authors never maintain infrastructure manifests.
 */
import type { Diagnostic, SourceSpan } from '@vx-foundation/types';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { compileComponentProject } from '../project.js';
import { discoverVXPackagePublicAPI } from './discovery.js';
import { createFileIntegrity, VX_GENERATED_MANIFEST_FILE } from './manifest.js';
import {
  VX_PACKAGE_MANIFEST_SCHEMA,
  VX_PACKAGE_MANIFEST_VERSION
} from './types.js';
import type {
  BuildVXPackageOptions,
  BuildVXPackageResult,
  VXGeneratedPackageManifest,
  VXPackagePublicEntry
} from './types.js';

const MAX_PACKAGE_JSON_BYTES = 256 * 1024;
const COPY_METADATA_FILES = ['README.md', 'LICENSE', 'LICENSE.md'];

interface SourcePackageDescriptor extends Record<string, unknown> {
  name: string;
  version: string;
}

export function buildVXPackage(
  rootPath: string,
  options: BuildVXPackageOptions = {}
): BuildVXPackageResult {
  const discovery = discoverVXPackagePublicAPI(rootPath, options);
  const diagnostics = [...discovery.diagnostics];
  const rootDir = discovery.rootDir;
  const outDir = resolveOutputDirectory(rootDir, options.outDir, diagnostics);
  const result: BuildVXPackageResult = {
    rootDir,
    outDir,
    publicEntries: discovery.entries,
    copiedModules: [],
    diagnostics
  };
  if (hasErrors(diagnostics) || !outDir) return result;

  const descriptor = readSourcePackageDescriptor(rootDir, diagnostics);
  if (!descriptor || hasErrors(diagnostics)) return result;
  const frameworkVersion = options.frameworkVersion ?? '0.0.0';
  const modulePaths = validatePublicEntries(discovery.entries, rootDir, frameworkVersion, options, diagnostics);
  if (hasErrors(diagnostics)) return result;

  const integrity = createIntegrityMap(rootDir, modulePaths, diagnostics);
  if (hasErrors(diagnostics)) return result;
  const manifest = createManifest(descriptor, frameworkVersion, discovery.entries, modulePaths, rootDir, integrity);

  prepareOutputDirectory(rootDir, outDir, diagnostics);
  if (hasErrors(diagnostics)) return result;
  copyPackageModules(rootDir, outDir, modulePaths, result.copiedModules, diagnostics);
  copyPackageMetadata(rootDir, outDir, diagnostics);
  if (hasErrors(diagnostics)) return result;

  writeFileSync(join(outDir, VX_GENERATED_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  writeFileSync(join(outDir, 'package.json'), `${JSON.stringify(createDistributionPackageJson(descriptor, frameworkVersion, manifest), null, 2)}\n`, 'utf8');
  result.manifest = manifest;
  return result;
}

function validatePublicEntries(
  entries: VXPackagePublicEntry[],
  rootDir: string,
  frameworkVersion: string,
  options: BuildVXPackageOptions,
  diagnostics: Diagnostic[]
): string[] {
  const modules = new Set<string>();
  for (const entry of entries) {
    const build = compileComponentProject(entry.absolutePath, {
      rootDir,
      frameworkVersion,
      ...(options.maxModules !== undefined ? { maxModules: options.maxModules } : {}),
      ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
      ...(options.maxFileBytes !== undefined ? { maxFileBytes: options.maxFileBytes } : {}),
      failFast: true
    });
    diagnostics.push(...build.diagnostics);
    for (const artifact of build.artifacts.values()) {
      if (isWithin(rootDir, artifact.filePath)) modules.add(artifact.filePath);
    }
  }
  return [...modules].sort();
}

function createIntegrityMap(
  rootDir: string,
  modulePaths: readonly string[],
  diagnostics: Diagnostic[]
): Record<string, string> {
  const files: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const modulePath of modulePaths) {
    try {
      const stats = lstatSync(modulePath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        diagnostics.push(error('VX_PACKAGE_SOURCE_FILE_TYPE', `Package module '${modulePath}' must be a regular file.`, modulePath));
        continue;
      }
      const relativePath = `./${relative(rootDir, modulePath).replaceAll('\\', '/')}`;
      files[relativePath] = createFileIntegrity(readFileSync(modulePath));
    } catch (cause) {
      diagnostics.push(error('VX_PACKAGE_SOURCE_READ', `Unable to read package module '${modulePath}': ${message(cause)}.`, modulePath));
    }
  }
  return files;
}

function createManifest(
  descriptor: SourcePackageDescriptor,
  frameworkVersion: string,
  entries: readonly VXPackagePublicEntry[],
  modulePaths: readonly string[],
  rootDir: string,
  files: Record<string, string>
): VXGeneratedPackageManifest {
  const exportsMap: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const entry of entries) exportsMap[entry.exportKey] = entry.sourcePath;
  const publicPaths = new Set(entries.map((entry) => `./${entry.sourcePath.replace(/^\.\//, '')}`));
  const privateModules = modulePaths.map((modulePath) => `./${relative(rootDir, modulePath).replaceAll('\\', '/')}`).filter((modulePath) => !publicPaths.has(modulePath)).sort();
  const publicContracts = Object.fromEntries(entries.map((entry) => [entry.exportKey, files[`./${entry.sourcePath.replace(/^\.\//, '')}`] ?? '']));
  const packageVX = isRecord(descriptor['vx']) ? descriptor['vx'] : {};
  const deprecation = isRecord(packageVX['deprecation']) && typeof packageVX['deprecation']['message'] === 'string'
    ? packageVX['deprecation'] as VXGeneratedPackageManifest['deprecation']
    : undefined;
  const migrations = Array.isArray(packageVX['migrations']) ? packageVX['migrations'].filter(isMigration) : undefined;
  return {
    schema: VX_PACKAGE_MANIFEST_SCHEMA,
    manifestVersion: VX_PACKAGE_MANIFEST_VERSION,
    generated: true,
    package: { name: descriptor.name, version: descriptor.version },
    framework: { compiler: exactFrameworkRange(frameworkVersion) },
    exports: exportsMap,
    privateModules,
    publicContracts,
    files,
    ...(deprecation ? { deprecation } : {}),
    ...(migrations?.length ? { migrations } : {})
  };
}

function createDistributionPackageJson(
  descriptor: SourcePackageDescriptor,
  frameworkVersion: string,
  manifest: VXGeneratedPackageManifest
): Record<string, unknown> {
  const output: Record<string, unknown> = {
    name: descriptor.name,
    version: descriptor.version,
    type: 'module',
    files: ['src', VX_GENERATED_MANIFEST_FILE],
    exports: manifest.exports,
    vx: {
      generatedManifest: `./${VX_GENERATED_MANIFEST_FILE}`,
      schema: VX_PACKAGE_MANIFEST_VERSION
    }
  };

  for (const field of ['description', 'license', 'author', 'repository', 'homepage', 'bugs', 'keywords', 'funding', 'sideEffects']) {
    if (descriptor[field] !== undefined) output[field] = descriptor[field];
  }
  for (const field of ['dependencies', 'optionalDependencies']) {
    if (isRecord(descriptor[field])) output[field] = descriptor[field];
  }

  const peerDependencies = isRecord(descriptor['peerDependencies'])
    ? { ...descriptor['peerDependencies'] }
    : {};
  peerDependencies['@vx-foundation/runtime'] = exactFrameworkRange(frameworkVersion);
  output['peerDependencies'] = peerDependencies;
  return output;
}

function copyPackageModules(
  rootDir: string,
  outDir: string,
  modulePaths: readonly string[],
  copiedModules: string[],
  diagnostics: Diagnostic[]
): void {
  for (const modulePath of modulePaths) {
    if (!isWithin(rootDir, modulePath)) {
      diagnostics.push(error('VX_PACKAGE_COPY_ESCAPE', `Package module '${modulePath}' is outside the package root.`, modulePath));
      continue;
    }
    const relativePath = relative(rootDir, modulePath);
    const target = join(outDir, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(modulePath, target);
    copiedModules.push(relativePath.replaceAll('\\', '/'));
  }
}

function copyPackageMetadata(rootDir: string, outDir: string, diagnostics: Diagnostic[]): void {
  for (const name of COPY_METADATA_FILES) {
    const source = join(rootDir, name);
    if (!existsSync(source)) continue;
    try {
      const stats = lstatSync(source);
      if (stats.isSymbolicLink() || !stats.isFile()) throw new Error('metadata path must be a regular file');
      copyFileSync(source, join(outDir, name));
    } catch (cause) {
      diagnostics.push(error('VX_PACKAGE_METADATA_COPY', `Unable to copy package metadata '${source}': ${message(cause)}.`, source));
    }
  }
}

function prepareOutputDirectory(rootDir: string, outDir: string, diagnostics: Diagnostic[]): void {
  if (!isWithin(rootDir, outDir) || outDir === rootDir) {
    diagnostics.push(error(
      'VX_PACKAGE_OUTPUT_BOUNDARY',
      `VX package output '${outDir}' must be a dedicated directory inside the package root.`,
      outDir
    ));
    return;
  }
  if (containsSymlink(rootDir, outDir, diagnostics)) return;
  try {
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
  } catch (cause) {
    diagnostics.push(error('VX_PACKAGE_OUTPUT_PREPARE', `Unable to prepare package output '${outDir}': ${message(cause)}.`, outDir));
  }
}

function containsSymlink(rootDir: string, outDir: string, diagnostics: Diagnostic[]): boolean {
  const relativeOutput = relative(rootDir, outDir);
  let current = rootDir;
  for (const segment of relativeOutput.split(/[\\/]+/).filter(Boolean)) {
    current = join(current, segment);
    if (!existsSync(current)) continue;
    const stats = lstatSync(current);
    if (!stats.isSymbolicLink()) continue;
    diagnostics.push(error(
      'VX_PACKAGE_OUTPUT_SYMLINK',
      `VX package output path contains a symbolic link: '${current}'.`,
      current
    ));
    return true;
  }
  return false;
}

function resolveOutputDirectory(
  rootDir: string,
  configured: string | undefined,
  diagnostics: Diagnostic[]
): string {
  const candidate = configured
    ? isAbsolute(configured) ? configured : resolve(rootDir, configured)
    : join(rootDir, '.vx', 'package');
  if (candidate === rootDir) {
    diagnostics.push(error('VX_PACKAGE_OUTPUT_ROOT', 'VX package output cannot replace the package root.', candidate));
  }
  return candidate;
}

function readSourcePackageDescriptor(rootDir: string, diagnostics: Diagnostic[]): SourcePackageDescriptor | undefined {
  const path = join(rootDir, 'package.json');
  try {
    const stats = statSync(path);
    if (!stats.isFile()) throw new Error('package.json is not a file');
    if (stats.size > MAX_PACKAGE_JSON_BYTES) throw new Error(`package.json exceeds ${MAX_PACKAGE_JSON_BYTES} bytes`);
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!isRecord(parsed)) throw new Error('package.json root must be an object');
    if (typeof parsed['name'] !== 'string' || parsed['name'].trim() === '') throw new Error('package name is required');
    if (typeof parsed['version'] !== 'string' || parsed['version'].trim() === '') throw new Error('package version is required');
    return { ...parsed, name: parsed['name'], version: parsed['version'] };
  } catch (cause) {
    diagnostics.push(error('VX_PACKAGE_DESCRIPTOR', `Unable to read package metadata '${path}': ${message(cause)}.`, path));
    return undefined;
  }
}

function exactFrameworkRange(version: string): string {
  return version.trim();
}

function isWithin(boundary: string, candidate: string): boolean {
  const result = relative(boundary, candidate);
  return result === '' || (!result.startsWith(`..${sep}`) && result !== '..' && !isAbsolute(result));
}

function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function error(code: string, messageText: string, filePath: string): Diagnostic {
  return { code, message: messageText, severity: 'error', span: emptySpan(filePath) };
}

function emptySpan(filePath: string): SourceSpan {
  const position = { line: 1, column: 1, offset: 0 };
  return { filePath, start: position, end: position };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isMigration(value: unknown): value is NonNullable<VXGeneratedPackageManifest['migrations']>[number] {
  return isRecord(value) && typeof value['from'] === 'string' && typeof value['to'] === 'string' && typeof value['automatic'] === 'boolean'
    && (value['command'] === undefined || typeof value['command'] === 'string')
    && (value['documentation'] === undefined || typeof value['documentation'] === 'string');
}
