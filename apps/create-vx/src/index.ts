#!/usr/bin/env node
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export interface CreateVXRuntime {
  resolveCli(): string;
  spawn(executable: string, args: readonly string[]): Pick<SpawnSyncReturns<Buffer>, 'status' | 'signal' | 'error'>;
  report(message: string): void;
}

export function normalizeCreateArguments(input: readonly string[]): string[] {
  const args = [...input];
  const command = args[0];
  if (command !== 'create' && command !== 'init' && command !== 'new') args.unshift('create');
  return args;
}

export function runCreateVX(input: readonly string[], runtime: CreateVXRuntime = defaultRuntime()): number {
  const args = normalizeCreateArguments(input);
  let cliPath: string;
  try { cliPath = runtime.resolveCli(); }
  catch (cause) {
    runtime.report(`Could not resolve @vx/cli: ${cause instanceof Error ? cause.message : String(cause)}`);
    return 1;
  }

  const result = runtime.spawn(process.execPath, [cliPath, ...args]);
  if (result.error) {
    runtime.report(`Could not start @vx/cli: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    runtime.report(`@vx/cli terminated by signal ${result.signal}.`);
    return 1;
  }
  return result.status ?? 1;
}

function defaultRuntime(): CreateVXRuntime {
  const require = createRequire(import.meta.url);
  return {
    resolveCli: () => require.resolve('@vx/cli'),
    spawn: (executable, args) => spawnSync(executable, args, { stdio: 'inherit', env: process.env }),
    report: (message) => console.error(message)
  };
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (typeof entry !== 'string') return false;
  const resolved = resolve(entry);
  return (
    resolved === fileURLToPath(import.meta.url) ||
    resolved.endsWith('bin/create-vx.js') ||
    resolved.endsWith('bin\\create-vx.js')
  );
}

if (isMainModule()) process.exitCode = runCreateVX(process.argv.slice(2));
