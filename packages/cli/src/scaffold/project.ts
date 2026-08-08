import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { ProjectTemplate, TemplateDescriptor } from './templates.js';
import { resolveTemplate } from './templates.js';

const PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const WINDOWS_DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
// eslint-disable-next-line no-control-regex
const INVALID_PATH_CHARACTER = /[<>:"|?*\u0000-\u001f]/;
const IGNORED_TEMPLATE_ENTRIES = new Set(['node_modules', 'dist', '.vx', '.git']);

export interface ScaffoldProjectOptions {
  cwd: string;
  name: string;
  template: string;
  library?: boolean;
  frameworkVersion: string;
  packageManager?: string;
}

export interface InitializeProjectOptions {
  root: string;
  template: string;
  library?: boolean;
  frameworkVersion: string;
  packageManager?: string;
}

export interface ScaffoldResult {
  root: string;
  packageName: string;
  template: ProjectTemplate;
  createdFiles: readonly string[];
}

export function scaffoldProject(options: ScaffoldProjectOptions): ScaffoldResult {
  const cwd = resolve(options.cwd);
  const descriptor = resolveTemplate(options.template, options.library ?? false);
  const target = resolveProjectTarget(cwd, options.name);
  const packageName = normalizePackageName(options.name);

  if (existsSync(target)) throw new Error(`Target path '${target}' already exists.`);
  const createdParents: string[] = [];
  ensureDirectoryPath(dirname(target), cwd, createdParents);
  const staging = join(dirname(target), `.vx-create-${basename(target)}-${randomUUID()}`);

  try {
    copyTemplate(staging, descriptor);
    normalizeManifest(staging, packageName, options.frameworkVersion, options.packageManager ?? 'pnpm@11.19.0');
    validateScaffold(staging, descriptor);
    renameSync(staging, target);
  } catch (cause) {
    rmSync(staging, { recursive: true, force: true });
    for (const directory of createdParents.reverse()) {
      try { rmdirSync(directory); }
      catch { /* Never remove a directory populated by another writer. */ }
    }
    throw cause;
  }

  return Object.freeze({
    root: target,
    packageName,
    template: descriptor.name,
    createdFiles: Object.freeze(listFiles(target))
  });
}

export function initializeProject(options: InitializeProjectOptions): ScaffoldResult {
  const root = resolve(options.root);
  const descriptor = resolveTemplate(options.template, options.library ?? false);
  const packageName = normalizePackageName(basename(root) || 'vx-project');
  const rootExisted = existsSync(root);
  if (rootExisted && !statSync(root).isDirectory()) throw new Error(`VX initialization target '${root}' is not a directory.`);
  if (!rootExisted) mkdirSync(root, { recursive: true });

  const conflicts = initializationConflicts(root, descriptor);
  if (conflicts.length > 0) {
    if (!rootExisted) rmSync(root, { recursive: true, force: true });
    throw new Error(`VX initialization would overwrite or cross existing files: ${conflicts.join(', ')}.`);
  }

  const staging = join(dirname(root), `.vx-init-${basename(root)}-${randomUUID()}`);
  const installedFiles: string[] = [];
  const installedDirectories: string[] = [];
  try {
    copyTemplate(staging, descriptor);
    normalizeManifest(staging, packageName, options.frameworkVersion, options.packageManager ?? 'pnpm@11.19.0');
    validateScaffold(staging, descriptor);
    const createdFiles = listFiles(staging);
    for (const path of createdFiles) {
      const source = join(staging, path);
      const destination = join(root, path);
      ensureDirectoryPath(dirname(destination), root, installedDirectories);
      renameSync(source, destination);
      installedFiles.push(destination);
    }
    return Object.freeze({ root, packageName, template: descriptor.name, createdFiles: Object.freeze(createdFiles) });
  } catch (cause) {
    for (const file of installedFiles.reverse()) rmSync(file, { force: true });
    for (const directory of installedDirectories.reverse()) {
      try { rmdirSync(directory); }
      catch { /* Another writer populated the directory; never remove their files. */ }
    }
    if (!rootExisted) rmSync(root, { recursive: true, force: true });
    throw cause;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

export function validateScaffold(root: string, descriptor: TemplateDescriptor): void {
  for (const required of descriptor.requiredFiles) {
    const path = join(root, required);
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Template '${descriptor.name}' is missing required file '${required}'.`);
  }

  const manifestPath = join(root, 'package.json');
  const manifest = parseRecord(readFileSync(manifestPath, 'utf8'), manifestPath);
  if (typeof manifest['name'] !== 'string' || !PACKAGE_NAME_PATTERN.test(manifest['name'])) {
    throw new Error(`Generated package name '${String(manifest['name'])}' is invalid.`);
  }
  if (manifest['type'] !== 'module') throw new Error(`Template '${descriptor.name}' must generate an ESM package.`);
  if (typeof manifest['packageManager'] !== 'string') throw new Error(`Template '${descriptor.name}' must pin a package manager.`);

  const scripts = recordValue(manifest['scripts']);
  const mandatoryScripts = descriptor.library
    ? ['build', 'check', 'lint', 'test', 'doctor', 'package', 'verify']
    : ['dev', 'build', 'preview', 'check', 'lint', 'test', 'doctor', 'verify'];
  for (const script of mandatoryScripts) {
    if (typeof scripts[script] !== 'string' || scripts[script].trim() === '') {
      throw new Error(`Template '${descriptor.name}' is missing script '${script}'.`);
    }
  }

  for (const path of listFiles(root)) {
    const absolute = join(root, path);
    if (lstatSync(absolute).isSymbolicLink()) throw new Error(`Template '${descriptor.name}' contains symbolic link '${path}'.`);
    if (path.split(/[\\/]/).some((segment) => IGNORED_TEMPLATE_ENTRIES.has(segment))) {
      throw new Error(`Template '${descriptor.name}' contains forbidden entry '${path}'.`);
    }
  }
}

function resolveProjectTarget(cwd: string, name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error('Project name cannot be empty.');
  if (isAbsolute(trimmed) || /^[a-z]:[\\/]/i.test(trimmed) || /^\\\\/.test(trimmed)) {
    throw new Error('Project name must be a relative path.');
  }
  const portable = trimmed.replace(/\\/g, '/');
  validatePortableProjectPath(portable);
  const target = resolve(cwd, portable);
  const relativeTarget = relative(cwd, target);
  if (relativeTarget === '' || relativeTarget === '..' || relativeTarget.startsWith(`..${sep}`)) {
    throw new Error(`Project path '${name}' must remain inside '${cwd}'.`);
  }
  return target;
}


function initializationConflicts(root: string, descriptor: TemplateDescriptor): string[] {
  const conflicts = new Set<string>();
  for (const path of templateFiles(descriptor)) {
    const destination = join(root, path);
    if (existsSync(destination)) {
      conflicts.add(path);
      continue;
    }
    let ancestor = dirname(destination);
    while (ancestor !== root && relative(root, ancestor) !== '') {
      if (existsSync(ancestor) && !statSync(ancestor).isDirectory()) {
        conflicts.add(relative(root, ancestor).split(sep).join('/'));
        break;
      }
      ancestor = dirname(ancestor);
    }
  }
  return [...conflicts].sort();
}

function ensureDirectoryPath(directory: string, root: string, created: string[]): void {
  const missing: string[] = [];
  let current = directory;
  while (current !== root && !existsSync(current)) {
    missing.push(current);
    current = dirname(current);
  }
  if (existsSync(current) && !statSync(current).isDirectory()) {
    throw new Error(`VX initialization cannot cross file '${relative(root, current).split(sep).join('/')}'.`);
  }
  for (const path of missing.reverse()) {
    mkdirSync(path);
    created.push(path);
  }
}

function validatePortableProjectPath(path: string): void {
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment === '' || segment === '.' || segment === '..') throw new Error(`Project path segment '${segment || '<empty>'}' is not allowed.`);
    if (INVALID_PATH_CHARACTER.test(segment) || /[. ]$/.test(segment) || WINDOWS_DEVICE_NAME.test(segment)) {
      throw new Error(`Project path segment '${segment}' is not portable across supported operating systems.`);
    }
  }
}

function normalizePackageName(name: string): string {
  const normalized = name.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalized.split('/').filter(Boolean);
  const candidate = normalized.startsWith('@') && segments.length >= 2
    ? `${segments.at(-2)}/${segments.at(-1)}`
    : segments.at(-1) ?? '';
  const lower = candidate.toLowerCase();
  if (!PACKAGE_NAME_PATTERN.test(lower)) {
    throw new Error(`Invalid package name '${candidate}'. Use lowercase letters, numbers, dots, underscores, or hyphens.`);
  }
  return lower;
}

function copyTemplate(target: string, descriptor: TemplateDescriptor): void {
  const source = templateRoot(descriptor.name);
  if (!existsSync(source) || !statSync(source).isDirectory()) throw new Error(`Template '${descriptor.name}' is not installed with @vx-foundation/cli.`);
  mkdirSync(target, { recursive: true });
  cpSync(source, target, {
    recursive: true,
    errorOnExist: false,
    force: true,
    filter(path) {
      const rel = relative(source, path);
      if (!rel) return true;
      return !rel.split(/[\\/]/).some((segment) => IGNORED_TEMPLATE_ENTRIES.has(segment));
    }
  });
}

function templateRoot(template: ProjectTemplate): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../templates', template);
}

const FORBIDDEN_PROPERTY_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function normalizeManifest(root: string, packageName: string, frameworkVersion: string, packageManagerInput: string): void {
  const path = join(root, 'package.json');
  const manifest = parseRecord(readFileSync(path, 'utf8'), path);
  manifest['name'] = packageName;

  const pmName = packageManagerInput.split('@')[0]?.toLowerCase().trim() || 'pnpm';
  let pinnedPm = packageManagerInput;
  const engines: Record<string, string> = { node: '>=22.11.0 <23 || >=24.11.0 <25' };

  if (pmName === 'npm') {
    pinnedPm = packageManagerInput.includes('@') ? packageManagerInput : 'npm@10.8.0';
    engines['npm'] = '>=10.0.0';
  } else if (pmName === 'yarn') {
    pinnedPm = packageManagerInput.includes('@') ? packageManagerInput : 'yarn@1.22.22';
    engines['yarn'] = '>=1.22.0';
  } else if (pmName === 'bun') {
    pinnedPm = packageManagerInput.includes('@') ? packageManagerInput : 'bun@1.1.0';
    engines['bun'] = '>=1.1.0';
  } else {
    pinnedPm = packageManagerInput.includes('@') ? packageManagerInput : 'pnpm@11.19.0';
    engines['pnpm'] = '>=11.19.0 <12';
  }

  manifest['packageManager'] = pinnedPm;
  manifest['engines'] = engines;
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const rawDeps = recordValue(manifest[field]);
    const dependencies: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawDeps)) {
      if (FORBIDDEN_PROPERTY_KEYS.has(key)) continue;
      dependencies[key] = key.startsWith('@vx-foundation/') ? frameworkDependencyVersion(frameworkVersion) : String(value);
    }
    if (Object.keys(dependencies).length > 0) {
      manifest[field] = dependencies;
    }
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function frameworkDependencyVersion(version: string): string {
  return version === '0.0.0' ? 'workspace:*' : `^${version}`;
}

function templateFiles(descriptor: TemplateDescriptor): string[] {
  const root = templateRoot(descriptor.name);
  return listFiles(root);
}

function listFiles(root: string): string[] {
  const output: string[] = [];
  const stack = [''];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const directory = join(root, current);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (IGNORED_TEMPLATE_ENTRIES.has(entry.name)) continue;
      const path = join(current, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile()) output.push(path.split(sep).join('/'));
      else throw new Error(`Template contains unsupported entry '${path}'.`);
    }
  }
  return output.sort();
}

function parseRecord(source: string, path: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (cause) { throw new Error(`Invalid JSON in '${path}': ${cause instanceof Error ? cause.message : String(cause)}`); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`'${path}' must contain a JSON object.`);
  return value as Record<string, unknown>;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
