/**
 * Convention-based public API discovery for VX libraries. Discovery is closed
 * by default: only known public source surfaces are exposed, while internal
 * files remain available to the package implementation graph.
 */
import type { Diagnostic, SourceSpan } from '@vx/types';
import { existsSync, lstatSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import {
  VX_PUBLIC_SOURCE_DIRECTORIES,
  isPrivatePackagePath,
  publicExportKey,
  rootExportKey
} from './conventions.js';
import type {
  VXPackageDiscoveryOptions,
  VXPackageDiscoveryResult,
  VXPackagePublicEntry
} from './types.js';

const DEFAULT_MAX_PUBLIC_FILES = 2048;
const DEFAULT_MAX_DIRECTORY_DEPTH = 32;

export function discoverVXPackagePublicAPI(
  rootPath: string,
  options: VXPackageDiscoveryOptions = {}
): VXPackageDiscoveryResult {
  const diagnostics: Diagnostic[] = [];
  const rootDir = canonicalDirectory(rootPath, diagnostics);
  if (!rootDir) return { rootDir: resolve(rootPath), sourceDir: resolve(rootPath, 'src'), entries: [], diagnostics };

  const sourceDir = join(rootDir, 'src');
  if (!existsSync(sourceDir) || !statSync(sourceDir).isDirectory()) {
    diagnostics.push(error(
      'VX_PACKAGE_SOURCE_DIRECTORY',
      `VX library '${rootDir}' must contain a 'src' directory.`,
      sourceDir
    ));
    return { rootDir, sourceDir, entries: [], diagnostics };
  }

  const maxPublicFiles = options.maxPublicFiles ?? DEFAULT_MAX_PUBLIC_FILES;
  const maxDirectoryDepth = options.maxDirectoryDepth ?? DEFAULT_MAX_DIRECTORY_DEPTH;
  const candidates: Array<{ exportKey: string; absolutePath: string }> = [];
  const rootEntry = join(sourceDir, 'index.vx');
  if (existsSync(rootEntry)) candidates.push({ exportKey: '.', absolutePath: rootEntry });

  for (const directoryName of VX_PUBLIC_SOURCE_DIRECTORIES) {
    const publicRoot = join(sourceDir, directoryName);
    if (!existsSync(publicRoot)) continue;
    const rootStats = lstatSync(publicRoot);
    if (rootStats.isSymbolicLink()) {
      diagnostics.push(error(
        'VX_PACKAGE_PUBLIC_SYMLINK',
        `Public package surface '${publicRoot}' cannot be a symbolic link.`,
        publicRoot
      ));
      continue;
    }
    if (!rootStats.isDirectory()) continue;
    walkPublicSurface(publicRoot, publicRoot, 0, maxDirectoryDepth, maxPublicFiles, candidates, diagnostics);
  }

  const entries = validateCandidates(rootDir, sourceDir, candidates, maxPublicFiles, diagnostics);
  if (entries.length === 0 && diagnostics.every((item) => item.severity !== 'error')) {
    diagnostics.push(error(
      'VX_PACKAGE_NO_PUBLIC_ENTRIES',
      `VX library '${rootDir}' does not expose any conventional public VX modules. Add 'src/index.vx' or place modules under a public source directory.`,
      sourceDir
    ));
  }

  return { rootDir, sourceDir, entries, diagnostics };
}

function walkPublicSurface(
  publicRoot: string,
  directory: string,
  depth: number,
  maxDepth: number,
  maxFiles: number,
  output: Array<{ exportKey: string; absolutePath: string }>,
  diagnostics: Diagnostic[]
): void {
  if (depth > maxDepth) {
    diagnostics.push(error(
      'VX_PACKAGE_DISCOVERY_DEPTH',
      `VX package public API discovery exceeds the configured directory depth of ${maxDepth}.`,
      directory
    ));
    return;
  }

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = join(directory, entry.name);
    const relativePath = relative(publicRoot, absolutePath);
    if (isPrivatePackagePath(relativePath)) continue;

    const stats = lstatSync(absolutePath);
    if (stats.isSymbolicLink()) {
      diagnostics.push(error(
        'VX_PACKAGE_PUBLIC_SYMLINK',
        `Public package surface '${absolutePath}' cannot be a symbolic link.`,
        absolutePath
      ));
      continue;
    }
    if (stats.isDirectory()) {
      walkPublicSurface(publicRoot, absolutePath, depth + 1, maxDepth, maxFiles, output, diagnostics);
      continue;
    }
    if (!stats.isFile() || !entry.name.toLowerCase().endsWith('.vx')) continue;
    if (output.length >= maxFiles) {
      diagnostics.push(error(
        'VX_PACKAGE_PUBLIC_FILE_LIMIT',
        `VX package public API exceeds the configured limit of ${maxFiles} files.`,
        absolutePath
      ));
      return;
    }
    const exportKey = publicExportKey(publicRoot, absolutePath);
    if (exportKey) output.push({ exportKey, absolutePath });
  }
}

