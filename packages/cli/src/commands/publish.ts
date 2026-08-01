import { lstatSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import pc from 'picocolors';
import { packageLibrary } from '@vx-foundation/core/package';
import { canonicalJson, createPublicationManifest, signPackagePayload, verifyPublicationManifest } from '@vx-foundation/package-system';
import { createProvenanceManifest, validatePackagePolicy } from '@vx-foundation/release';
import { detectPackageManager } from './workspace.js';

export interface PublishCommandOptions {
  tag?: 'latest' | 'next' | 'canary';
  access?: 'public' | 'restricted';
  execute?: boolean;
  otp?: string;
  signingKey?: string;
  signer?: string;
}

export function publishCommand(root = process.cwd(), options: PublishCommandOptions = {}): void {
  const workspace = resolve(root);
  const manifest = readObject(join(workspace, 'package.json'));
  const policy = validatePackagePolicy(manifest, {
    stable: (options.tag ?? 'latest') === 'latest',
    repositoryConfigured: Boolean(manifest['repository'])
  });
  for (const issue of policy.issues) {
    console.log(`${issue.severity === 'error' ? pc.red('error') : pc.yellow('warning')} [${issue.code}] ${issue.message}`);
  }
  if (!policy.valid) throw new Error('Package policy validation failed.');

  const staged = packageLibrary(workspace);
  if (!staged.manifest || staged.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new Error('VX package staging failed.');
  }
  const stagedManifest = readObject(join(staged.outDir, 'package.json'));
  const packageName = String(stagedManifest['name'] ?? 'unknown');
  const packageVersion = String(stagedManifest['version'] ?? '0.0.0');
  const revision = process.env['GITHUB_SHA'] ?? process.env['CI_COMMIT_SHA'] ?? 'local';
  const files = collectFiles(staged.outDir)
    .filter((path) => !path.endsWith('vx.provenance.json') && !path.endsWith('vx.signature.json'))
    .map((path) => ({
      path: relative(staged.outDir, path).replaceAll('\\', '/'),
      content: readFileSync(path)
    }));
  const provenance = createProvenanceManifest(packageName, packageVersion, revision, files);
  const provenancePayload = canonicalJson(provenance);
  writeFileSync(join(staged.outDir, 'vx.provenance.json'), provenancePayload, 'utf8');

  const publication = createPublicationManifest(staged.outDir, packageName, packageVersion, {
    ignore: ['vx.publication.json', 'vx.signature.json']
  });
  const publicationPayload = canonicalJson(publication);
  writeFileSync(join(staged.outDir, 'vx.publication.json'), publicationPayload, 'utf8');
  if (!verifyPublicationManifest(staged.outDir, publication)) {
    throw new Error('VX publication manifest verification failed before registry upload.');
  }

  if (options.signingKey || options.signer) {
    if (!options.signingKey || !options.signer) {
      throw new Error('Package signing requires both --signing-key and --signer.');
    }
    const signature = signPackagePayload(publicationPayload, readSigningKey(workspace, options.signingKey), options.signer);
    writeFileSync(join(staged.outDir, 'vx.signature.json'), canonicalJson({
      schema: 'https://vx.dev/schemas/package-signature/v1',
      version: 1,
      packageName,
      packageVersion,
      publicationIntegrity: publication.integrity,
      provenanceIntegrity: provenance.integrity,
      ...signature
    }), { encoding: 'utf8', mode: 0o600 });
  }

  const manager = detectPackageManager(workspace);
  const command = manager === 'npm' ? 'npm' : manager;
  const args = ['publish', staged.outDir, '--tag', options.tag ?? 'latest', '--access', options.access ?? 'public'];
  if (!options.execute) args.push('--dry-run');
  if (options.otp) args.push('--otp', validateOtp(options.otp));
  console.log(pc.cyan(`${options.execute ? 'Publishing' : 'Validating publication of'} ${packageName}@${packageVersion}...`));
  const result = spawnSync(command, args, { cwd: workspace, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} publish exited with code ${result.status ?? 1}.`);
  console.log(pc.green(options.execute ? 'VX package published.' : 'VX publication dry run passed.'));
}

function collectFiles(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && statSync(path).size <= 100 * 1024 * 1024) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

function readSigningKey(workspace: string, value: string): string {
  const path = isAbsolute(value) ? value : resolve(workspace, value);
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error('Package signing key must be a regular file, not a symbolic link.');
  }
  if (stats.size > 64 * 1024) throw new Error('Package signing key exceeds the 64 KiB limit.');
  return readFileSync(path, 'utf8');
}

function validateOtp(value: string): string {
  if (!/^\d{6,8}$/.test(value)) throw new Error('Registry OTP must contain 6 to 8 digits.');
  return value;
}

function readObject(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected object in '${path}'.`);
  return value as Record<string, unknown>;
}
