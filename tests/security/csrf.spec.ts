import { expect, test } from '@playwright/test';

test.describe('Security: CSRF prevention', () => {
  test('rejects an action without a token', async ({ request }) => {
    const response = await request.post('/_vx/rpc/increment', { data: { args: [] }, headers: { origin: 'http://127.0.0.1:4177' } });
    expect(response.status()).toBe(403);
  });

  test('rejects a cross-origin action', async ({ request }) => {
    const response = await request.post('/_vx/rpc/increment', {
      data: { args: [] },
      headers: { origin: 'https://attacker.invalid', 'x-vx-csrf': 'invalid-token' },
    });
    expect(response.status()).toBe(403);
  });
});
