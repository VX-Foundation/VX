import { createJiti } from 'jiti';
import { resolve } from 'node:path';
import type { StyleConfig, VXConfig } from '@vx-foundation/types';
import { fileURLToPath } from 'node:url';

/**
 * Type helper to provide autocomplete and type checking for VX configuration.
 *
 * @param config - The user-provided partial configuration.
 * @returns The same configuration, strictly typed.
 */
export function defineConfig(config: Partial<VXConfig>): Partial<VXConfig> {
  return config;
}

/**
 * Dynamically resolves and loads the project's `vx.config.ts` or `vx.config.js`.
 * Applies default fallback values if the file is absent or properties are missing.
 *
 * @param root - The absolute path to the project root directory. Defaults to `process.cwd()`.
 * @returns A fully resolved `VXConfig` object.
 */
export async function loadConfig(root: string = process.cwd()): Promise<VXConfig> {
  const jiti = createJiti(fileURLToPath(import.meta.url));
  const configPath = resolve(root, 'vx.config.ts');
  
  try {
    const rawConfig = await jiti.import(configPath, { default: true }) as Partial<VXConfig>;
    
    return {
      root,
      srcDir: rawConfig.srcDir ?? 'src',
      outDir: rawConfig.outDir ?? 'dist',
      styles: Array.isArray(rawConfig.styles)
        ? { mode: 'compiler', files: rawConfig.styles }
        : {
            mode: (rawConfig.styles && !Array.isArray(rawConfig.styles) ? (rawConfig.styles as StyleConfig).mode : undefined) ?? 'compiler',
            files: (rawConfig.styles && !Array.isArray(rawConfig.styles) ? (rawConfig.styles as StyleConfig).files : undefined) ?? []
          },
      server: {
        port: rawConfig.server?.port ?? 4000,
        strictPort: rawConfig.server?.strictPort ?? false,
        ...(rawConfig.server?.host !== undefined ? { host: rawConfig.server.host } : {}),
        https: rawConfig.server?.https ?? false
      },
      adapter: rawConfig.adapter ?? 'node',
      integrations: rawConfig.integrations ?? [],
      ...(rawConfig.build ? { build: rawConfig.build } : {}),
      ...(rawConfig.plugins ? { plugins: rawConfig.plugins } : {}),
      experimental: rawConfig.experimental ?? {},
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes('Cannot find module') || (err as NodeJS.ErrnoException).code === 'MODULE_NOT_FOUND' || (err as NodeJS.ErrnoException).code === 'ERR_MODULE_NOT_FOUND') {
      return {
        root,
        srcDir: 'src',
        outDir: 'dist',
        server: {
          port: 4000,
          strictPort: false,
          https: false
        },
        adapter: 'node',
        integrations: [],
      };
    }
    throw err;
  }
}
