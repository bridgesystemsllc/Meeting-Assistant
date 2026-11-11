import { test, expect } from '@playwright/test';

test('login, app shell, logout', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: '[PRODUCT NAME]' })).toBeVisible();
  await expect(page.getByRole('link', { name: /continue with google/i })).toBeVisible();

  await page.getByRole('link', { name: /continue with google/i }).click();
  await page.waitForURL(/\/meetings/);
  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible();
  await expect(page.getByTestId('tenant-display-name')).toHaveText('Acme Notes');
  await expect(page.getByRole('button', { name: /avery owner|owner@example.com/i })).toBeVisible();

  await page.goto('/meetings/00000000-0000-0000-0000-000000000099');
  await expect(page.getByRole('heading', { name: 'Meeting not found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to meetings' }).click();
  await expect(page).toHaveURL(/\/meetings\/?$/);
  await expect(page.getByRole('heading', { name: 'Meetings' })).toBeVisible();

  await page.getByRole('button', { name: /avery owner|owner@example.com/i }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForURL(/\/login/);
  await expect(page.getByRole('link', { name: /continue with google/i })).toBeVisible();
});
