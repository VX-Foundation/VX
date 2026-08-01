import { describe, expect, it } from 'vitest';
import { reviewLockfileText, reviewPackageManifest, runFuzzCampaign, scanSecrets } from '../src/index.js';

describe('@vx-foundation/security-testing', () => {
  it('runs deterministic fuzz campaigns', async () => expect((await runFuzzCampaign({ seed: 9, iterations: 20, corpus: ['vx'], target() {} })).crashes).toHaveLength(0));
  it('reports the number of main-loop executions before stopping', async () => {
    const report = await runFuzzCampaign({ seed: 3, iterations: 10, corpus: ['vx'], target() { throw new Error('crash'); }, stopAfterFirstCrash: true });
    expect(report.executions).toBe(1);
    expect(report.crashes).toHaveLength(1);
  });
  it('finds private key material', () => expect(scanSecrets(['-----BEGIN ', 'PRIVATE KEY-----'].join('')).some((item) => item.rule === 'private-key')).toBe(true));
  it('rejects lifecycle scripts', () => expect(reviewPackageManifest({ scripts: { postinstall: 'node setup.js' } }).some((item) => item.severity === 'error')).toBe(true));
  it('rejects remote lockfile resolutions without matching package-name false positives', () => {
    expect(reviewLockfileText('packages:\n  dependency-file:\n    resolution: {integrity: sha512-YQ==}').some((item) => item.code === 'VX_SUPPLY_LOCK_REMOTE')).toBe(false);
    expect(reviewLockfileText('packages:\n  pkg:\n    specifier: https://example.invalid/pkg.tgz\n    integrity: sha512-YQ==').some((item) => item.code === 'VX_SUPPLY_LOCK_REMOTE')).toBe(true);
  });
  it('requires integrity by default', () => expect(reviewLockfileText('lockfileVersion: 9').some((item) => item.code === 'VX_SUPPLY_INTEGRITY' && item.severity === 'error')).toBe(true));
});
