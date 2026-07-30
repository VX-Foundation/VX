import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { assertInteropBoundary } from './contracts.js';
import type { InteropEnvironment, ResolvedInteropPackage } from './types.js';

export interface ResolveInteropPackageOptions {
  importerRoot: string;
  importerEnvironment: InteropEnvironment;
  loadDeclarations?: boolean;
  conditions?: readonly string[];
}

export function resolveNpmInteropPackage(specifier: string, options: ResolveInteropPackageOptions): ResolvedInteropPackage {
  const packageName = packageNameOf(specifier);
  const importerRoot = realpathSync(resolve(options.importerRoot));
  const packageRoot = locatePackageRoot(importerRoot, packageName);
  const manifestPath = join(packageRoot, 'package.json');
  const manifest = readJsonObject(manifestPath);
  if (manifest['name'] !== packageName) throw new Error(`Installed package at '${packageRoot}' declares '${String(manifest['name'])}', expected '${packageName}'.`);
  const subpath = subpathOf(specifier, packageName);
  const packageVersion = typeof manifest['version'] === 'string' ? manifest['version'] : '0.0.0';
  const environment = interopEnvironment(manifest, subpath);
  const conditions = conditionsFor(options.importerEnvironment, options.conditions);
  const entry = resolveImportEntry(packageRoot, manifest, subpath, conditions);
  assertInteropBoundary(options.importerEnvironment, environment, specifier);
  const declarationsPath = resolveDeclarations(packageRoot, manifest, subpath, entry, conditions);
  const loadDeclarations = options.loadDeclarations ?? true;
  const declarations = loadDeclarations && declarationsPath ? readDeclaration(declarationsPath, packageRoot) : undefined;
  const sideEffects = sideEffectsOf(manifest, packageRoot, entry);
  return Object.freeze({
    specifier,
    packageName,
    packageVersion,
    packageRoot,
    entry,
    ...(declarationsPath ? { declarationsPath } : {}),
    ...(declarations !== undefined ? { declarations } : {}),
    environment,
    sideEffects,
    treeShakable: !sideEffects,
    usedConditions: Object.freeze(conditions)
  });
}