function validateCandidates(
  rootDir: string,
  sourceDir: string,
  candidates: Array<{ exportKey: string; absolutePath: string }>,
  maxFiles: number,
  diagnostics: Diagnostic[]
): VXPackagePublicEntry[] {
  const entries: VXPackagePublicEntry[] = [];
  const keyOwners = new Map<string, string>();

  for (const candidate of candidates.slice(0, maxFiles)) {
    let canonical: string;
    try {
      const sourceStats = lstatSync(candidate.absolutePath);
      if (sourceStats.isSymbolicLink() || !sourceStats.isFile()) {
        diagnostics.push(error(
          'VX_PACKAGE_PUBLIC_SYMLINK',
          `Public package entry '${candidate.absolutePath}' must be a regular file and cannot be a symbolic link.`,
          candidate.absolutePath
        ));
        continue;
      }
      canonical = realpathSync(candidate.absolutePath);
    } catch (cause) {
      diagnostics.push(error(
        'VX_PACKAGE_PUBLIC_ENTRY_RESOLUTION',
        `Unable to resolve public VX entry '${candidate.absolutePath}': ${message(cause)}.`,
        candidate.absolutePath
      ));
      continue;
    }
    if (!isWithin(rootDir, canonical)) {
      diagnostics.push(error(
        'VX_PACKAGE_PUBLIC_ENTRY_ESCAPE',
        `Public VX entry resolves outside the package root: '${canonical}'.`,
        candidate.absolutePath
      ));
      continue;
    }

    const exportKey = rootExportKey(sourceDir, canonical) ?? candidate.exportKey;
    const previous = keyOwners.get(exportKey);
    if (previous) {
      diagnostics.push(error(
        'VX_PACKAGE_EXPORT_COLLISION',
        `Public VX modules '${previous}' and '${canonical}' both resolve to package export '${exportKey}'.`,
        canonical
      ));
      continue;
    }
    keyOwners.set(exportKey, canonical);
    entries.push({
      exportKey,
      absolutePath: canonical,
      sourcePath: `./${relative(rootDir, canonical).replaceAll('\\', '/')}`
    });
  }

  return entries.sort((left, right) => left.exportKey.localeCompare(right.exportKey));
}

function canonicalDirectory(path: string, diagnostics: Diagnostic[]): string | undefined {
  try {
    const real = realpathSync(path);
    if (!statSync(real).isDirectory()) throw new Error('path is not a directory');
    return real;
  } catch (cause) {
    diagnostics.push(error('VX_PACKAGE_ROOT', `Unable to open VX package root '${path}': ${message(cause)}.`, path));
    return undefined;
  }
}

function isWithin(boundary: string, candidate: string): boolean {
  const result = relative(boundary, candidate);
  return result === '' || (!result.startsWith(`..${sep}`) && result !== '..');
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
