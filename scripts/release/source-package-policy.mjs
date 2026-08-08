import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';

export function loadSourcePolicy(root) {
  const path = resolve(root, 'release/source-allowlist.json');
  const policy = JSON.parse(readFileSync(path, 'utf8'));
  if (policy.version !== 1) throw new Error(`Unsupported source allowlist version '${policy.version}'.`);
  return Object.freeze({
    includeFiles: new Set(policy.includeFiles ?? []),
    includeDirectories: new Set(policy.includeDirectories ?? []),
    excludePrefixes: Object.freeze([...(policy.excludePrefixes ?? [])]),
    forbiddenSegments: new Set(policy.forbiddenSegments ?? []),
    forbiddenSuffixes: Object.freeze([...(policy.forbiddenSuffixes ?? [])])
  });
}

export function collectSourceFiles(root, policy, { requireDeclaredTopLevel = true } = {}) {
  const output = [];
  const topLevel = readdirSync(root, { withFileTypes: true });
  const undeclared = [];

  for (const entry of topLevel) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.turbo' || entry.name === 'SOURCE-MANIFEST.json' || entry.name.startsWith('.phase')) continue;
    if (entry.isFile()) {
      if (!policy.includeFiles.has(entry.name)) undeclared.push(entry.name);
      else if (entry.name === 'pnpm-lock.yaml' && !exists(resolve(root, entry.name))) undeclared.push(entry.name);
      else output.push(entry.name);
      continue;
    }
    if (entry.isDirectory()) {
      if (!policy.includeDirectories.has(entry.name)) undeclared.push(`${entry.name}/`);
      else visit(resolve(root, entry.name), entry.name, output, policy);
      continue;
    }
    undeclared.push(entry.name);
  }

  if (requireDeclaredTopLevel && undeclared.length) {
    throw new Error(`Source allowlist does not classify top-level entries: ${undeclared.sort().join(', ')}`);
  }
  return output.sort();
}

function visit(absolute, relativePath, output, policy) {
  const normalized = normalize(relativePath);
  if (isExcluded(normalized, policy)) return;
  const details = lstatSync(absolute);
  if (details.isSymbolicLink()) throw new Error(`Source package cannot contain symbolic link '${normalized}'.`);
  if (details.isDirectory()) {
    if (hasForbiddenSegment(normalized, policy)) return;
    for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      visit(resolve(absolute, entry.name), `${normalized}/${entry.name}`, output, policy);
    }
    return;
  }
  if (!details.isFile()) return;
  if (
    hasForbiddenSegment(normalized, policy) ||
    policy.forbiddenSuffixes.some((suffix) => normalized.endsWith(suffix)) ||
    /\.tsbuildinfo(?:\..+)?$/u.test(basename(normalized))
  ) {
    return;
  }
  output.push(normalized);
}

function isExcluded(path, policy) {
  return policy.excludePrefixes.some((prefix) => path === prefix.replace(/\/$/u, '') || path.startsWith(prefix));
}
function hasForbiddenSegment(path, policy) {
  return path.split('/').some((segment) => policy.forbiddenSegments.has(segment));
}
function normalize(path) { return path.split(sep).join('/'); }
function exists(path) { try { lstatSync(path); return true; } catch { return false; } }
