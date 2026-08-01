#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cac } from 'cac';
import pc from 'picocolors';
import { build, dev, preview } from '@vx-foundation/core';
import { create, init } from './commands/create.js';
import { addDependencyCommand, removeDependencyCommand, updateDependencyCommand, verifyIntegrationsCommand } from './commands/dependencies.js';
import { packageCommand } from './commands/package.js';
import { publishCommand } from './commands/publish.js';
import { releaseCheckCommand, releaseSnapshotCommand } from './commands/release.js';
import { formatCommand, inspectCommand, migrateCommand, testComponentCommand } from './commands/tooling.js';
import { checkCommand, doctorCommand, lintCommand, testCommand } from './commands/workspace.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string };
const cli = cac('vx');

cli.command('new <name>', 'Create a new VX project or library')
  .option('-t, --template <template>', 'Template: basic, starter, fullstack, library', { default: 'basic' })
  .option('--library', 'Create a convention-based VX library')
  .action(create);
cli.command('create <name>', 'Alias for vx new')
  .option('-t, --template <template>', 'Choose a template', { default: 'basic' })
  .option('--library', 'Create a convention-based VX library')
  .action(create);
cli.command('init', 'Initialize VX in the current directory')
  .option('-t, --template <template>', 'Choose a template', { default: 'basic' })
  .option('--library', 'Initialize a convention-based VX library')
  .action(init);

cli.command('dev [root]', 'Start the development server').action(async (root: string = process.cwd()) => {
  console.log(pc.cyan(`Starting VX dev server in ${root}...`));
  await dev(root);
});

interface BuildCliOptions { mode?: 'development' | 'production'; target?: string; adapter?: string; sourcemap?: 'none' | 'linked' | 'hidden' | 'inline'; incremental?: boolean; analysis?: boolean; }
cli.command('build [root]', 'Build one or more deployment targets')
  .option('--mode <mode>', 'development or production', { default: 'production' })
  .option('--target <targets>', 'browser,server,edge,static,library')
  .option('--adapter <adapter>', 'Official or custom deployment adapter')
  .option('--sourcemap <policy>', 'none, linked, hidden, inline')
  .option('--no-incremental', 'Disable incremental build cache')
  .option('--no-analysis', 'Disable bundle analysis')
  .action(async (root: string = process.cwd(), options: BuildCliOptions) => {
    const targets = options.target ? options.target.split(',').map((item) => item.trim()).filter(Boolean) as ('browser' | 'server' | 'edge' | 'static' | 'library')[] : undefined;
    await build(root, {
      ...(options.mode ? { mode: options.mode } : {}),
      ...(targets ? { targets } : {}),
      ...(options.adapter ? { adapter: options.adapter } : {}),
      ...(options.sourcemap ? { sourceMaps: options.sourcemap === 'none' ? false : options.sourcemap } : {}),
      ...(options.incremental === false ? { incremental: false } : {}),
      ...(options.analysis === false ? { bundleAnalysis: false } : {})
    });
    console.log(pc.green('VX build completed.'));
  });
cli.command('preview [root]', 'Preview an existing production build locally')
  .option('--host <host>', 'Host interface', { default: '127.0.0.1' })
  .option('--port <port>', 'TCP port', { default: '4173' })
  .action(async (root: string = process.cwd(), options: { host?: string; port?: string }) => {
    const port = Number(options.port ?? 4173);
    const handle = await preview(root, { ...(options.host ? { host: options.host } : {}), port });
    console.log(pc.green(`VX preview listening on ${handle.url}`));
  });
cli.command('test [root]', 'Run official VX tests')
  .option('--filter <pattern>', 'Filter tests')
  .option('--kind <kinds>', 'unit,component,dom,ssr,hydration,route,action,endpoint,browser,visual,accessibility,performance,security,fuzz')
  .option('--watch', 'Keep the test runner active')
  .option('--coverage', 'Collect coverage when supported by the configured runner')
  .option('--update-snapshots', 'Update visual and text snapshots')
  .option('--all', 'Run every configured test layer')
  .action((root: string = process.cwd(), options: { filter?: string; kind?: string; watch?: boolean; coverage?: boolean; updateSnapshots?: boolean; all?: boolean }) => testCommand(root, options));
