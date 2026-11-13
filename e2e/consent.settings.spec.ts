import { test, expect } from '@playwright/test';

test('consent settings show the disclosure policy and reject a non-disclosing bot name', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /continue with google/i }).click();
  await page.waitForURL(/\/meetings/);

  await page.goto('/settings/consent');
  await expect(page.getByRole('heading', { name: 'Consent' })).toBeVisible();
  await expect(page.getByTestId('consent-policy')).toHaveText('All-party notice');
  await expect(page.getByTestId('store-audio')).toContainText('Transcript only');
  await expect(page.getByText('[PRODUCT NAME]', { exact: false }).first()).toBeVisible();

  await page.getByLabel('Bot display name').fill('Company Bot');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByTestId('bot-name-error')).toContainText('BOT_NAME_NOT_DISCLOSING');
});
