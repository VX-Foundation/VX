import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertInteropBoundary, callback, defineInteropModule, defineJSClass, resolveNpmInteropPackage, treeShakeInterop } from '../src/index.js';

describe('VX interoperability', () => {
  it('enforces client/server boundaries', () => {
    expect(() => assertInteropBoundary('client', 'node', 'node:fs')).toThrow(/server-only/);
  });

  it('tree shakes side-effect-free declarations', () => {
    const contract = defineInteropModule({ module: 'demo', environment: 'universal', sideEffects: false, exports: [
      { module: 'demo', exportName: 'used', kind: 'function', environment: 'universal', pure: true },
      { module: 'demo', exportName: 'unused', kind: 'function', environment: 'universal', pure: true }
    ] });
    expect(treeShakeInterop(contract, new Set(['used'])).exports).toHaveLength(1);
  });

  it('wraps classes and disposable callbacks', () => {
    class Value { constructor(readonly value: number) {} }
    expect(defineJSClass('demo', 'Value', Value).construct(3).value).toBe(3);
    const handler = callback((value: number) => value + 1, { once: true });
    expect(handler(2)).toBe(3);
    expect(() => handler(2)).toThrow(/after disposal/);
  });

  it('selects browser/import exports rather than require', () => {
    const root = mkdtempSync(join(tmpdir(), 'vx-interop-'));
    const packageRoot = join(root, 'node_modules', 'conditional-package');
    mkdirSync(join(packageRoot, 'dist'), { recursive: true });
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name: 'conditional-package', version: '1.0.0', type: 'module', sideEffects: false, exports: { '.': { types: './dist/index.d.ts', browser: './dist/browser.js', import: './dist/import.js', require: './dist/require.cjs' } } }));
    writeFileSync(join(packageRoot, 'dist', 'browser.js'), 'export const runtime = "browser";');
    writeFileSync(join(packageRoot, 'dist', 'import.js'), 'export const runtime = "import";');
    writeFileSync(join(packageRoot, 'dist', 'require.cjs'), 'module.exports = {};');
    writeFileSync(join(packageRoot, 'dist', 'index.d.ts'), 'export declare const runtime: string;');
    const resolved = resolveNpmInteropPackage('conditional-package', { importerRoot: root, importerEnvironment: 'client' });
    expect(basename(resolved.entry)).toBe('browser.js');
    expect(resolved.declarations).toContain('runtime: string');
  });
});
