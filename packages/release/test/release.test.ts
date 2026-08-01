import { describe, expect, it } from 'vitest';
import {
  compareApiSnapshots,
  createProvenanceManifest,
  createReleaseChannelPlan,
  validatePackagePolicy,
  verifyProvenanceManifest,
  type WorkspaceApiSnapshot
} from '../src/index.js';

function snapshot(version: string, symbols: Array<{ name: string; kind: string; hash: string }>): WorkspaceApiSnapshot {
  return {
    schema: 'https://vx.dev/schemas/public-api-snapshot/v1',
    version: 1,
    packages: [{ name: '@vx-foundation/example', version, peerDependencies: {}, entrypoints: [{ subpath: '.', typesPath: 'dist/index.d.ts', symbols }] }]
  };
}

describe('release compatibility', () => {
  it('requires a major bump when a public declaration changes', () => {
    const report = compareApiSnapshots(
      snapshot('1.0.0', [{ name: 'compile', kind: 'function', hash: 'old' }]),
      snapshot('1.1.0', [{ name: 'compile', kind: 'function', hash: 'new' }])
    );
    expect(report.valid).toBe(false);
    expect(report.requiredImpact).toBe('major');
  });

  it('accepts a minor bump for an additive symbol', () => {
    const report = compareApiSnapshots(
      snapshot('1.0.0', [{ name: 'compile', kind: 'function', hash: 'same' }]),
      snapshot('1.1.0', [
        { name: 'compile', kind: 'function', hash: 'same' },
        { name: 'inspect', kind: 'function', hash: 'new' }
      ])
    );
    expect(report.valid).toBe(true);
    expect(report.requiredImpact).toBe('minor');
  });
});

describe('release policy and provenance', () => {
  it('rejects install scripts and unpinned registries', () => {
    const result = validatePackagePolicy({
      name: '@vx-foundation/example', version: '1.0.0', description: 'Example package.', type: 'module', license: 'MIT',
      author: { name: 'Veelv' }, files: ['dist', 'README.md', 'LICENSE'], keywords: ['vx', 'example', 'framework'],
      exports: { '.': './dist/index.js' }, sideEffects: false,
      engines: { node: '>=22.11.0 <23 || >=24.11.0 <25' },
      repository: { type: 'git', url: 'git+https://github.com/VX-Foundation/vx.git' },
      homepage: 'https://github.com/VX-Foundation/vx/tree/main/packages/example#readme', bugs: { url: 'https://github.com/VX-Foundation/vx/issues' },
      publishConfig: { access: 'public', registry: 'https://mirror.invalid/' }, scripts: { postinstall: 'node install.js' }
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain('VX_RELEASE_LIFECYCLE_SCRIPT');
  });

  it('detects provenance tampering', () => {
    const manifest = createProvenanceManifest('@vx-foundation/example', '1.0.0', 'abc123', [{ path: 'dist/index.js', content: 'safe' }]);
    expect(verifyProvenanceManifest(manifest, [{ path: 'dist/index.js', content: 'safe' }])).toBe(true);
    expect(verifyProvenanceManifest(manifest, [{ path: 'dist/index.js', content: 'changed' }])).toBe(false);
  });

  it('creates explicit release channels', () => {
    expect(createReleaseChannelPlan({ channel: 'stable', baseVersion: '1.0.0' }).npmTag).toBe('latest');
    expect(createReleaseChannelPlan({ channel: 'next', baseVersion: '1.1.0', sequence: 2 }).version).toBe('1.1.0-next.2');
    expect(createReleaseChannelPlan({ channel: 'canary', baseVersion: '1.1.0', sequence: 3, revision: 'ABC-123' }).version).toBe('1.1.0-canary.abc123.3');
  });
});
