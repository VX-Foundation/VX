import { describe, expect, it } from 'vitest';
import { visualPropertyToCss } from '../src/visual/properties.js';

describe('VX visual color properties', () => {
  it('resolves native palette colors through the runtime types export', () => {
    expect(visualPropertyToCss('surface', '"sky-500"')).toEqual([
      { name: 'background-color', value: '#07b6d5' }
    ]);
  });
});
