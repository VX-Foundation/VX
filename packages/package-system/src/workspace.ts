import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { validPackageName } from './metadata.js';
import { validSemver } from './semver.js';
import type { DependencyKind, WorkspaceGraph, WorkspacePackage } from './types.js';

const IGNORED_DIRECTORIES = new Set(['node_modules', '.git', '.hg', '.svn', '.turbo', '.cache', 'dist', 'coverage']);
const MAX_DIRECTORIES = 100_000;
const MAX_PACKAGES = 10_000;
const DEPENDENCY_KINDS: readonly DependencyKind[] = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
const REGEX_SPECIAL_CHARACTERS = new Set(['\\', '^', '$', '+', '?', '.', '(', ')', '|', '{', '}', '[', ']']);

export function discoverWorkspacePackages(root: string): WorkspacePackage[] {
  const workspaceRoot = realpathSync(resolve(root));
  const patterns = readWorkspacePatterns(workspaceRoot);
  const positive = patterns.filter((pattern) => !pattern.startsWith('!')).map(normalizePattern);
  const negative = patterns.filter((pattern) => pattern.startsWith('!')).map((pattern) => normalizePattern(pattern.slice(1)));
  const manifests = new Set<string>();
  const rootManifest = join(workspaceRoot, 'package.json');
  if (existsSync(rootManifest)) manifests.add(rootManifest);

  let visited = 0;
  const visit = (directory: string): void => {
    if (++visited > MAX_DIRECTORIES) throw new Error(`Workspace scan exceeded ${MAX_DIRECTORIES} directories.`);
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name) || entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      const relativePath = normalize(relative(workspaceRoot, path));
      if (matchesAny(relativePath, negative)) continue;
      const manifest = join(path, 'package.json');
      if (existsSync(manifest) && (positive.length === 0 || matchesAny(relativePath, positive))) {
        const stats = lstatSync(manifest);
        if (stats.isSymbolicLink() || !stats.isFile()) throw new Error(`Workspace manifest '${manifest}' must be a regular file.`);
        manifests.add(manifest);
        if (manifests.size > MAX_PACKAGES) throw new Error(`Workspace contains more than ${MAX_PACKAGES} packages.`);
      }
      if (shouldDescend(relativePath, positive)) visit(path);
    }
  };
  visit(workspaceRoot);

  const packages = [...manifests].map((manifest) => readWorkspacePackage(workspaceRoot, manifest));
  validateUniquePackages(packages);
  return packages.sort((left, right) => left.name.localeCompare(right.name));
}

export function createWorkspaceGraph(root: string): WorkspaceGraph {
  const packages = discoverWorkspacePackages(root);
  const names = new Set(packages.map((pkg) => pkg.name));
  const edges = Object.fromEntries(packages.map((pkg) => [pkg.name, Object.keys(pkg.dependencies).filter((name) => names.has(name)).sort()]));
  return Object.freeze({ packages: Object.freeze(packages), edges: Object.freeze(edges), cycles: Object.freeze(findCycles(edges).map((cycle) => Object.freeze(cycle))) });
}

export function topologicalWorkspaceOrder(graph: WorkspaceGraph, options: { allowCycles?: boolean } = {}): WorkspacePackage[] {
  if (graph.cycles.length > 0 && !options.allowCycles) throw new Error(`Workspace dependency graph contains cycles: ${graph.cycles.map((cycle) => cycle.join(' -> ')).join('; ')}`);
  const packageByName = new Map(graph.packages.map((pkg) => [pkg.name, pkg]));
  const indegree = new Map(graph.packages.map((pkg) => [pkg.name, 0]));
  const reverse = new Map<string, string[]>();
  for (const [name, dependencies] of Object.entries(graph.edges)) {
    indegree.set(name, dependencies.length);
    for (const dependency of dependencies) {
      const dependants = reverse.get(dependency) ?? [];
      dependants.push(name);
      reverse.set(dependency, dependants);
    }
  }
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([name]) => name).sort();
  const result: WorkspacePackage[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    const pkg = packageByName.get(name);
    if (pkg) result.push(pkg);
    for (const dependant of (reverse.get(name) ?? []).sort()) {
      const next = (indegree.get(dependant) ?? 0) - 1;
      indegree.set(dependant, next);
      if (next === 0) { queue.push(dependant); queue.sort(); }
    }
  }
  if (result.length !== graph.packages.length) {
    const unresolved = graph.packages.filter((pkg) => !result.includes(pkg)).sort((a, b) => a.name.localeCompare(b.name));
    result.push(...unresolved);
  }
  return result;
}

