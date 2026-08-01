import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PluginManifest } from '@vx-foundation/types';

const MAX_FILES = 20_000;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const IGNORED = new Set(['node_modules', '.git', '.hg', '.svn', '.cache', 'coverage']);
const IGNORED_FILES = new Set(['vx.plugin.json']);

export interface PluginSourceSnapshot {
  integrity: string;
  packageRoot: string;
  allowedRoots: readonly string[];
  allowedFiles: readonly string[];
  manifest?: PluginManifest;
}

export function snapshotPluginSource(moduleUrl: string, projectRootInput: string): PluginSourceSnapshot {
  const projectRoot = realpathSync(resolve(projectRootInput));
  const entry = realpathSync(fileURLToPath(moduleUrl));
  const packageRoot = findPackageRoot(entry, projectRoot);
  const files = packageRoot === projectRoot ? collectModuleGraph(entry, packageRoot) : collectPackageFiles(packageRoot);
  const hash = createHash('sha512');
  for (const path of files.sort()) {
    const relativePath = relative(packageRoot, path).replaceAll('\\', '/');
    const content = readFileSync(path);
    hash.update(relativePath); hash.update('\0'); hash.update(content); hash.update('\0');
  }
  const dependencyRoots = resolveDependencyRoots(packageRoot, projectRoot);
  const localPlugin = packageRoot === projectRoot;
  const manifest = readDetachedManifest(packageRoot);
  return Object.freeze({
    integrity: `sha512-${hash.digest('base64')}`,
    packageRoot,
    allowedRoots: Object.freeze(localPlugin ? dependencyRoots : [packageRoot, ...dependencyRoots]),
    allowedFiles: Object.freeze(localPlugin ? files.map((path) => realpathSync(path)).sort() : []),
    ...(manifest ? { manifest } : {})
  });
}


function readDetachedManifest(packageRoot: string): PluginManifest | undefined {
  const path = resolve(packageRoot, 'vx.plugin.json');
  if (!existsSync(path)) return undefined;
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.size > 1024 * 1024) throw new Error(`Detached plugin manifest '${path}' is invalid.`);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Detached plugin manifest '${path}' must be an object.`);
  return Object.freeze(value as PluginManifest);
}

function collectPackageFiles(root: string): string[] {
  const files: string[] = [];
  let total = 0;
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (IGNORED.has(entry.name) || IGNORED_FILES.has(entry.name)) continue;
      const path = resolve(directory, entry.name);
      const stats = lstatSync(path);
      if (stats.isSymbolicLink()) throw new Error(`Plugin package contains symbolic link '${relative(root, path)}'.`);
      if (stats.isDirectory()) { visit(path); continue; }
      if (!stats.isFile()) continue;
      if (stats.size > MAX_FILE_BYTES) throw new Error(`Plugin file '${relative(root, path)}' exceeds ${MAX_FILE_BYTES} bytes.`);
      total += stats.size;
      if (total > MAX_TOTAL_BYTES) throw new Error(`Plugin package exceeds ${MAX_TOTAL_BYTES} bytes.`);
      files.push(realpathSync(path));
      if (files.length > MAX_FILES) throw new Error(`Plugin package exceeds ${MAX_FILES} files.`);
    }
  };
  visit(root);
  return files;
}

function collectModuleGraph(entry: string, root: string): string[] {
  const files = new Set<string>();
  const visit = (path: string): void => {
    const real = realpathSync(path);
    if (!within(real, root) || files.has(real)) return;
    const stats = statSync(real);
    if (!stats.isFile() || stats.size > MAX_FILE_BYTES) throw new Error(`Plugin module '${relative(root, real)}' is invalid.`);
    files.add(real);
    if (files.size > 4096) throw new Error('Local plugin module graph exceeds 4096 files.');
    const source = readFileSync(real, 'utf8');
    for (const specifier of literalImports(source)) {
      if (!specifier.startsWith('.')) continue;
      const resolved = resolveRelativeModule(dirname(real), specifier);
      if (resolved) visit(resolved);
    }
  };
  visit(entry);
  const manifest = findManifest(entry, root);
  if (manifest) files.add(manifest);
  return [...files];
}

function resolveDependencyRoots(packageRoot: string, projectRoot: string): string[] {
  const roots = new Set<string>();
  const queue = [packageRoot];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const root = queue.shift()!;
    if (visited.has(root) || visited.size > 2048) continue;
    visited.add(root);
    const manifestPath = resolve(root, 'package.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = readJson(manifestPath);
    const names = new Set<string>();
    for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const group = manifest[field];
      if (group && typeof group === 'object' && !Array.isArray(group)) for (const name of Object.keys(group)) names.add(name);
    }
    for (const name of [...names].sort()) {
      const dependencyRoot = locateDependencyRoot(root, name);
      if (!dependencyRoot) continue;
      if (!within(dependencyRoot, projectRoot) && !dependencyRoot.includes(`${sep}node_modules${sep}`)) continue;
      if (!roots.has(dependencyRoot)) { roots.add(dependencyRoot); queue.push(dependencyRoot); }
    }
  }
  return [...roots].sort();
}


function locateDependencyRoot(fromRoot: string, packageName: string): string | undefined {
  let directory = fromRoot;
  for (;;) {
    const candidate = resolve(directory, 'node_modules', ...packageName.split('/'));
    const manifest = resolve(candidate, 'package.json');
    if (existsSync(manifest) && lstatSync(manifest).isFile()) {
      const root = realpathSync(candidate);
      return lstatSync(root).isDirectory() ? root : undefined;
    }
    const parent = dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function findPackageRoot(entry: string, projectRoot: string): string {
  let directory = dirname(entry);
  for (;;) {
    if (existsSync(resolve(directory, 'package.json'))) return realpathSync(directory);
    if (directory === projectRoot) return projectRoot;
    const parent = dirname(directory);
    if (parent === directory || !within(parent, projectRoot) && !entry.includes(`${sep}node_modules${sep}`)) return dirname(entry);
    directory = parent;
  }
}
function findManifest(entry: string, root: string): string | undefined {
  let directory = dirname(entry);
  while (within(directory, root)) {
    const manifest = resolve(directory, 'package.json');
    if (existsSync(manifest) && lstatSync(manifest).isFile()) return realpathSync(manifest);
    const parent = dirname(directory); if (parent === directory) break; directory = parent;
  }
  return undefined;
}
function literalImports(source: string): string[] {
  const result = new Set<string>();
  const expression = /(?:import\s*(?:[^'"()]*?\sfrom\s*)?|export\s+[^'"()]*?\sfrom\s*|import\s*\(|require\s*\()\s*['"]([^'"\r\n]+)['"]/g;
  for (const match of source.matchAll(expression)) if (match[1]) result.add(match[1]);
  return [...result];
}
function resolveRelativeModule(directory: string, specifier: string): string | undefined {
  const base = resolve(directory, specifier);
  const candidates = extname(base) ? [base] : [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.json`, resolve(base, 'index.js'), resolve(base, 'index.mjs'), resolve(base, 'index.cjs')];
  return candidates.find((path) => existsSync(path) && lstatSync(path).isFile());
}
function readJson(path: string): Record<string, unknown> {
  const stats = statSync(path); if (!stats.isFile() || stats.size > 1024 * 1024) return {};
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function within(path: string, root: string): boolean { return path === root || path.startsWith(`${root}${sep}`); }
