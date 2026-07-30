import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pc from 'picocolors';
import {
  compareApiSnapshots,
  createWorkspaceApiSnapshot,
  validatePackagePolicy,
  type ReleaseChannel,
  type WorkspaceApiSnapshot
} from '@vx/release';

export interface ReleaseCheckOptions {
  channel?: ReleaseChannel;
  baseline?: string;
  json?: boolean;
}

export interface ReleaseSnapshotOptions {
  out?: string;
}

export function releaseCheckCommand(root: string = process.cwd(), options: ReleaseCheckOptions = {}): void {
  const workspace = resolve(root);
  const channel = options.channel ?? 'next';
  const policy = readReleasePolicy(workspace);
  const issues = discoverManifests(workspace).flatMap((path) => {
    const manifest = readObject(path);
    return validatePackagePolicy(manifest, {
      stable: channel === 'stable',
      repositoryConfigured: typeof policy.repository === 'string' && policy.repository.length > 0
    }).issues;
  });

  issues.push(...readStabilizationIssues(workspace, channel, policy.readiness));

  const snapshot = createWorkspaceApiSnapshot(workspace);
  const baselinePath = resolve(workspace, options.baseline ?? policy.apiBaseline ?? 'release/api-baseline.json');
  let compatibility: ReturnType<typeof compareApiSnapshots> | undefined;
  if (existsSync(baselinePath)) compatibility = compareApiSnapshots(readSnapshot(baselinePath), snapshot);
  else if (channel === 'stable') {
    issues.push({
      packageName: 'workspace',
      code: 'VX_RELEASE_BASELINE_MISSING',
      severity: 'error',
      message: `Stable release requires API baseline '${baselinePath}'.`
    });
  }

  const result = {
    valid: !issues.some((issue) => issue.severity === 'error') && (compatibility?.valid ?? channel !== 'stable'),
    channel,
    baselinePath,
    issues,
    ...(compatibility ? { compatibility } : {})
  };

  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printReleaseCheck(result);
  if (!result.valid) throw new Error('VX release readiness check failed.');
}

export function releaseSnapshotCommand(root: string = process.cwd(), options: ReleaseSnapshotOptions = {}): void {
  const workspace = resolve(root);
  const policy = readReleasePolicy(workspace);
  const out = resolve(workspace, options.out ?? policy.apiBaseline ?? 'release/api-baseline.json');
  const snapshot = createWorkspaceApiSnapshot(workspace);
  writeFileSync(out, `${JSON.stringify(snapshot)}\n`, 'utf8');
  console.log(pc.green(`VX public API snapshot written to ${out}`));
}

function printReleaseCheck(result: {
  valid: boolean;
  channel: ReleaseChannel;
  issues: Array<{ packageName: string; code: string; severity: 'error' | 'warning'; message: string }>;
  compatibility?: ReturnType<typeof compareApiSnapshots>;
}): void {
  console.log(pc.cyan(`VX release channel: ${result.channel}`));
  for (const issue of result.issues) {
    const text = `[${issue.code}] ${issue.packageName}: ${issue.message}`;
    console.error(issue.severity === 'error' ? pc.red(text) : pc.yellow(text));
  }
  for (const change of result.compatibility?.changes ?? []) {
    const text = `[${change.code}] ${change.packageName}${change.entrypoint ? ` ${change.entrypoint}` : ''}: ${change.message}`;
    console.log(change.impact === 'major' ? pc.red(text) : change.impact === 'minor' ? pc.yellow(text) : text);
  }
  if (result.valid) console.log(pc.green('VX release readiness check passed.'));
}

function readReleasePolicy(root: string): { repository?: string | null; apiBaseline?: string; readiness?: string } {
  const path = join(root, 'release', 'release-policy.json');
  if (!existsSync(path)) return {};
  const value = readObject(path);
  return {
    ...(typeof value['repository'] === 'string' || value['repository'] === null ? { repository: value['repository'] as string | null } : {}),
    ...(typeof value['apiBaseline'] === 'string' ? { apiBaseline: value['apiBaseline'] } : {}),
    ...(typeof value['readiness'] === 'string' ? { readiness: value['readiness'] } : {})
  };
}


function readStabilizationIssues(root: string, channel: ReleaseChannel, configuredPath?: string): Array<{ packageName: string; code: string; severity: 'error' | 'warning'; message: string }> {
  const path = resolve(root, configuredPath ?? 'release/v1-readiness.json');
  if (!existsSync(path)) return [{ packageName: 'workspace', code: 'VX_RELEASE_READINESS_MISSING', severity: 'error', message: `Release readiness manifest '${path}' is missing.` }];
  const manifest = readObject(path);
  const criteria = Array.isArray(manifest['criteria']) ? manifest['criteria'] : [];
  const issues: Array<{ packageName: string; code: string; severity: 'error' | 'warning'; message: string }> = [];
  for (const value of criteria) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const criterion = value as Record<string, unknown>;
    const id = typeof criterion['id'] === 'string' ? criterion['id'] : 'unknown';
    const status = typeof criterion['status'] === 'string' ? criterion['status'] : 'invalid';
    const required = channel === 'stable' || criterion['requiredForNext'] === true;
    if (!required) continue;
    if (!['complete', 'automated', 'external-automated'].includes(status)) {
      issues.push({ packageName: 'workspace', code: 'VX_RELEASE_STABILIZATION_BLOCKER', severity: 'error', message: `Criterion '${id}' is '${status}'.` });
    }
    if (status === 'complete' && Array.isArray(criterion['evidence'])) {
      for (const evidence of criterion['evidence']) {
        if (typeof evidence === 'string' && !existsSync(resolve(root, evidence))) {
          issues.push({ packageName: 'workspace', code: 'VX_RELEASE_EVIDENCE_MISSING', severity: 'error', message: `Criterion '${id}' is missing evidence '${evidence}'.` });
        }
      }
    }
  }
  if (channel === 'stable' && process.env['VX_STABLE_CI_VERIFIED'] !== 'true') {
    issues.push({ packageName: 'workspace', code: 'VX_RELEASE_PROTECTED_CHECKS', severity: 'error', message: 'Stable release requires verified protected cross-platform and browser checks.' });
  }
  return issues;
}

function readSnapshot(path: string): WorkspaceApiSnapshot {
  return readObject(path) as unknown as WorkspaceApiSnapshot;
}

function discoverManifests(root: string): string[] {
  const result: string[] = [];
  for (const group of ['packages', 'apps']) {
    const directory = join(root, group);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(directory, entry.name, 'package.json');
      if (existsSync(path) && statSync(path).isFile()) result.push(path);
    }
  }
  return result.sort();
}

function readObject(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`Expected object in '${path}'.`);
  return value as Record<string, unknown>;
}
