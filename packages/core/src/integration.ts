import { PluginHost } from '@vx-foundation/plugins/host';
import { loadIsolatedIntegration } from '@vx-foundation/plugins/sandbox';
import type { PluginPolicyConfig, VXConfig } from '@vx-foundation/types';

export class Context extends PluginHost {
  constructor(root: string, policy: PluginPolicyConfig = {}) { super(root, policy); }
}

export async function runIntegrations(config: VXConfig): Promise<Context> {
  const context = new Context(config.root, config.plugins);
  try {
    for (const reference of config.integrations) {
      const plugin = await loadIsolatedIntegration(reference.name, reference.options, {
        root: config.root,
        ...(config.plugins?.defaultTimeoutMs !== undefined ? { timeoutMs: config.plugins.defaultTimeoutMs } : {})
      });
      try { await context.install(plugin); }
      catch (cause) { await Promise.resolve(plugin.dispose?.()).catch(() => undefined); throw cause; }
    }
    const errors = context.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
    if (errors.length > 0) {
      throw new Error(errors.map((diagnostic) => `[${diagnostic.code}] ${diagnostic.plugin}: ${diagnostic.message}`).join('\n'));
    }
    return context;
  } catch (cause) {
    await context.runHook('close', { root: config.root }).catch(() => undefined);
    throw cause;
  }
}
