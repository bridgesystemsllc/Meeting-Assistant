import { test, expect } from '@playwright/test';

test('admin invites a user and the seats footer updates', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /continue with google/i }).click();
  await page.waitForURL(/\/meetings/);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Seats' })).toBeVisible();

  const footer = page.getByTestId('seats-footer');
  await expect(footer).toHaveText(/Seats: \d+ of \d+ used/);
  const before = await footer.textContent();
  const usedBefore = Number(before?.match(/Seats: (\d+)/)?.[1]);

  await page.getByLabel('Email').fill('playwright.invitee@example.com');
  await page.getByLabel('Role').selectOption('member');
  await page.getByRole('button', { name: 'Invite' }).click();

  await expect(page.getByText('playwright.invitee@example.com')).toBeVisible();
  await expect(footer).toHaveText(`Seats: ${usedBefore + 1} of 10 used`);
});
