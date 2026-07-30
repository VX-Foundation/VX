import { describe, expect, it } from 'vitest';
import { createRouteHarness } from '@vx/testing';

describe('official route testing', () => {
  it('tests matching and navigation through one production-shaped contract', async () => {
    const harness = createRouteHarness({
      match: async (url) => url === '/users/42' ? { id: 42 } : null,
      navigate: async (url) => ({ url, status: 200 })
    });
    await expect(harness.match('/users/42')).resolves.toEqual({ id: 42 });
    await expect(harness.navigate('/users/42')).resolves.toEqual({ url: '/users/42', status: 200 });
  });
});
