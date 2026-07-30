import { expect, test } from '@playwright/test';

test.describe('VX forms', () => {
  test('enhances submission, keeps values, associates errors and focuses the first invalid field', async ({ page }) => {
    await page.goto('/form');
    await page.getByLabel('Name').fill('A');
    await page.getByLabel('Email').fill('invalid');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toContainText('Must contain at least 2 characters.');
    await expect(page.getByLabel('Name')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByLabel('Name')).toBeFocused();
    await expect(page.getByLabel('Email')).toHaveValue('invalid');
  });

  test('submits successfully with progressive enhancement', async ({ page }) => {
    await page.goto('/form');
    await page.getByLabel('Name').fill('Ada');
    await page.getByLabel('Email').fill('ada@example.com');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Registration complete');
  });

  test('submits without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('/form');
    await page.getByLabel('Name').fill('Grace');
    await page.getByLabel('Email').fill('grace@example.com');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Registration complete');
    await context.close();
  });
});
