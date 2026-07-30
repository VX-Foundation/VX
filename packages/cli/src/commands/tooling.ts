import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import pc from 'picocolors';
import { createComponentHarness, formatVX, inspectVX, migrateVXSource } from '@vx/tooling';

export interface FormatCommandOptions { check?: boolean; }
export interface InspectCommandOptions { generated?: boolean; }
export interface MigrateCommandOptions { write?: boolean; }

export function formatCommand(target = process.cwd(), options: FormatCommandOptions = {}): void {
  const files = collectVXFiles(resolve(target));
  const pending: Array<{ file: string; code: string }> = [];
  let failed = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const result = formatVX(source, file);
    const errors = result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    if (errors.length > 0) {
      failed += 1;
      for (const diagnostic of errors) console.error(pc.red(`[${diagnostic.code}] ${diagnostic.message} (${file}:${diagnostic.span.start.line})`));
      continue;
    }
    if (result.changed) pending.push({ file, code: result.code });
  }
  if (failed > 0) throw new Error(`VX formatter rejected ${failed} file${failed === 1 ? '' : 's'} without changing any source.`);
  for (const item of pending) {
    if (!options.check) writeFileSync(item.file, item.code, 'utf8');
    console.log(`${options.check ? pc.yellow('would format') : pc.green('formatted')} ${item.file}`);
  }
  const changed = pending.length;
  if (options.check && changed > 0) throw new Error(`${changed} VX file${changed === 1 ? '' : 's'} require formatting.`);
  console.log(pc.cyan(`${files.length} VX file${files.length === 1 ? '' : 's'} checked.`));
}

export function inspectCommand(file: string, options: InspectCommandOptions = {}): void {
  const path = resolve(file);
  const inspection = inspectVX(readFileSync(path, 'utf8'), path, options.generated ?? false);
  console.log(JSON.stringify(inspection, null, 2));
  if (inspection.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error('VX inspection completed with compiler errors.');
  }
}

export function testComponentCommand(file: string): void {
  const path = resolve(file);
  const harness = createComponentHarness(readFileSync(path, 'utf8'), path);
  harness.assertValid();
  console.log(pc.green(`Component harness compiled ${path}.`));
  console.log(pc.cyan(`${harness.sourceMap.length} visual source-map entr${harness.sourceMap.length === 1 ? 'y' : 'ies'} generated.`));
}

export function migrateCommand(target: string, options: MigrateCommandOptions = {}): void {
  const files = collectVXFiles(resolve(target));
  let manualCount = 0;
  for (const path of files) {
    const source = readFileSync(path, 'utf8');
    const result = migrateVXSource(source);
    for (const change of result.changes) console.log(pc.green(`[${change.code}] ${path}:${change.line} ${change.message}`));
    for (const item of result.manual) console.warn(pc.yellow(`[${item.code}] ${path}:${item.line} ${item.message}`));
    manualCount += result.manual.length;
    if (result.manual.length === 0 && options.write && result.changed) writeFileSync(path, result.code, 'utf8');
    if (files.length === 1 && !options.write && result.changed) console.log(result.code);
  }
  if (manualCount > 0) throw new Error(`${manualCount} migration item${manualCount === 1 ? '' : 's'} require manual review; affected sources were not changed.`);
}

function collectVXFiles(target: string): string[] {
  if (!existsSync(target)) throw new Error(`Path '${target}' does not exist.`);
  if (statSync(target).isFile()) {
    if (extname(target) !== '.vx') throw new Error(`Expected a .vx file, received '${target}'.`);
    return [target];
  }
  const output: string[] = [];
  const stack = [target];
  while (stack.length > 0) {
    const directory = stack.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git' || entry.name === '.vx') continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) stack.push(path);
      else if (entry.isFile() && extname(entry.name) === '.vx') output.push(path);
    }
  }
  return output.sort();
}
