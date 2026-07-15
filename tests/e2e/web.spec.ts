import { expect, test } from '@playwright/test';

test('opens the synthetic Montréal map surface', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Explore Montréal' })
  ).toBeVisible();
  await expect(page.getByLabel('Montréal event map')).toBeVisible();
});
