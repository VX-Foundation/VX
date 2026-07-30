/**
 * Security boundary for VX module discovery. Resolution canonicalizes every
 * filesystem target before graph construction and never trusts lexical paths,
 * package manifests, or import text without validation.
 */
import type {
  ComponentModuleIR,
  ComponentProjectResult,
  Diagnostic,
  ImportDeclaration,
  ProgramNode,
  ResolvedComponentImport,
  SourceSpan
} from '@vx/types';
import { parse } from '@vx/language';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

import { verifyFileIntegrity } from '../package/manifest.js';
import { extractComponentContract, findScriptBlock } from './contract.js';
import { resolveVXPackageImport } from './package-resolver.js';

export interface ResolveComponentProjectOptions {
  rootDir: string;
  frameworkVersion?: string;
  maxModules?: number;
  maxDepth?: number;
  maxFileBytes?: number;
}

const DEFAULT_MAX_MODULES = 512;
const DEFAULT_MAX_DEPTH = 64;
const DEFAULT_MAX_FILE_BYTES = 1024 * 1024;

/**
 * Resolves one entry component into a canonical, cycle-free module graph.
 * All filesystem boundaries are checked after realpath resolution to prevent
 * traversal and symlink escapes.
 */
export function resolveComponentProject(
  entryPath: string,
  options: ResolveComponentProjectOptions
): ComponentProjectResult {
  const diagnostics: Diagnostic[] = [];
  let rootDir: string;
  try {
    rootDir = canonicalDirectory(options.rootDir);
  } catch (cause) {
    diagnostics.push(error(
      'VX_COMPONENT_ROOT',
      `Unable to open VX project root '${options.rootDir}': ${message(cause)}.`,
      emptySpan(options.rootDir)
    ));
    return { diagnostics };
  }
  const entry = resolveEntry(entryPath, rootDir, diagnostics);
  if (!entry) return { diagnostics };

  const modules = new Map<string, ComponentModuleIR>();
  const pathToId = new Map<string, string>();
  const visiting: string[] = [];
  const order: string[] = [];
  const maxModules = options.maxModules ?? DEFAULT_MAX_MODULES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const frameworkVersion = options.frameworkVersion ?? '0.0.0';
  const integrityByPath = new Map<string, string>();

  const load = (
    filePath: string,
    depth: number,
    importSpan?: SourceSpan,
    boundary: string = rootDir
  ): ComponentModuleIR | undefined => {
    if (depth > maxDepth) {
      diagnostics.push(error('VX_COMPONENT_MAX_DEPTH', `Component import depth exceeds the configured limit of ${maxDepth}.`, importSpan ?? emptySpan(filePath)));
      return undefined;
    }

    const existingId = pathToId.get(filePath);
    if (existingId) {
      const cycleIndex = visiting.indexOf(existingId);
      if (cycleIndex >= 0) {
        const chain = [...visiting.slice(cycleIndex), existingId]
          .map((id) => modules.get(id)?.filePath ?? id)
          .join(' -> ');
        diagnostics.push(error('VX_COMPONENT_IMPORT_CYCLE', `Component import cycle detected: ${chain}.`, importSpan ?? emptySpan(filePath)));
      }
      return modules.get(existingId);
    }

    if (modules.size >= maxModules) {
      diagnostics.push(error('VX_COMPONENT_MAX_MODULES', `Component graph exceeds the configured limit of ${maxModules} modules.`, importSpan ?? emptySpan(filePath)));
      return undefined;
    }

    const source = readSource(filePath, maxFileBytes, diagnostics, importSpan, integrityByPath.get(filePath));
    if (source === undefined) return undefined;
    const parsed = parse(source, filePath);
    diagnostics.push(...parsed.diagnostics);
    const contract = extractComponentContract(parsed.ast);
    const module: ComponentModuleIR = {
      id: contract.id,
      filePath,
      source,
      ast: parsed.ast,
      contract,
      imports: []
    };
    modules.set(module.id, module);
    pathToId.set(filePath, module.id);
    visiting.push(module.id);

    for (const declaration of importDeclarations(parsed.ast)) {
      const target = resolveImportTarget(
        filePath,
        declaration,
        boundary,
        frameworkVersion,
        integrityByPath,
        diagnostics
      );
      if (!target) continue;
      const importedModule = load(target.filePath, depth + 1, declaration.span, target.boundary);
      if (!importedModule) continue;
      const resolvedImport = validateImportBindings(declaration, importedModule, diagnostics);
      if (resolvedImport) module.imports.push(resolvedImport);
    }

    visiting.pop();
    order.push(module.id);
    return module;
  };

  const entryModule = load(entry, 0);
  if (!entryModule) return { diagnostics };

  return {
    project: { rootDir, entryId: entryModule.id, modules, order },
    diagnostics
  };
}

function importDeclarations(program: ProgramNode): ImportDeclaration[] {
  return (findScriptBlock(program)?.statements ?? []).filter(
    (statement): statement is ImportDeclaration => statement.kind === 'ImportDeclaration'
  );
}

