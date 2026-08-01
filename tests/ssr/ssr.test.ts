import { describe, expect, it } from 'vitest';
import { assertDeterministicMarkup } from '@vx-foundation/testing';

describe('official SSR testing', () => {
  it('requires deterministic markup', async () => {
    await expect(assertDeterministicMarkup(() => '<main><h1>VX</h1></main>', 4)).resolves.toContain('<h1>VX</h1>');
  });
});
