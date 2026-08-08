import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { collectSourceFiles, loadSourcePolicy } from './source-package-policy.mjs';

const root = resolve(import.meta.dirname, '../..');
const policy = loadSourcePolicy(root);
const files = collectSourceFiles(root, policy);
if (!existsSync(resolve(root, 'pnpm-lock.yaml'))) {
  const message = 'pnpm-lock.yaml is required for reproducible installs and registry releases.';
  if (process.argv.includes('--require-lockfile')) {
    console.error(`Source allowlist verification failed: ${message}`);
    process.exitCode = 1;
  } else {
    console.warn(`Source allowlist note: ${message}`);
  }
}
console.log(`Source allowlist verified: ${files.length} selected files; generated documentation and build artifacts are excluded.`);
