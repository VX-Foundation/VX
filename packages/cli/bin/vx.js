#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entry = new URL('../dist/cli.js', import.meta.url);
if (!existsSync(fileURLToPath(entry))) {
  console.error('VX CLI has not been built. Run `pnpm --filter @vx-foundation/cli build` and try again.');
  process.exitCode = 1;
} else {
  await import(entry.href);
}
