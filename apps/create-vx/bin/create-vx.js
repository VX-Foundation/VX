#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entry = new URL('../dist/index.js', import.meta.url);
if (!existsSync(fileURLToPath(entry))) {
  console.error('create-vx has not been built. Run `pnpm --filter @vx-foundation/create-vx build` and try again.');
  process.exitCode = 1;
} else {
  await import(entry.href);
}
