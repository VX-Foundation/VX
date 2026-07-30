import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadIsolatedIntegration, PluginHost, signPluginManifest, sitemap, snapshotPluginSource } from '../dist/index.js';

describe('VX plugin platform', () => {
  it('requires isolation by default and permits explicit trusted first-party installation', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vx-plugin-'));
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'vx.routes.json'), JSON.stringify({ version: 1, routes: [{ pathname: '/' }, { pathname: '/docs' }, { pathname: '/users/:id' }] }));
    const plugin = sitemap({ site: 'https://example.com' });
    await expect(new PluginHost(root).install(plugin)).rejects.toThrow(/loadIsolatedIntegration/);
    const host = new PluginHost(root);
    await host.installTrusted(plugin);
    await host.runHook('buildEnd', { root, outDir: 'dist' });
    const xml = readFileSync(join(root, 'dist', 'sitemap.xml'), 'utf8');
    expect(xml).toContain('https://example.com/docs');
    expect(xml).not.toContain(':id');
  });

  it('binds detached signatures to the executable plugin source', async () => {
    const root = mkdtempSync(join(tmpdir(), 'vx-signed-plugin-'));
    const packageRoot = join(root, 'node_modules', 'signed-plugin');
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: 'signed-plugin', version: '1.0.0', type: 'module', exports: './index.js' }));
    const manifest = { name: 'signed-plugin', version: '1.0.0', apiVersion: '1' as const, capabilities: ['config'] as const, permissions: [] as const, deterministic: true };
    writeFileSync(join(packageRoot, 'index.js'), `export default { name: 'signed-plugin', manifest: ${JSON.stringify(manifest)}, setup() {} };`);
    const snapshot = snapshotPluginSource(pathToFileURL(join(packageRoot, 'index.js')).href, root);
    const keys = generateKeyPairSync('ed25519');
    writeFileSync(join(packageRoot, 'vx.plugin.json'), JSON.stringify(signPluginManifest({ ...manifest, integrity: snapshot.integrity }, keys.privateKey, 'test')));
    const integration = await loadIsolatedIntegration('signed-plugin', undefined, { root });
    const host = new PluginHost(root, { requireSignatures: true, publicKeys: { test: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString() } });
    await expect(host.install(integration)).resolves.toBeUndefined();
  });

  it('rejects undeclared capabilities', async () => {
    const host = new PluginHost('/project', { allowInProcess: true });
    await expect(host.install({
      name: 'unsafe',
      manifest: { name: 'unsafe', version: '1.0.0', apiVersion: '1', capabilities: ['config'], permissions: ['read-project'], deterministic: true },
      setup(context) { context.emitFile('bad.txt', 'bad'); }
    })).rejects.toThrow(/capability/);
  });
});
