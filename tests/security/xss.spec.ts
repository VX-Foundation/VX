import { expect, test } from '@playwright/test';

test.describe('Security: XSS prevention', () => {
  test('serializes hostile state without creating executable nodes', async ({ page }) => {
    const payload = '</script><img src=x onerror="globalThis.__vxOwned=true">';
    await page.goto(`/?payload=${encodeURIComponent(payload)}`);
    await expect(page.locator('#payload')).toHaveText(payload);
    expect(await page.evaluate(() => (globalThis as typeof globalThis & { __vxOwned?: boolean }).__vxOwned)).toBeUndefined();
    await expect(page.locator('img')).toHaveCount(0);
  });

  test('sends production security headers', async ({ request }) => {
    const response = await request.get('/');
    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['cross-origin-opener-policy']).toBe('same-origin');
    expect(response.headers()['content-security-policy']).toContain("object-src 'none'");
  });
});
