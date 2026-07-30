import { expect, test } from '@playwright/test';

test.describe('official browser accessibility audit', () => {
  test('has named controls, valid document language and predictable keyboard order', async ({ page }) => {
    await page.goto('/');
    const issues = await page.evaluate(() => {
      const failures: string[] = [];
      if (!document.documentElement.lang) failures.push('document-language');
      for (const element of document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')) {
        const name = element.getAttribute('aria-label') ?? element.textContent?.trim() ?? '';
        const labelled = element.getAttribute('aria-labelledby');
        const inputLabel = element instanceof HTMLInputElement ? element.labels?.length ?? 0 : 0;
        if (!name && !labelled && inputLabel === 0) failures.push(`unnamed:${element.tagName.toLowerCase()}`);
        if (Number(element.getAttribute('tabindex')) > 0) failures.push(`positive-tabindex:${element.tagName.toLowerCase()}`);
      }
      return failures;
    });
    expect(issues).toEqual([]);
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Name')).toBeFocused();
  });
});
