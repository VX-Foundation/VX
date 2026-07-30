import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { initializeProject, scaffoldProject } from '../scaffold/project.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CreateOptions {
  template: string;
  library?: boolean;
}

export function create(name: string, options: CreateOptions): void {
  const result = scaffoldProject({
    cwd: process.cwd(),
    name,
    template: options.template,
    ...(options.library === undefined ? {} : { library: options.library }),
    frameworkVersion: cliVersion()
  });
  console.log(pc.green(`VX ${result.template === 'library' ? 'library' : 'project'} created at ${result.root}.`));
  console.log(`\nNext steps:\n  cd ${name}\n  pnpm install --no-frozen-lockfile\n  pnpm verify\n  ${result.template === 'library' ? 'pnpm package' : 'pnpm dev'}\n`);
}

export function init(options: CreateOptions): void {
  const result = initializeProject({
    root: process.cwd(),
    template: options.template,
    ...(options.library === undefined ? {} : { library: options.library }),
    frameworkVersion: cliVersion()
  });
  console.log(pc.green(`VX ${result.template === 'library' ? 'library' : 'project'} initialized with ${result.createdFiles.length} files.`));
}

function cliVersion(): string {
  const path = resolve(__dirname, '../../package.json');
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '0.0.0';
  const version = (parsed as Record<string, unknown>)['version'];
  return typeof version === 'string' ? version : '0.0.0';
}
