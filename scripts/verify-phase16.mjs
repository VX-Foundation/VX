import assert from 'node:assert/strict';
import {
  compareDesignSystems,
  contrast,
  createCssModule,
  defineDesignSystem,
  eliminateDeadStyles,
  extractStyles,
  packageDesignSystem,
  resolveDesignTokens,
  serializeKeyframes,
  splitStyleChunks
} from '../packages/runtime/dist/index.js';
import { getBuiltinRole } from '../packages/compiler/dist/visual/catalog.js';

const base = defineDesignSystem({
  name: 'vx-base',
  version: '1.0.0',
  tokens: {
    'color.surface': { kind: 'color', value: '#ffffff' },
    'color.action': { kind: 'color', value: '#2563eb' },
    'space.md': { kind: 'length', value: '1rem' }
  }
});
const product = defineDesignSystem({
  name: 'vx-product',
  version: '1.1.0',
  extends: base,
  tokens: { 'color.link': '{color.action}' },
  modes: { dark: { 'color.surface': '#111827' } }
});
const tokens = resolveDesignTokens(product, { mode: 'dark' });
assert.equal(tokens['color.surface'], '#111827');
assert.equal(tokens['color.link'], '#2563eb');
assert.match(packageDesignSystem(product).cssText, /--vx-color-link:#2563eb/);
const breaking = compareDesignSystems(product, defineDesignSystem({ name: 'vx-product', version: '2.0.0', tokens: { 'color.link': '#2563eb' } }));
assert.ok(breaking.some((change) => change.kind === 'removed' && change.breaking));

const cssModule = createCssModule('.button{display:block}.label{color:red}', 'phase16');
assert.match(cssModule.classes['button'] ?? '', /^button_/);
const chunks = [
  { id: 'tokens', cssText: ':root{--vx-a:1}', critical: true, layer: 'tokens' },
  { id: 'shell', cssText: '.shell{display:grid}', dependencies: ['tokens'], layer: 'components' },
  { id: 'unused', cssText: '.unused{display:none}' }
];
const selected = eliminateDeadStyles(chunks, new Set(['shell']));
assert.deepEqual(selected.map((chunk) => chunk.id), ['tokens', 'shell']);
const manifest = extractStyles(chunks, new Set(['shell']));
assert.match(manifest.criticalCss, /@layer vx\.tokens/);
assert.match(manifest.deferredCss, /shell/);
const routes = splitStyleChunks(chunks, { '/': ['shell'], '/empty': [] });
assert.equal(routes['/']?.chunks.length, 2);
assert.equal(routes['/empty']?.chunks.length, 0);
assert.match(serializeKeyframes('fade', { from: { opacity: 0 }, to: { opacity: 1 } }), /@keyframes fade/);
assert.equal(contrast('#000000', '#ffffff').level, 'aaa');

assert.equal(getBuiltinRole('popover')?.properties['z'], 'overlay');
assert.equal(getBuiltinRole('region')?.arguments?.['writing'], 'writingMode');
console.log('Phase 16 behavioral verification passed (tokens, CSS pipeline, accessibility contrast, overlays, and writing modes).');
