import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const checks = [
  'scripts/verify-phase1.mjs',
  'scripts/verify-phase1-runtime.mjs',
  'scripts/verify-phase2.mjs',
  'scripts/verify-phase2-runtime.mjs',
  'scripts/verify-phase3.mjs',
  'scripts/verify-phase3-runtime.mjs',
  'scripts/verify-phase3-component.mjs',
  'scripts/verify-phase4.mjs',
  'scripts/verify-phase5.mjs',
  'scripts/verify-phase5-runtime.mjs',
  'scripts/verify-phase6.mjs',
  'scripts/verify-phase6-runtime.mjs',
  'scripts/verify-phase7.mjs',
  'scripts/verify-phase7-runtime.mjs',
  'scripts/verify-phase8.mjs',
  'scripts/verify-phase8-runtime.mjs',
  'scripts/verify-phase9.mjs',
  'scripts/verify-phase9-runtime.mjs',
  'scripts/verify-phase10.mjs',
  'scripts/verify-phase10-runtime.mjs',
  'scripts/verify-phase11.mjs',
  'scripts/verify-phase11-runtime.mjs',
  'scripts/verify-phase12.mjs',
  'scripts/verify-phase12-runtime.mjs',
  'scripts/verify-phase13.mjs',
  'scripts/verify-phase13-runtime.mjs',
  'scripts/verify-phase14.mjs',
  'scripts/verify-phase14-runtime.mjs',
  'scripts/verify-phase15.mjs',
  'scripts/verify-phase15-runtime.mjs',
  'scripts/verify-phase16.mjs',
  'scripts/verify-phase16-runtime.mjs',
  'scripts/verify-phase17.mjs',
  'scripts/verify-phase17-runtime.mjs',
  'scripts/verify-phase18.mjs',
  'scripts/verify-phase18-runtime.mjs',
  'scripts/verify-phase19.mjs',
  'scripts/verify-phase19-runtime.mjs',
  'scripts/verify-phase20.mjs',
  'scripts/verify-phase20-runtime.mjs',
  'apps/browser-devtools/scripts/verify.mjs',
  'scripts/benchmark/verify-public-benchmark.mjs'
];

for (const check of checks) {
  const result = spawnSync(process.execPath, [resolve(root, check)], {
    cwd: root,
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log(`Framework conformance passed (${checks.length} checks).`);
