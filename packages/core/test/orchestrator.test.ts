import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
import { runIntegrations } from '../src/integration.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

describe('Core Orchestrator', () => {
  it('loads missing config with defaults', async () => {
    const config = await loadConfig('/non-existent-dir');
    expect(config.adapter).toBe('node');
    expect(config.srcDir).toBe('src');
    expect(config.integrations).toEqual([]);
  });

  it('loads real config file', async () => {
    const fixtureRoot = resolve(dirname, 'fixture');
    const config = await loadConfig(fixtureRoot);
    expect(config.adapter).toBe('static');
    expect(config.integrations.length).toBe(1);
    expect(config.integrations[0]!.name).toBe('@vx-foundation/plugins/sitemap');
  });

  it('runs integrations from config', async () => {
    const fixtureRoot = resolve(dirname, 'fixture');
    const config = await loadConfig(fixtureRoot);
    const context = await runIntegrations(config);

    expect(context.installed.map((plugin) => plugin.name)).toContain('@vx-foundation/sitemap');
  });
});
