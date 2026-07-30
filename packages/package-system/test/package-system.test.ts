import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addPackage, comparePublicContracts, compareSemver, createIntegrity, createPublicationManifest,
  createPublicContractSnapshot, createWorkspaceGraph, emptyLockfile, readLockfile, satisfiesSemver,
  signPackagePayload, topologicalWorkspaceOrder, validSemverRange, validatePackageExports, verifyPackageSignature,
  verifyPublicationManifest, writeLockfile
} from '../src/index.js';

describe('VX package system', () => {
  it('writes a canonical lockfile', () => {
    const root = mkdtempSync(join(tmpdir(), 'vx-lock-'));
    writeLockfile(root, emptyLockfile(root));
    expect(readLockfile(root).version).toBe(1);
  });

  it('mutates registry dependencies without accepting command syntax', () => {
    const root = mkdtempSync(join(tmpdir(), 'vx-package-'));
    writeFileSync(join(root, 'package.json'), '{"name":"demo","version":"1.0.0"}');
    addPackage(root, '@scope/example@1.2.3');
    expect(readFileSync(join(root, 'package.json'), 'utf8')).toContain('"@scope/example": "1.2.3"');
  });

  it('implements deterministic semantic-version comparison and ranges', () => {
    expect(compareSemver('1.0.0-beta.2', '1.0.0')).toBe(-1);
    expect(validSemverRange('^1.2.3 || ~2.0')).toBe(true);
    expect(satisfiesSemver('1.8.0', '^1.2.3')).toBe(true);
    expect(satisfiesSemver('2.0.0', '^1.2.3')).toBe(false);
    expect(satisfiesSemver('0.2.8', '^0.2')).toBe(true);
    expect(satisfiesSemver('0.3.0', '^0.2')).toBe(false);
  });

  it('validates public export keys and wildcard subpaths', () => {
    expect(validatePackageExports({ '.': './dist/index.js', './feature/*': './dist/feature/*.js' }).valid).toBe(true);
    expect(validatePackageExports({ '../private': './dist/private.js' }).valid).toBe(false);
  });

  it('detects breaking public-contract changes', () => {
    const metadata = { schema: 'https://vx.dev/schemas/package/v1' as const, version: 1 as const, name: '@vx/demo', packageVersion: '1.0.0', exports: { '.': './dist/index.js', './old': './dist/old.js' }, privateModules: [], publicContracts: { '.': 'sha512-main', './old': 'sha512-old' } };
    const previous = createPublicContractSnapshot(metadata);
    const next = createPublicContractSnapshot({ ...metadata, packageVersion: '2.0.0', publicContracts: { '.': 'sha512-main' } });
    expect(comparePublicContracts(previous, next).recommendedBump).toBe('major');
  });

  it('discovers recursive workspaces and orders dependencies', () => {
    const root = mkdtempSync(join(tmpdir(), 'vx-workspace-'));
    mkdirSync(join(root, 'packages', 'a'), { recursive: true });
    mkdirSync(join(root, 'packages', 'nested', 'b'), { recursive: true });
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'root', version: '1.0.0', private: true }));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/**'\n");
    writeFileSync(join(root, 'packages', 'a', 'package.json'), JSON.stringify({ name: 'a', version: '1.0.0', dependencies: { b: 'workspace:*' } }));
    writeFileSync(join(root, 'packages', 'nested', 'b', 'package.json'), JSON.stringify({ name: 'b', version: '1.0.0' }));
    expect(topologicalWorkspaceOrder(createWorkspaceGraph(root)).map((item) => item.name)).toEqual(['b', 'a', 'root']);
  });

  it('verifies publication files and rejects tampering', () => {
    const root = mkdtempSync(join(tmpdir(), 'vx-publication-'));
    writeFileSync(join(root, 'package.json'), '{"name":"demo","version":"1.0.0"}');
    writeFileSync(join(root, 'index.js'), 'export const value = 1;');
    const manifest = createPublicationManifest(root, 'demo', '1.0.0', { ignore: ['vx.publication.json', 'vx.signature.json'] });
    writeFileSync(join(root, 'vx.publication.json'), JSON.stringify(manifest));
    expect(verifyPublicationManifest(root, manifest)).toBe(true);
    writeFileSync(join(root, 'index.js'), 'export const value = 2;');
    expect(verifyPublicationManifest(root, manifest)).toBe(false);
  });

  it('verifies integrity and Ed25519 signatures', () => {
    const payload = 'package';
    expect(createIntegrity(payload)).toMatch(/^sha512-/);
    const keys = generateKeyPairSync('ed25519');
    const signature = signPackagePayload(payload, keys.privateKey, 'vx.dev');
    expect(verifyPackageSignature(payload, signature, keys.publicKey)).toBe(true);
  });
});
