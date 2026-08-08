import { lstat, readdir } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const forbiddenDirectories = new Set(['node_modules', 'dist', '.turbo', 'coverage', 'playwright-report', 'test-results', 'release-artifacts', '.cache', '.vx']);
const violations = [];
await visit(root);
if (violations.length) {
  console.error(`VX source-tree verification failed with ${violations.length} violation(s):`);
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log('VX source tree is clean: no generated builds, dependency trees, caches, secrets, archives, or symbolic links.');
}

async function visit(path) {
  const rel = relative(root, path).replaceAll('\\', '/');
  const details = await lstat(path);
  if (details.isSymbolicLink()) {
    violations.push(`symbolic link: ${rel}`);
    return;
  }
  if (details.isDirectory()) {
    if (rel === '.git' || rel.startsWith('.git/')) return;
    if (rel && forbiddenDirectories.has(rel.split('/').at(-1))) {
      violations.push(`generated directory: ${rel}`);
      return;
    }
    for (const entry of (await readdir(path)).sort()) await visit(resolve(path, entry));
    return;
  }
  if (!details.isFile()) return;
  const name = rel.split('/').at(-1) ?? rel;
  if (/\.tsbuildinfo(?:\..+)?$/u.test(name)) violations.push(`TypeScript build state: ${rel}`);
  if (/\.(?:zip|tgz|tar|gz)$/u.test(name)) violations.push(`nested archive: ${rel}`);
  if (/\.(?:pem|key|p12|pfx)$/u.test(name)) violations.push(`sensitive key material: ${rel}`);
  if (/^\.env(?:\..+)?$/u.test(name) && !name.endsWith('.example')) violations.push(`environment secret file: ${rel}`);
  if (name === '.DS_Store' || name === 'Thumbs.db') violations.push(`operating-system artifact: ${rel}`);
  if (/^PHASE-[0-9].*\.md$/iu.test(name)) violations.push(`historical phase document: ${rel}`);
  if (/^(?:AUDIT-STATUS|FINALIZATION-STATUS|PNPM-[0-9]+-FIX|VX-PHASE-[0-9]+-AUDIT-STATUS)\.md$/iu.test(name)) {
    violations.push(`temporary project report: ${rel}`);
  }
}
