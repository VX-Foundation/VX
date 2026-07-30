import { expect, test } from '@playwright/test';

test.describe('VX production browser fixture', () => {
  test('renders, preserves focus and executes a protected action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('VX production fixture');
    const input = page.getByLabel('Name');
    await input.fill('VX user');
    await input.focus();
    await expect(input).toBeFocused();
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByRole('status')).toHaveText('1');
    await expect(input).toHaveValue('VX user');
  });

  test('supports keyboard navigation and safe external links', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Name')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Increment' })).toBeFocused();
    await expect(page.locator('#external')).toHaveAttribute('rel', /noopener/);
    await expect(page.locator('#external')).toHaveAttribute('rel', /noreferrer/);
    await expect(page.locator('#blocked')).not.toHaveAttribute('href', /.+/);
  });
});
