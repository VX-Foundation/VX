/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { vitePluginVX } from '../src/plugin.js';

type VXPlugin = ReturnType<typeof vitePluginVX> & {
  transform: (this: any, code: string, id: string, options?: { ssr?: boolean }) => { code: string } | null | Promise<any>;
  configResolved?: (config: any) => void | Promise<void>;
};

function createTestRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vx-bundler-test-'));
  const pagesDir = path.join(root, 'src', 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.writeFileSync(path.join(pagesDir, 'index.vx'), '#view\nText("Index")\n#end view\n');
  return root;
}

describe('Vite Plugin VX', () => {
  it('has correct plugin name and enforce property', () => {
    const plugin = vitePluginVX() as VXPlugin;
    expect(plugin.name).toBe('vite-plugin-vx');
    expect(plugin.enforce).toBe('pre');
  });

  it('ignores non-.vx files', () => {
    const plugin = vitePluginVX() as VXPlugin;
    const result = plugin.transform('const x = 1;', 'app.ts');
    expect(result).toBeNull();
  });

  it('transforms a .vx file on the client', () => {
    const root = createTestRoot();
    const plugin = vitePluginVX({ root }) as VXPlugin;
    const filePath = path.join(root, 'src', 'pages', 'index.vx');
    const source = `
#script
  state count: Int = 0
#end script
#view
  Button("Click me")
#end view
    `;
    fs.writeFileSync(filePath, source);

    const result = plugin.transform.call({} as any, source, filePath, { ssr: false }) as { code: string } | null;
    expect(result).not.toBeNull();
    // Verify client code is returned
    expect(result!.code).toContain('state');
  });

  it('returns server code when ssr: true', () => {
    const root = createTestRoot();
    const plugin = vitePluginVX({ root }) as VXPlugin;
    const filePath = path.join(root, 'src', 'pages', 'index.vx');
    const source = `
#script
  server action foo(): Void {}
#end script
    `;
    fs.writeFileSync(filePath, source);

    const result = plugin.transform.call({} as any, source, filePath, { ssr: true }) as { code: string } | null;
    expect(result).not.toBeNull();
    // In our codegen, server actions generate some RPC handling code
    expect(result!.code).toContain('foo');
  });

  it('throws on compilation error', () => {
    const root = createTestRoot();
    const plugin = vitePluginVX({ root }) as VXPlugin;
    const filePath = path.join(root, 'src', 'pages', 'index.vx');
    // Invalid syntax (missing closing parenthesis)
    const source = `
#script
  action foo( {
#end script
    `;
    fs.writeFileSync(filePath, source);

    expect(() => plugin.transform.call({} as any, source, filePath, { ssr: false })).toThrow();
  });
});
