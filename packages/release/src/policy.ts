import type { PackagePolicyIssue, PackagePolicyResult } from './types.js';

export interface PackagePolicyOptions {
  stable?: boolean;
  expectedRegistry?: string;
  expectedRepository?: string;
  expectedNodeRange?: string;
  repositoryConfigured?: boolean;
}

const FORBIDDEN_LIFECYCLE_SCRIPTS = ['preinstall', 'install', 'postinstall'];
const DEFAULT_REPOSITORY = 'git+https://github.com/VX-Foundation/vx.git';
const DEFAULT_NODE_RANGE = '>=22.11.0 <23 || >=24.11.0 <25';

export function validatePackagePolicy(manifest: Readonly<Record<string, unknown>>, options: PackagePolicyOptions = {}): PackagePolicyResult {
  const packageName = typeof manifest['name'] === 'string' ? manifest['name'] : '(unknown package)';
  const issues: PackagePolicyIssue[] = [];
  const error = (code: string, message: string): void => { issues.push({ packageName, code, severity: 'error', message }); };
  const warning = (code: string, message: string): void => { issues.push({ packageName, code, severity: 'warning', message }); };

  if (manifest['private'] === true) return { valid: true, issues };
  if (typeof manifest['name'] !== 'string' || !manifest['name'].trim()) error('VX_RELEASE_PACKAGE_NAME', 'Public package requires a name.');
  if (typeof manifest['version'] !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest['version'])) error('VX_RELEASE_PACKAGE_VERSION', 'Public package requires a valid semver version.');
  if (typeof manifest['description'] !== 'string' || !manifest['description'].trim()) error('VX_RELEASE_DESCRIPTION', 'Public package requires a description.');
  if (manifest['type'] !== 'module') error('VX_RELEASE_MODULE_TYPE', 'Public VX packages must be ESM packages.');
  if (manifest['license'] !== 'MIT') error('VX_RELEASE_LICENSE', 'Public VX packages must declare the repository MIT license.');
  if (!authorName(manifest['author'])) error('VX_RELEASE_AUTHOR', 'Public package requires the canonical author identity.');

  const files = Array.isArray(manifest['files']) ? manifest['files'] : [];
  if (files.length === 0) error('VX_RELEASE_FILES', 'Public package requires an explicit non-empty files allowlist.');
  for (const required of ['README.md', 'LICENSE']) {
    if (!files.includes(required)) error('VX_RELEASE_LEGAL_FILES', `Public package files must include '${required}'.`);
  }
  if (!manifest['exports'] && !manifest['bin']) error('VX_RELEASE_EXPORTS', 'Public package requires exports or a binary entrypoint.');
  if (typeof manifest['sideEffects'] !== 'boolean' && !Array.isArray(manifest['sideEffects'])) warning('VX_RELEASE_SIDE_EFFECTS', 'Package should declare sideEffects explicitly.');
  if (!Array.isArray(manifest['keywords']) || manifest['keywords'].length < 3) error('VX_RELEASE_KEYWORDS', 'Public package requires searchable npm keywords.');

  const engines = record(manifest['engines']);
  const expectedNodeRange = options.expectedNodeRange ?? DEFAULT_NODE_RANGE;
  if (engines?.['node'] !== expectedNodeRange) error('VX_RELEASE_NODE_ENGINE', `Public package Node.js engine must be '${expectedNodeRange}'.`);
  const publishConfig = record(manifest['publishConfig']);
  if (publishConfig?.['access'] !== 'public') error('VX_RELEASE_ACCESS', 'Public packages must publish with access=public.');
  const expectedRegistry = options.expectedRegistry ?? 'https://registry.npmjs.org/';
  if (publishConfig?.['registry'] !== expectedRegistry) error('VX_RELEASE_REGISTRY', `Package registry must be '${expectedRegistry}'.`);

  const expectedRepository = options.expectedRepository ?? DEFAULT_REPOSITORY;
  const repository = record(manifest['repository']);
  const repositoryUrl = typeof manifest['repository'] === 'string' ? manifest['repository'] : repository?.['url'];
  if (repositoryUrl !== expectedRepository) error('VX_RELEASE_REPOSITORY', `Package repository must be '${expectedRepository}'.`);
  if (typeof manifest['homepage'] !== 'string' || !manifest['homepage'].startsWith('https://github.com/VX-Foundation/vx')) error('VX_RELEASE_HOMEPAGE', 'Public package requires a canonical HTTPS homepage.');
  const bugs = record(manifest['bugs']);
  if (bugs?.['url'] !== 'https://github.com/VX-Foundation/vx/issues') error('VX_RELEASE_BUGS', 'Public package requires the canonical issue tracker.');

  const scripts = record(manifest['scripts']);
  for (const name of FORBIDDEN_LIFECYCLE_SCRIPTS) {
    if (typeof scripts?.[name] === 'string') error('VX_RELEASE_LIFECYCLE_SCRIPT', `Public package cannot publish lifecycle script '${name}'.`);
  }
  if (options.stable && options.repositoryConfigured === false) error('VX_RELEASE_REPOSITORY_IDENTITY', 'Stable release requires the project repository identity to be configured.');
  return { valid: !issues.some((issue) => issue.severity === 'error'), issues };
}

function authorName(value: unknown): string | undefined {
  if (typeof value === 'string') return value.trim() || undefined;
  const author = record(value);
  return typeof author?.['name'] === 'string' ? author['name'].trim() || undefined : undefined;
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
