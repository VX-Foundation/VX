import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { formatVX, inspectVX } from '@vx-foundation/tooling';
import { loadConfig } from '@vx-foundation/core';
import { readLockfile } from '@vx-foundation/package-system';

export interface TestCommandOptions { filter?: string; kind?: string; watch?: boolean; coverage?: boolean; updateSnapshots?: boolean; all?: boolean; }
export interface LintCommandOptions { fix?: boolean; }

export function checkCommand(target = process.cwd()): void {
  const files = collectVXFiles(resolve(target));
  let errors = 0; let warnings = 0;
  for (const file of files) {
    const inspection = inspectVX(readFileSync(file, 'utf8'), file, false);
    for (const diagnostic of inspection.diagnostics) {
      const output = `[${diagnostic.code}] ${diagnostic.message} (${file}:${diagnostic.span.start.line}:${diagnostic.span.start.column})`;
      if (diagnostic.severity === 'error') { errors += 1; console.error(pc.red(output)); }
      else { warnings += 1; console.warn(pc.yellow(output)); }
    }
  }
  console.log(pc.cyan(`VX check: ${files.length} files, ${errors} errors, ${warnings} warnings.`));
  if (errors > 0) throw new Error('VX check failed.');
}

export function lintCommand(target = process.cwd(), options: LintCommandOptions = {}): void {
  const files = collectVXFiles(resolve(target));
  let issues = 0;
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const inspection = inspectVX(source, file, false);
    for (const diagnostic of inspection.diagnostics) {
      if (diagnostic.severity === 'error' || diagnostic.severity === 'warning') {
        issues += 1;
        console.error(`${diagnostic.severity === 'error' ? pc.red('error') : pc.yellow('warning')} [${diagnostic.code}] ${file}:${diagnostic.span.start.line} ${diagnostic.message}`);
      }
    }
    const formatted = formatVX(source, file);
    if (formatted.changed && !formatted.diagnostics.some((item) => item.severity === 'error')) {
      issues += 1;
      if (options.fix) {
        writeFileSync(file, formatted.code, 'utf8');
        console.log(pc.green(`fixed ${file}`));
      } else console.warn(pc.yellow(`[VX_LINT_FORMAT] ${file} is not canonically formatted.`));
    }
  }
  console.log(pc.cyan(`VX lint: ${files.length} files, ${issues} issue${issues === 1 ? '' : 's'}.`));
  if (issues > 0 && !options.fix) throw new Error('VX lint failed.');
}

export function testCommand(root = process.cwd(), options: TestCommandOptions = {}): void {
  const manager = detectPackageManager(root);
  const manifestPath = resolve(root, 'package.json');
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) as { scripts?: Record<string, string> } : {};
  const requested = options.all ? ['unit', 'component', 'dom', 'ssr', 'hydration', 'route', 'action', 'endpoint', 'browser', 'visual', 'accessibility', 'performance', 'security', 'fuzz'] : (options.kind?.split(',').map((item) => item.trim()).filter(Boolean) ?? []);
  const scripts = requested.length === 0 ? ['test'] : [...new Set(requested.map((kind) => testScriptForKind(kind)))];
  for (const script of scripts) {
    if (!manifest.scripts?.[script]) {
      if (script === 'test') throw new Error("The project does not define a 'test' script.");
      console.warn(pc.yellow(`Skipping unconfigured VX test layer '${script}'.`));
      continue;
    }
    const args = manager === 'npm' ? ['run', script, '--'] : ['run', script];
    if (options.filter) args.push('--filter', options.filter);
    if (options.watch) args.push('--watch');
    if (options.coverage) args.push('--coverage');
    if (options.updateSnapshots) args.push('--update');
    run(manager, args, root);
  }
}

export async function doctorCommand(root = process.cwd()): Promise<void> {
  const workspace = resolve(root);
  const checks: Array<{ name: string; ok: boolean; detail: string }> = [];
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  checks.push({ name: 'Node.js', ok: nodeMajor >= 20, detail: process.versions.node });
  const manager = detectPackageManager(workspace);
  checks.push({ name: 'Package manager', ok: commandAvailable(manager), detail: manager });
  try {
    const config = await loadConfig(workspace);
    checks.push({ name: 'VX configuration', ok: true, detail: `${config.srcDir} -> ${config.outDir}` });
  } catch (cause) { checks.push({ name: 'VX configuration', ok: false, detail: cause instanceof Error ? cause.message : String(cause) }); }
  try {
    const files = collectVXFiles(workspace);
    checks.push({ name: 'VX sources', ok: files.length > 0, detail: `${files.length} file${files.length === 1 ? '' : 's'}` });
  } catch (cause) { checks.push({ name: 'VX sources', ok: false, detail: cause instanceof Error ? cause.message : String(cause) }); }
  const lockPath = resolve(workspace, 'vx.lock');
  if (existsSync(lockPath)) {
    try { const lock = readLockfile(workspace); checks.push({ name: 'VX lockfile', ok: true, detail: `${Object.keys(lock.packages).length} packages` }); }
    catch (cause) { checks.push({ name: 'VX lockfile', ok: false, detail: cause instanceof Error ? cause.message : String(cause) }); }
  } else checks.push({ name: 'VX lockfile', ok: true, detail: 'not required until package mutation' });
  for (const check of checks) console.log(`${check.ok ? pc.green('PASS') : pc.red('FAIL')} ${check.name}: ${check.detail}`);
  if (checks.some((check) => !check.ok)) throw new Error('VX doctor found blocking problems.');
}

export function collectVXFiles(target: string): string[] {
  if (!existsSync(target)) throw new Error(`Path '${target}' does not exist.`);
  if (statSync(target).isFile()) {
    if (extname(target) !== '.vx') throw new Error(`Expected a .vx file, received '${target}'.`);
    return [target];
  }
  const output: string[] = []; const stack = [target];
  while (stack.length > 0) {
    const directory = stack.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.git', '.vx', 'coverage', 'build'].includes(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) stack.push(path); else if (entry.isFile() && extname(entry.name) === '.vx') output.push(path);
    }
  }
  return output.sort();
}

export function detectPackageManager(root: string): 'pnpm' | 'npm' | 'yarn' | 'bun' {
  if (existsSync(resolve(root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(root, 'bun.lock')) || existsSync(resolve(root, 'bun.lockb'))) return 'bun';
  if (existsSync(resolve(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}
function commandAvailable(command: string): boolean {
  const executable = process.platform === 'win32' && !command.endsWith('.cmd') && !command.endsWith('.exe') ? `${command}.cmd` : command;
  return spawnSync(executable, ['--version'], { stdio: 'ignore', shell: true }).status === 0;
}
function run(command: string, args: string[], cwd: string): void {
  const executable = process.platform === 'win32' && !command.endsWith('.cmd') && !command.endsWith('.exe') ? `${command}.cmd` : command;
  const result = spawnSync(executable, args, { cwd, stdio: 'inherit', shell: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited with code ${result.status ?? 1}.`);
}


function testScriptForKind(kind: string): string {
  const normalized = kind.toLowerCase();
  const mapping: Record<string, string> = {
    unit: 'test', component: 'test:component', dom: 'test:dom', ssr: 'test:ssr', hydration: 'test:hydration',
    route: 'test:route', action: 'test:action', endpoint: 'test:endpoint', browser: 'test:e2e', visual: 'test:visual',
    accessibility: 'test:accessibility', performance: 'test:performance', security: 'test:security', fuzz: 'test:fuzz'
  };
  const script = mapping[normalized];
  if (!script) throw new Error(`Unknown VX test kind '${kind}'.`);
  return script;
}
