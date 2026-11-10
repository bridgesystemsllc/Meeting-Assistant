import { test, expect } from '@playwright/test';

test('admin opens Activity after an invite and sees the event', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: /continue with google/i }).click();
  await page.waitForURL(/\/meetings/);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Seats' })).toBeVisible();

  await page.getByLabel('Email').fill('activity.invitee@example.com');
  await page.getByLabel('Role').selectOption('member');
  await page.getByRole('button', { name: 'Invite' }).click();
  await expect(page.getByText('activity.invitee@example.com')).toBeVisible();

  await page.getByRole('navigation', { name: 'Settings' }).getByRole('link', { name: 'Activity' }).click();
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Workspace activity' })).toBeVisible();
  await expect(page.getByText('Invite sent')).toBeVisible();
  await expect(page.getByText('a***@example.com')).toBeVisible();
});