function readWorkspacePatterns(root: string): string[] {
  const pnpm = join(root, 'pnpm-workspace.yaml');
  if (existsSync(pnpm)) {
    const stats = statSync(pnpm);
    if (!stats.isFile() || stats.size > 1024 * 1024) throw new Error(`Workspace file '${pnpm}' is invalid.`);
    const lines = readFileSync(pnpm, 'utf8').split(/\r?\n/);
    return lines.map((line) => /^\s*-\s+(.+?)\s*$/.exec(line)?.[1]?.replace(/^['"]|['"]$/g, '')).filter((value): value is string => Boolean(value));
  }
  const packageJson = join(root, 'package.json');
  if (!existsSync(packageJson)) return [];
  const parsed = readObject(packageJson);
  const workspaces = parsed['workspaces'];
  if (Array.isArray(workspaces)) return workspaces.filter((item): item is string => typeof item === 'string');
  if (record(workspaces) && Array.isArray(workspaces['packages'])) return workspaces['packages'].filter((item): item is string => typeof item === 'string');
  return [];
}

function readWorkspacePackage(workspaceRoot: string, path: string): WorkspacePackage {
  const parsed = readObject(path);
  const root = realpathSync(dirname(path));
  const relativeRoot = normalize(relative(workspaceRoot, root)) || '.';
  const name = parsed['name'];
  const version = parsed['version'];
  if (typeof name !== 'string' || !validPackageName(name)) throw new Error(`Workspace package '${relativeRoot}' has an invalid or missing name.`);
  if (typeof version !== 'string' || !validSemver(version)) throw new Error(`Workspace package '${name}' has an invalid or missing semantic version.`);
  const dependencyGroups: Partial<Record<DependencyKind, Readonly<Record<string, string>>>> = {};
  for (const kind of DEPENDENCY_KINDS) {
    const dependencies = dependencyRecord(parsed[kind], `${name}.${kind}`);
    if (Object.keys(dependencies).length > 0) dependencyGroups[kind] = Object.freeze(dependencies);
  }
  const dependencies = Object.fromEntries(DEPENDENCY_KINDS.flatMap((kind) => Object.entries(dependencyGroups[kind] ?? {})).sort(([left], [right]) => left.localeCompare(right)));
  return Object.freeze({ name, version, root, relativeRoot, private: parsed['private'] === true, dependencies: Object.freeze(dependencies), dependencyGroups: Object.freeze(dependencyGroups) });
}

function dependencyRecord(value: unknown, label: string): Record<string, string> {
  if (value === undefined) return {};
  if (!record(value)) throw new Error(`Workspace dependency group '${label}' must be an object.`);
  const result: Record<string, string> = {};
  for (const [name, selector] of Object.entries(value)) {
    if (!validPackageName(name) || typeof selector !== 'string' || !selector.trim() || selector.length > 512 || /[\0\r\n]/.test(selector)) throw new Error(`Workspace dependency '${name}' in '${label}' is invalid.`);
    result[name] = selector;
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left.localeCompare(right)));
}

function validateUniquePackages(packages: readonly WorkspacePackage[]): void {
  const names = new Map<string, string>();
  const roots = new Set<string>();
  for (const pkg of packages) {
    const previous = names.get(pkg.name);
    if (previous) throw new Error(`Workspace package name '${pkg.name}' is duplicated by '${previous}' and '${pkg.relativeRoot}'.`);
    if (roots.has(pkg.root)) throw new Error(`Workspace package root '${pkg.relativeRoot}' was discovered more than once.`);
    names.set(pkg.name, pkg.relativeRoot);
    roots.add(pkg.root);
  }
}

function findCycles(edges: Readonly<Record<string, readonly string[]>>): string[][] {
  const cycles: string[][] = [];
  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string): void => {
    const current = state.get(name) ?? 0;
    if (current === 2) return;
    if (current === 1) {
      const index = stack.indexOf(name);
      const cycle = [...stack.slice(index), name];
      const canonical = canonicalCycle(cycle);
      if (!seen.has(canonical)) { seen.add(canonical); cycles.push(cycle); }
      return;
    }
    state.set(name, 1); stack.push(name);
    for (const dependency of edges[name] ?? []) visit(dependency);
    stack.pop(); state.set(name, 2);
  };
  for (const name of Object.keys(edges).sort()) visit(name);
  return cycles.sort((left, right) => left.join('\0').localeCompare(right.join('\0')));
}

function canonicalCycle(cycle: readonly string[]): string {
  const body = cycle.slice(0, -1);
  if (body.length === 0) return '';
  const rotations = body.map((_, index) => [...body.slice(index), ...body.slice(0, index)].join('\0'));
  return rotations.sort()[0]!;
}
function shouldDescend(path: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return true;
  return patterns.some((pattern) => pattern.includes('**') || pattern.startsWith(`${path}/`) || globPrefix(pattern).startsWith(`${path}/`) || path.startsWith(`${globPrefix(pattern)}/`));
}
function matchesAny(value: string, patterns: readonly string[]): boolean { return patterns.some((pattern) => globRegex(pattern).test(value)); }
function globPrefix(pattern: string): string { return pattern.split(/[*?[]/, 1)[0]!.replace(/\/$/, ''); }
function globRegex(pattern: string): RegExp {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    if (char === '*') {
      if (pattern[index + 1] === '*') { source += '.*'; index += 1; }
      else source += '[^/]*';
    } else if (char === '?') source += '[^/]';
    else source += REGEX_SPECIAL_CHARACTERS.has(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`);
}
function normalizePattern(value: string): string {
  const normalized = normalize(value.trim()).replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized || normalized.startsWith('/') || normalized.split('/').includes('..') || /[\0\r\n\\]/.test(normalized)) throw new Error(`Unsafe workspace pattern '${value}'.`);
  return normalized;
}
function normalize(value: string): string { return value.replaceAll('\\', '/'); }
function readObject(path: string): Record<string, unknown> {
  const stats = statSync(path);
  if (!stats.isFile() || stats.size > 1024 * 1024) throw new Error(`Workspace manifest '${path}' must be a regular file under 1 MiB.`);
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!record(value)) throw new TypeError(`Workspace manifest '${path}' must be an object.`);
  return value;
}
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