function packageNameOf(specifier: string): string {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('node:') || /^(?:https?|data):/i.test(specifier) || /[\0\r\n\\]/.test(specifier)) throw new TypeError(`Interop npm specifier '${specifier}' must be a bare package import.`);
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? `${parts[0] ?? ''}/${parts[1] ?? ''}` : parts[0] ?? '';
  if (!/^(?:@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*|[a-z0-9][a-z0-9._-]*)$/i.test(name)) throw new TypeError(`Invalid npm package specifier '${specifier}'.`);
  return name;
}
function subpathOf(specifier: string, packageName: string): string { const suffix = specifier.slice(packageName.length).replace(/^\//, ''); return suffix ? `./${suffix}` : '.'; }

function locatePackageRoot(importerRoot: string, packageName: string): string {
  let directory = importerRoot;
  for (;;) {
    const candidate = join(directory, 'node_modules', ...packageName.split('/'));
    if (existsSync(join(candidate, 'package.json'))) {
      const real = realpathSync(candidate);
      if (!lstatSync(real).isDirectory()) throw new Error(`Installed package '${packageName}' is not a directory.`);
      return real;
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  throw new Error(`Unable to locate installed npm package '${packageName}' from '${importerRoot}'.`);
}

function resolveImportEntry(packageRoot: string, manifest: Record<string, unknown>, subpath: string, conditions: readonly string[]): string {
  const fromExports = resolveExportTarget(manifest['exports'], subpath, conditions);
  const browserFallback = conditions.includes('browser') && subpath === '.' ? browserEntry(manifest['browser']) : undefined;
  const fallback = subpath === '.' ? browserFallback ?? string(manifest['module']) ?? string(manifest['main']) ?? './index.js' : subpath;
  const target = fromExports ?? fallback;
  if (target === null) throw new Error(`Package '${String(manifest['name'] ?? packageRoot)}' explicitly blocks export '${subpath}'.`);
  const path = safePackagePath(packageRoot, target);
  for (const candidate of entryCandidates(path)) {
    if (!existsSync(candidate)) continue;
    const stats = lstatSync(candidate);
    if (stats.isSymbolicLink() || !stats.isFile()) continue;
    const real = realpathSync(candidate);
    if (!within(real, packageRoot)) throw new Error(`Resolved import entry '${subpath}' escapes its package root.`);
    return real;
  }
  throw new Error(`Unable to resolve import entry '${subpath}' for package '${String(manifest['name'] ?? packageRoot)}'.`);
}

function resolveDeclarations(packageRoot: string, manifest: Record<string, unknown>, subpath: string, entry: string, conditions: readonly string[]): string | undefined {
  const exportDeclaration = resolveExportTarget(manifest['exports'], subpath, ['types', ...conditions]);
  const rootDeclaration = subpath === '.' ? string(manifest['types']) ?? string(manifest['typings']) : undefined;
  const versionsDeclaration = resolveTypesVersions(manifest['typesVersions'], subpath);
  for (const candidate of [exportDeclaration, versionsDeclaration, rootDeclaration]) {
    if (!candidate) continue;
    const path = safePackagePath(packageRoot, candidate);
    if (existsSync(path) && lstatSync(path).isFile()) {
      const real = realpathSync(path);
      if (within(real, packageRoot)) return real;
    }
  }
  const extension = extname(entry);
  const base = extension ? entry.slice(0, -extension.length) : entry;
  for (const candidate of [`${base}.d.ts`, `${base}.d.mts`, `${base}.d.cts`, join(dirname(entry), 'index.d.ts')]) {
    if (existsSync(candidate) && lstatSync(candidate).isFile()) {
      const real = realpathSync(candidate);
      if (within(real, packageRoot)) return real;
    }
  }
  return undefined;
}

function resolveExportTarget(exportsValue: unknown, subpath: string, conditions: readonly string[]): string | null | undefined {
  if (typeof exportsValue === 'string' || exportsValue === null || Array.isArray(exportsValue)) return subpath === '.' ? resolveCondition(exportsValue, conditions) : undefined;
  if (!record(exportsValue)) return undefined;
  const keys = Object.keys(exportsValue);
  const hasSubpaths = keys.some((key) => key.startsWith('.'));
  if (!hasSubpaths) return subpath === '.' ? resolveCondition(exportsValue, conditions) : undefined;
  if (Object.prototype.hasOwnProperty.call(exportsValue, subpath)) return resolveCondition(exportsValue[subpath], conditions);
  const patterns = keys.filter((key) => key.includes('*')).sort((left, right) => specificity(right) - specificity(left) || left.localeCompare(right));
  for (const pattern of patterns) {
    const [prefix, suffix] = pattern.split('*');
    if (prefix === undefined || suffix === undefined || !subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const capture = subpath.slice(prefix.length, subpath.length - suffix.length);
    const target = resolveCondition(exportsValue[pattern], conditions);
    return typeof target === 'string' ? target.replaceAll('*', capture) : target;
  }
  return undefined;
}

function resolveCondition(value: unknown, conditions: readonly string[]): string | null | undefined {
  if (value === null || typeof value === 'string') return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      try {
        const target = resolveCondition(item, conditions);
        if (target !== undefined) return target;
      } catch { /* try next fallback */ }
    }
    return undefined;
  }
  if (!record(value)) return undefined;
  for (const condition of [...conditions, 'default']) {
    if (!Object.prototype.hasOwnProperty.call(value, condition)) continue;
    const target = resolveCondition(value[condition], conditions);
    if (target !== undefined) return target;
  }
  return undefined;
}

function resolveTypesVersions(value: unknown, subpath: string): string | undefined {
  if (!record(value)) return undefined;
  const ranges = Object.keys(value).sort((left, right) => left === '*' ? 1 : right === '*' ? -1 : left.localeCompare(right));
  for (const range of ranges) {
    const mappings = value[range];
    if (!record(mappings)) continue;
    const request = subpath === '.' ? '' : subpath.slice(2);
    const patterns = Object.keys(mappings).sort((left, right) => specificity(right) - specificity(left));
    for (const pattern of patterns) {
      const capture = matchPattern(pattern, request);
      if (capture === undefined) continue;
      const targets = mappings[pattern];
      if (!Array.isArray(targets)) continue;
      const candidate = targets.find((item): item is string => typeof item === 'string');
      if (candidate) return candidate.replaceAll('*', capture);
    }
  }
  return undefined;
}

function sideEffectsOf(manifest: Record<string, unknown>, packageRoot: string, entry: string): boolean {
  const value = manifest['sideEffects'];
  if (value === false) return false;
  if (!Array.isArray(value)) return true;
  const relativeEntry = relative(packageRoot, entry).replaceAll('\\', '/');
  return value.some((pattern) => typeof pattern === 'string' && globMatch(relativeEntry, pattern.replace(/^\.\//, '')));
}

function interopEnvironment(manifest: Record<string, unknown>, subpath: string): InteropEnvironment {
  const vx = object(manifest['vx']);
  const interop = object(vx?.['interop']);
  const exports = object(interop?.['exports']);
  const subpathConfig = object(exports?.[subpath]);
  const candidate = subpathConfig?.['environment'] ?? interop?.['environment'];
  if (isEnvironment(candidate)) return candidate;
  if (manifest['browser'] !== undefined && manifest['browser'] !== false) return 'browser';
  return 'universal';
}

function conditionsFor(environment: InteropEnvironment, extra: readonly string[] | undefined): string[] {
  const base = environment === 'browser' || environment === 'client'
    ? ['browser', 'development', 'import']
    : environment === 'node' || environment === 'server'
      ? ['node', 'development', 'import']
      : ['import'];
  return [...new Set([...(extra ?? []), ...base])].filter((condition) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(condition));
}
function browserEntry(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
function entryCandidates(path: string): string[] { return [path, `${path}.js`, `${path}.mjs`, `${path}.cjs`, `${path}.json`, join(path, 'index.js'), join(path, 'index.mjs'), join(path, 'index.cjs')]; }
function readDeclaration(path: string, packageRoot: string): string {
  const real = realpathSync(path);
  if (!within(real, packageRoot)) throw new Error(`Declaration '${path}' escapes its package root.`);
  const stats = statSync(real);
  if (!stats.isFile() || stats.size > 8 * 1024 * 1024) throw new Error(`Declaration '${path}' is not a regular file under 8 MiB.`);
  return readFileSync(real, 'utf8');
}
function safePackagePath(packageRoot: string, value: string): string {
  if (!value || !value.startsWith('./') || value.startsWith('/') || value.startsWith('\\') || value.includes('\\') || value.split('/').includes('..') || /[\0\r\n]/.test(value)) throw new Error(`Unsafe package path '${value}'.`);
  const path = resolve(packageRoot, value);
  if (!within(path, packageRoot)) throw new Error(`Package path '${value}' escapes its package root.`);
  return path;
}
function matchPattern(pattern: string, value: string): string | undefined {
  if (!pattern.includes('*')) return pattern === value ? '' : undefined;
  const [prefix, suffix] = pattern.split('*');
  if (prefix === undefined || suffix === undefined || !value.startsWith(prefix) || !value.endsWith(suffix)) return undefined;
  return value.slice(prefix.length, value.length - suffix.length);
}
function globMatch(value: string, pattern: string): boolean {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === '*') {
      if (pattern[index + 1] === '*') { source += '.*'; index += 1; } else source += '[^/]*';
    } else if (char === '?') source += '[^/]';
    else source += '\\^$+?.()|{}[]'.includes(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`).test(value);
}
function specificity(value: string): number { return value.replaceAll('*', '').length; }
function within(path: string, root: string): boolean { return path === root || path.startsWith(`${root}${sep}`); }
function readJsonObject(path: string): Record<string, unknown> {
  const stats = statSync(path);
  if (!stats.isFile() || stats.size > 1024 * 1024) throw new Error(`Package manifest '${path}' is not a regular file under 1 MiB.`);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!record(value)) throw new TypeError(`Package manifest '${path}' must be an object.`);
  return value;
}
function isEnvironment(value: unknown): value is InteropEnvironment { return value === 'universal' || value === 'browser' || value === 'client' || value === 'node' || value === 'server'; }
function object(value: unknown): Record<string, unknown> | undefined { return record(value) ? value : undefined; }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function string(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
