import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { addPackage, emptyLockfile, removePackage, updateLockedPackage, updatePackage, writeLockfile, type DependencyKind, type VXLockPackage } from '@vx/package-system';
import { loadConfig, runIntegrations } from '@vx/core';
import { detectPackageManager } from './workspace.js';

export interface DependencyCommandOptions { dev?: boolean; peer?: boolean; optional?: boolean; noInstall?: boolean; }

export function addDependencyCommand(specification: string, options: DependencyCommandOptions = {}, root = process.cwd()): void {
  transact(root, () => addPackage(root, specification, { kind: dependencyKind(options) }), options.noInstall ?? false);
}

export function removeDependencyCommand(name: string, options: DependencyCommandOptions = {}, root = process.cwd()): void {
  transact(root, () => removePackage(root, name), options.noInstall ?? false);
}

export function updateDependencyCommand(specification: string | undefined, options: DependencyCommandOptions = {}, root = process.cwd()): void {
  if (specification) transact(root, () => updatePackage(root, specification), options.noInstall ?? false);
  else {
    const manifest = readManifest(root);
    const names = allDependencies(manifest).filter((name) => name.startsWith('@vx/') || name === 'vx');
    if (names.length === 0) throw new Error('No VX packages are declared in this project.');
    transact(root, () => {
      const results = names.map((name) => updatePackage(root, `${name}@latest`));
      return { changed: results.some((result) => result.changed), manifestPath: resolve(root, 'package.json'), mutations: results.flatMap((result) => result.mutations) };
    }, options.noInstall ?? false);
  }
}

export async function verifyIntegrationsCommand(root = process.cwd()): Promise<void> {
  const config = await loadConfig(root);
  const host = await runIntegrations(config);
  try {
    for (const plugin of host.installed) console.log(pc.green(`verified ${plugin.name}@${plugin.version} api=${plugin.apiVersion}`));
    for (const diagnostic of host.diagnostics) {
      console.log(`${diagnostic.severity === 'error' ? pc.red('error') : diagnostic.severity === 'warning' ? pc.yellow('warning') : pc.cyan('info')} [${diagnostic.code}] ${diagnostic.plugin}: ${diagnostic.message}`);
    }
    if (host.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) throw new Error('VX integration verification failed.');
  } finally {
    await host.runHook('close', { root: config.root });
  }
}

function transact(root: string, mutation: () => { changed: boolean; mutations: readonly { name: string }[] }, noInstall: boolean): void {
  const manifestPath = resolve(root, 'package.json');
  const before = readFileSync(manifestPath, 'utf8');
  try {
    const result = mutation();
    if (!result.changed) { console.log(pc.yellow('No dependency changes were required.')); return; }
    if (!noInstall) install(root);
    synchronizeLockfile(root);
    for (const item of result.mutations) console.log(pc.green(`updated ${item.name}`));
  } catch (cause) {
    writeFileSync(manifestPath, before, 'utf8');
    throw cause;
  }
}

function install(root: string): void {
  const manager = detectPackageManager(root);
  const args = manager === 'npm' ? ['install'] : ['install'];
  const result = spawnSync(manager, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${manager} install exited with code ${result.status ?? 1}.`);
}

function synchronizeLockfile(root: string): void {
  const manifest = readManifest(root);
  let lockfile = emptyLockfile('.');
  for (const name of allDependencies(manifest)) {
    const packageRoot = resolve(root, 'node_modules', ...name.split('/'));
    if (!existsSync(packageRoot)) throw new Error(`Installed package '${name}' was not found after dependency mutation.`);
    const packageManifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as Record<string, unknown>;
    const version = typeof packageManifest['version'] === 'string' ? packageManifest['version'] : '0.0.0';
    const dependencies = stringRecord(packageManifest['dependencies']);
    const entry: VXLockPackage = {
      name,
      version,
      integrity: directoryIntegrity(packageRoot),
      resolved: relative(resolve(root), realpathSync(packageRoot)).replaceAll('\\', '/'),
      dependencies
    };
    lockfile = updateLockedPackage(lockfile, `${name}@${version}`, entry);
  }
  writeLockfile(root, lockfile);
}

function directoryIntegrity(root: string): string {
  const hash = createHash('sha512');
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
      if (files.length > 20_000) throw new Error(`Package '${root}' contains too many files to lock safely.`);
    }
  };
  visit(root);
  for (const file of files.sort()) {
    hash.update(relative(root, file).replaceAll('\\', '/'));
    hash.update('\0');
    hash.update(readFileSync(file));
    hash.update('\0');
  }
  return `sha512-${hash.digest('base64')}`;
}

function dependencyKind(options: DependencyCommandOptions): DependencyKind {
  const selected = [options.dev ? 'devDependencies' : undefined, options.peer ? 'peerDependencies' : undefined, options.optional ? 'optionalDependencies' : undefined].filter(Boolean);
  if (selected.length > 1) throw new Error('Choose only one of --dev, --peer, or --optional.');
  return (selected[0] ?? 'dependencies') as DependencyKind;
}
function readManifest(root: string): Record<string, unknown> { const value: unknown = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('package.json must contain an object.'); return value as Record<string, unknown>; }
function allDependencies(manifest: Record<string, unknown>): string[] { const names = new Set<string>(); for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) for (const name of Object.keys(stringRecord(manifest[field]))) names.add(name); return [...names].sort(); }
function stringRecord(value: unknown): Record<string, string> { if (!value || typeof value !== 'object' || Array.isArray(value)) return {}; return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')); }