function validateImportBindings(
  declaration: ImportDeclaration,
  target: ComponentModuleIR,
  diagnostics: Diagnostic[]
): ResolvedComponentImport | undefined {
  const bindings: ResolvedComponentImport['bindings'] = [];

  if (declaration.defaultImport) {
    if (target.contract.kind !== 'component') {
      diagnostics.push(error(
        'VX_COMPONENT_DEFAULT_IMPORT_KIND',
        `Default import '${declaration.defaultImport}' targets a headless module. Default imports are reserved for visual components.`,
        declaration.span
      ));
    } else {
      bindings.push({ local: declaration.defaultImport, imported: 'default' });
    }
  }

  for (const specifier of declaration.specifiers) {
    if (target.contract.kind !== 'headless') {
      diagnostics.push(error(
        'VX_COMPONENT_NAMED_IMPORT_KIND',
        `Named import '${specifier.imported}' targets a visual component. Named imports are reserved for headless VX modules.`,
        specifier.span
      ));
      continue;
    }
    const exported = target.contract.exports.find((item) => item.name === specifier.imported);
    if (!exported) {
      diagnostics.push(error(
        'VX_COMPONENT_UNKNOWN_EXPORT',
        `Module '${declaration.source}' does not export '${specifier.imported}'.`,
        specifier.span
      ));
      continue;
    }
    bindings.push({ local: specifier.local, imported: specifier.imported });
  }

  if (bindings.length === 0) return undefined;
  return {
    source: declaration.source,
    resolvedPath: target.filePath,
    moduleId: target.id,
    moduleKind: target.contract.kind,
    bindings,
    span: declaration.span
  };
}

interface ResolvedImportTarget {
  filePath: string;
  boundary: string;
}

function resolveImportTarget(
  importerPath: string,
  declaration: ImportDeclaration,
  boundary: string,
  frameworkVersion: string,
  integrityByPath: Map<string, string>,
  diagnostics: Diagnostic[]
): ResolvedImportTarget | undefined {
  const specifier = declaration.source;
  if (!isSafeSpecifier(specifier)) {
    diagnostics.push(error(
      'VX_COMPONENT_UNSAFE_IMPORT',
      `Import specifier '${specifier}' is not allowed. VX imports must be static local paths or automatically discovered package modules.`,
      declaration.span
    ));
    return undefined;
  }

  if (specifier.startsWith('.')) {
    const candidate = resolve(dirname(importerPath), specifier);
    const filePath = canonicalVXFile(candidate, boundary, declaration.span, diagnostics, 'module boundary');
    return filePath ? { filePath, boundary } : undefined;
  }

  const resolvedPackage = resolveVXPackageImport(
    specifier,
    importerPath,
    frameworkVersion,
    declaration.span,
    diagnostics
  );
  if (!resolvedPackage) return undefined;
  for (const [filePath, expected] of resolvedPackage.integrity) integrityByPath.set(filePath, expected);
  return { filePath: resolvedPackage.filePath, boundary: resolvedPackage.boundary };
}

function readSource(
  filePath: string,
  maxFileBytes: number,
  diagnostics: Diagnostic[],
  span?: SourceSpan,
  expectedIntegrity?: string
): string | undefined {
  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error('resolved path is not a file');
    if (stats.size > maxFileBytes) {
      diagnostics.push(error(
        'VX_COMPONENT_FILE_SIZE',
        `VX module '${filePath}' exceeds the configured ${maxFileBytes}-byte source limit.`,
        span ?? emptySpan(filePath)
      ));
      return undefined;
    }
    const source = readFileSync(filePath, 'utf8');
    if (expectedIntegrity && !verifyFileIntegrity(source, expectedIntegrity)) {
      diagnostics.push(error(
        'VX_PACKAGE_INTEGRITY_MISMATCH',
        `VX package file '${filePath}' does not match its generated integrity record.`,
        span ?? emptySpan(filePath)
      ));
      return undefined;
    }
    return source;
  } catch (cause) {
    diagnostics.push(error('VX_COMPONENT_READ_ERROR', `Unable to read VX module '${filePath}': ${message(cause)}.`, span ?? emptySpan(filePath)));
    return undefined;
  }
}

function canonicalVXFile(
  candidate: string,
  boundary: string,
  span: SourceSpan,
  diagnostics: Diagnostic[],
  boundaryLabel: string
): string | undefined {
  if (extname(candidate).toLowerCase() !== '.vx') {
    diagnostics.push(error('VX_COMPONENT_EXTENSION', `VX imports must resolve to a '.vx' file: '${candidate}'.`, span));
    return undefined;
  }
  try {
    const real = realpathSync(candidate);
    if (!isWithin(boundary, real)) {
      diagnostics.push(error(
        'VX_COMPONENT_BOUNDARY_ESCAPE',
        `Import resolves outside the ${boundaryLabel}: '${real}'.`,
        span
      ));
      return undefined;
    }
    return real;
  } catch (cause) {
    diagnostics.push(error('VX_COMPONENT_RESOLUTION', `Unable to resolve VX import '${candidate}': ${message(cause)}.`, span));
    return undefined;
  }
}

function resolveEntry(entryPath: string, rootDir: string, diagnostics: Diagnostic[]): string | undefined {
  const candidate = isAbsolute(entryPath) ? entryPath : resolve(rootDir, entryPath);
  return canonicalVXFile(candidate, rootDir, emptySpan(candidate), diagnostics, 'project root');
}

function canonicalDirectory(path: string): string {
  const real = realpathSync(path);
  if (!statSync(real).isDirectory()) throw new Error(`VX project root is not a directory: ${path}`);
  return real;
}

function isSafeSpecifier(specifier: string): boolean {
  return Boolean(specifier) &&
    !specifier.includes('\0') &&
    !specifier.includes('\\') &&
    !specifier.includes('?') &&
    !specifier.includes('#') &&
    !isAbsolute(specifier) &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(specifier);
}

function isWithin(boundary: string, candidate: string): boolean {
  const rel = relative(boundary, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function emptySpan(filePath: string): SourceSpan {
  const position = { line: 1, column: 1, offset: 0 };
  return { filePath, start: position, end: position };
}

function error(code: string, messageText: string, span: SourceSpan): Diagnostic {
  return { code, message: messageText, severity: 'error', span };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
