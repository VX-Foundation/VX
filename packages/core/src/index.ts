import { loadConfig } from './config.js';
import { runIntegrations } from './integration.js';
import { startDevServer } from '@vx-foundation/dev-server';
import { build as bundlerBuild } from '@vx-foundation/bundler';
import type { BuildOptions } from '@vx-foundation/bundler';
import { startPreview, type PreviewOptions } from './preview.js';

export { defineConfig, loadConfig } from './config.js';
export { Context, runIntegrations } from './integration.js';
export { packageLibrary } from './package.js';
export type { PackageLibraryOptions } from './package.js';

export async function dev(root: string = process.cwd()) {
  const config = await loadConfig(root);
  const context = await runIntegrations(config);
  let closed = false;
  const closeContext = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    await context.runHook('close', { root: config.root, outDir: config.outDir, mode: 'development' });
  };
  try {
    await context.runHook('configResolved', { root: config.root, outDir: config.outDir, mode: 'development', metadata: { config } });
    await context.runHook('devServerStart', { root: config.root, outDir: config.outDir, mode: 'development' });
    const server = await startDevServer({ root: config.root, srcDir: config.srcDir });
    const closeServer = server.close.bind(server);
    server.close = async () => { try { await closeServer(); } finally { await closeContext(); } };
    server.httpServer?.once('close', () => { void closeContext(); });
    return { config, context, server };
  } catch (cause) {
    await closeContext().catch(() => undefined);
    throw cause;
  }
}

export type BuildOverrides = Partial<Omit<BuildOptions, 'root' | 'outDir' | 'srcDir'>>;

export async function build(root: string = process.cwd(), overrides: BuildOverrides = {}) {
  const config = await loadConfig(root);
  const context = await runIntegrations(config);
  const configuredAdapter = context.adapter
    ? { name: context.adapter.name, options: { module: context.adapter.module } }
    : config.adapter;
  const mode = overrides.mode ?? config.build?.['mode'] ?? 'production';
  const targets = overrides.targets ?? config.build?.['targets'];
  const adapterName = typeof configuredAdapter === 'string' ? configuredAdapter : configuredAdapter.name;
  await context.runHook('configResolved', { root: config.root, outDir: config.outDir, mode, ...(targets ? { targets } : {}), adapter: adapterName, metadata: { config } });
  await context.runHook('buildStart', { root: config.root, outDir: config.outDir, mode, ...(targets ? { targets } : {}), adapter: adapterName });
  try {
    const result = await bundlerBuild({
      root: config.root,
      outDir: config.outDir,
      srcDir: config.srcDir,
      adapter: configuredAdapter,
      ...config.build,
      ...overrides
    });
    await context.runHook('buildEnd', { root: config.root, outDir: config.outDir, mode, targets: result.targets, adapter: result.adapter, metadata: { result } });
    return { config, context, result };
  } finally {
    await context.runHook('close', { root: config.root, outDir: config.outDir, mode, ...(targets ? { targets } : {}), adapter: adapterName });
  }
}

export async function preview(root: string = process.cwd(), options: Partial<Omit<PreviewOptions, 'root' | 'outDir'>> = {}) {
  const config = await loadConfig(root);
  return startPreview({ root: config.root, outDir: config.outDir, ...options });
}
