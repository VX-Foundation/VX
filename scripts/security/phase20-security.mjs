import assert from 'node:assert/strict';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { reviewLockfileText, reviewPackageManifest, scanSecrets } from '../../packages/security-testing/dist/index.js';
const root = resolve(import.meta.dirname, '../..');
const failures = [];
const excluded = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage', '.vx']);
for (const path of walk(root)) {
  const relativePath = relative(root, path).replaceAll('\\', '/');
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) { failures.push(`Symbolic link is not allowed in the source package: ${relativePath}`); continue; }
  if (!stat.isFile()) continue;
  if (relativePath.endsWith('package.json')) {
    const manifest = JSON.parse(readFileSync(path, 'utf8'));
    for (const issue of reviewPackageManifest(manifest)) if (issue.severity === 'error') failures.push(`${relativePath}: ${issue.message}`);
  }
  if (!isText(path) || relativePath === 'packages/security-testing/src/secrets.ts' || relativePath.startsWith('docs/security/')) continue;
  const source = readFileSync(path, 'utf8');
  for (const finding of scanSecrets(source, { allow: [/sha(?:256|384|512)-[A-Za-z0-9+/=]+/u, /phase9-browser-fixture-secret/u] })) if (finding.confidence === 'high') failures.push(`${relativePath}: possible ${finding.rule} at character ${finding.index}.`);
}
for (const issue of reviewLockfileText(readFileSync(resolve(root, 'pnpm-lock.yaml'), 'utf8'), { allowedBuiltDependencies: ['esbuild'] })) if (issue.severity === 'error') failures.push(issue.message);
for (const required of ['docs/security/THREAT-MODEL.md','docs/security/FUZZING.md','docs/security/SUPPLY-CHAIN.md','docs/security/EXTERNAL-AUDIT.md','docs/security/ADVISORIES.md','SECURITY.md']) assert(lstatSync(resolve(root, required)).isFile(), `Missing ${required}.`);
if (failures.length) { console.error(`Phase 20 security verification failed with ${failures.length} issue(s):`); for (const failure of failures) console.error(`- ${failure}`); process.exitCode = 1; } else console.log('Phase 20 security verification passed.');
function* walk(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { if (excluded.has(entry.name)) continue; const path = resolve(directory, entry.name); yield path; if (entry.isDirectory()) yield* walk(path); } }
function isText(path) { return ['.ts','.tsx','.js','.mjs','.cjs','.json','.md','.yml','.yaml','.toml','.vx','.css','.html'].includes(extname(path)) || path.endsWith('.npmrc'); }
