import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const policy = JSON.parse(readFileSync(resolve(root, 'quality/coverage-policy.json'), 'utf8'));
for (const target of policy.targets) {
  for (const packageName of target.packages) {
    const args = [
      '--filter', packageName, 'exec', 'vitest', 'run',
      '--coverage.enabled=true', '--coverage.provider=v8',
      '--coverage.reporter=text', '--coverage.reporter=json-summary',
      `--coverage.thresholds.lines=${target.lines}`,
      `--coverage.thresholds.functions=${target.functions}`,
      `--coverage.thresholds.statements=${target.statements}`,
      `--coverage.thresholds.branches=${target.branches}`
    ];
    console.log(`Coverage ${target.name}: ${packageName}`);
    const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
