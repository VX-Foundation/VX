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
