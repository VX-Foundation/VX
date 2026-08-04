import { describe, expect, it } from 'vitest';
import {
  deserializeServerValue,
  renderElement,
  sanitizeURLAttribute,
  serializeServerValue
} from '../src/server.js';

it('blocks executable URL schemes in browser and SSR contracts', () => {
  expect(sanitizeURLAttribute('java\nscript:alert(1)', { attribute: 'href', tagName: 'a' })).toBeUndefined();
  expect(renderElement('a', { href: 'javascript:alert(1)', target: '_blank' }, 'Unsafe', 'x', 'Link')).not.toContain('javascript:');
  expect(renderElement('a', { href: 'https://vx.dev', target: '_blank' }, 'Safe', 'x', 'Link')).toContain('rel="noopener noreferrer"');
});

it('sanitizes srcset, protocol-relative URLs, and data attribute', () => {
  expect(sanitizeURLAttribute('//cdn.vx.dev/image.png', { attribute: 'src', tagName: 'img' })).toBe('//cdn.vx.dev/image.png');
  expect(sanitizeURLAttribute('javascript:alert(1)', { attribute: 'data', tagName: 'object' })).toBeUndefined();
  expect(sanitizeURLAttribute('https://vx.dev/file.pdf', { attribute: 'data', tagName: 'object' })).toBe('https://vx.dev/file.pdf');
  expect(sanitizeURLAttribute('img1.png 1x, img2.png 2x', { attribute: 'srcset', tagName: 'img' })).toBe('img1.png 1x, img2.png 2x');
  expect(sanitizeURLAttribute('javascript:alert(1) 1x, img2.png 2x', { attribute: 'srcset', tagName: 'img' })).toBe('img2.png 2x');
});

describe('bounded server serialization', () => {
  it('rejects excessive depth and source size', () => {
    expect(() => serializeServerValue({ nested: { value: 1 } }, { maxDepth: 1 })).toThrow(/depth/);
    expect(() => deserializeServerValue('{"version":1,"value":"abcdef"}', { maxStringBytes: 2 })).toThrow(/safety limit/);
  });

  it('round-trips supported values without executable script text', () => {
    const source = serializeServerValue({ text: '</script><script>alert(1)</script>', map: new Map([['x', 1]]) });
    expect(source).not.toContain('</script>');
    const value = deserializeServerValue(source) as { text: string; map: Map<string, number> };
    expect(value.text).toContain('<script>');
    expect(value.map.get('x')).toBe(1);
  });
});
