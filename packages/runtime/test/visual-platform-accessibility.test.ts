import { describe, expect, it } from 'vitest';
import { compareDesignSystems, defineDesignSystem, packageDesignSystem, resolveDesignTokens } from '../src/design-system.js';
import { contrast } from '../src/accessibility.js';
import { createCssModule, extractStyles, serializeKeyframes } from '../src/styling.js';

describe('Phase 16 visual platform', () => {
  it('resolves inherited typed tokens and detects breaking removals', () => {
    const base = defineDesignSystem({ name: 'base', version: '1.0.0', tokens: { 'color.surface': { kind: 'color', value: '#ffffff' }, 'space.md': '1rem' } });
    const branded = defineDesignSystem({ name: 'brand', version: '1.1.0', extends: base, tokens: { 'color.action': { kind: 'color', value: '#2563eb' } }, modes: { dark: { 'color.surface': '#111827' } } });
    expect(resolveDesignTokens(branded, { mode: 'dark' })['color.surface']).toBe('#111827');
    expect(packageDesignSystem(branded).cssText).toContain('--vx-color-action');
    expect(compareDesignSystems(branded, defineDesignSystem({ name: 'brand', version: '2.0.0', tokens: { 'color.action': '#2563eb' } })).some((change) => change.breaking)).toBe(true);
  });

  it('supports CSS modules, critical extraction, keyframes and contrast validation', () => {
    const module = createCssModule('.button{display:block}', 'button');
    expect(module.classes['button']).toMatch(/^button_/);
    const manifest = extractStyles([{ id: 'base', cssText: ':root{}', critical: true }, { id: 'page', cssText: '.page{}', dependencies: ['base'] }], new Set(['page']));
    expect(manifest.criticalCss).toContain(':root');
    expect(manifest.deferredCss).toContain('.page');
    expect(serializeKeyframes('fade', { from: { opacity: 0 }, to: { opacity: 1 } })).toContain('@keyframes fade');
    expect(contrast('#000000', '#ffffff').level).toBe('aaa');
  });
});
