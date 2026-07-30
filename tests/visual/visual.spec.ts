import { expect, test } from '@playwright/test';

test.describe('official visual determinism', () => {
  test.use({ colorScheme: 'light', locale: 'en-US', timezoneId: 'UTC', viewport: { width: 1280, height: 720 } });
  test('produces stable screenshots under fixed rendering inputs', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);
    const first = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: true });
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    const second = await page.screenshot({ animations: 'disabled', caret: 'hide', fullPage: true });
    expect(second.equals(first)).toBe(true);
  });
});