cli.command('check [target]', 'Run compiler-backed project checks').action((target: string = process.cwd()) => checkCommand(target));
cli.command('format [target]', 'Format VX files with the canonical printer').option('--check', 'Check without writing').action((target: string = process.cwd(), options: { check?: boolean }) => formatCommand(target, options));
cli.command('lint [target]', 'Run VX diagnostics and formatting policy').option('--fix', 'Apply safe formatting fixes').action((target: string = process.cwd(), options: { fix?: boolean }) => lintCommand(target, options));
cli.command('inspect <file>', 'Inspect compiler graphs, boundaries, and generated output').option('--generated', 'Include generated client and server output').action((file: string, options: { generated?: boolean }) => inspectCommand(file, options));
cli.command('migrate [target]', 'Migrate deterministic legacy VX syntax').option('--write', 'Write safe migrations').action((target: string = process.cwd(), options: { write?: boolean }) => migrateCommand(target, options));
cli.command('doctor [root]', 'Diagnose the VX toolchain and workspace').action((root: string = process.cwd()) => doctorCommand(root));

interface DependencyOptions { dev?: boolean; peer?: boolean; optional?: boolean; install?: boolean; }
const dependencyOptions = (command: ReturnType<typeof cli.command>) => command
  .option('-D, --dev', 'Use devDependencies')
  .option('--peer', 'Use peerDependencies')
  .option('--optional', 'Use optionalDependencies')
  .option('--no-install', 'Only update metadata');
dependencyOptions(cli.command('add <package>', 'Add a registry package and synchronize vx.lock'))
  .action((specification: string, options: DependencyOptions) => addDependencyCommand(specification, { ...options, noInstall: options.install === false }));
dependencyOptions(cli.command('remove <package>', 'Remove a package and synchronize vx.lock'))
  .action((name: string, options: DependencyOptions) => removeDependencyCommand(name, { ...options, noInstall: options.install === false }));
dependencyOptions(cli.command('update [package]', 'Update one package or all VX packages'))
  .action((specification: string | undefined, options: DependencyOptions) => updateDependencyCommand(specification, { ...options, noInstall: options.install === false }));
cli.command('integrations:verify [root]', 'Verify plugin API versions, capabilities, permissions, and signatures').action((root: string = process.cwd()) => verifyIntegrationsCommand(root));
cli.command('iv [root]', 'Alias for integrations:verify').action((root: string = process.cwd()) => verifyIntegrationsCommand(root));

cli.command('package [root]', 'Validate and stage a VX library for publication').option('-o, --out <directory>', 'Override staging directory').action((root: string = process.cwd(), options: { out?: string }) => packageCommand(root, options));
cli.command('publish [root]', 'Stage, verify provenance, and publish a VX package')
  .option('--tag <tag>', 'latest, next, or canary', { default: 'latest' })
  .option('--access <access>', 'public or restricted', { default: 'public' })
  .option('--execute', 'Perform publication; default is registry dry-run')
  .option('--otp <otp>', 'Registry one-time password')
  .option('--signing-key <file>', 'Ed25519 private key used to sign release provenance')
  .option('--signer <identity>', 'Stable signer identity recorded in vx.signature.json')
  .action((root: string = process.cwd(), options: { tag?: 'latest' | 'next' | 'canary'; access?: 'public' | 'restricted'; execute?: boolean; otp?: string; signingKey?: string; signer?: string }) => publishCommand(root, options));
cli.command('release:check [root]', 'Validate release policy and API compatibility').option('--channel <channel>', 'canary, next, stable', { default: 'next' }).option('--baseline <file>', 'Override API baseline').option('--json', 'Print JSON').action((root: string = process.cwd(), options: { channel?: 'canary' | 'next' | 'stable'; baseline?: string; json?: boolean }) => releaseCheckCommand(root, options));
cli.command('release:snapshot [root]', 'Write the public API compatibility baseline').option('--out <file>', 'Override snapshot path').action((root: string = process.cwd(), options: { out?: string }) => releaseSnapshotCommand(root, options));
cli.command('test:component <file>', 'Compile one component through the production harness').action(testComponentCommand);

cli.help();
cli.version(pkg.version);

try { cli.parse(); }
catch (error) { console.error(pc.red(error instanceof Error ? error.message : String(error))); process.exitCode = 1; }
