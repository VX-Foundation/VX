import { describe, it, expect } from 'vitest';
import { startDevServer } from '../src/index.js';

describe('Dev Server', () => {
  it('exports startDevServer', () => {
    expect(startDevServer).toBeTypeOf('function');
  });
});
