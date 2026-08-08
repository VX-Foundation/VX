import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { initializeProject, scaffoldProject } from '../scaffold/project.js';
import { promptScaffoldOptions } from '../scaffold/prompt.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface CreateOptions {
  template?: string;
  packageManager?: string;
  library?: boolean;
  overwrite?: boolean;
  yes?: boolean;
}

export async function create(name?: string, options: CreateOptions = {}): Promise<void> {
  const scaffoldOptions = await promptScaffoldOptions(name, options);

  const result = scaffoldProject({
    cwd: process.cwd(),
    name: scaffoldOptions.name,
    template: scaffoldOptions.template,
    packageManager: scaffoldOptions.packageManager,
    ...(options.library === undefined ? {} : { library: options.library }),
    frameworkVersion: cliVersion()
  });

  const pm = scaffoldOptions.packageManager;
  const runCmd = pm === 'npm' ? 'npm run' : pm;

  console.log(pc.bold(pc.green(`✔ VX ${result.template === 'library' ? 'library' : 'project'} created at ${result.root}`)));
  console.log(pc.bold('\nNext steps:'));
  console.log(pc.cyan(`  cd ${scaffoldOptions.name}`));
  console.log(pc.cyan(`  ${pm} install`));
  console.log(pc.cyan(`  ${runCmd} verify`));
  console.log(pc.cyan(`  ${runCmd} ${result.template === 'library' ? 'package' : 'dev'}\n`));
}

export async function init(options: CreateOptions = {}): Promise<void> {
  const result = initializeProject({
    root: process.cwd(),
    template: options.template || 'basic',
    ...(options.library === undefined ? {} : { library: options.library }),
    frameworkVersion: cliVersion()
  });
  console.log(pc.bold(pc.green(`✔ VX ${result.template === 'library' ? 'library' : 'project'} initialized with ${result.createdFiles.length} files.`)));
}

function cliVersion(): string {
  const path = resolve(__dirname, '../../package.json');
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '0.0.0';
  const version = (parsed as Record<string, unknown>)['version'];
  return typeof version === 'string' ? version : '0.0.0';
}
