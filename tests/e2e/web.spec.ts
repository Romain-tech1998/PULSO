import { expect, test } from '@playwright/test';

// Traceability: UJ-0001 stages 1–5; PRD-0001 MAP-001/003/006,
// EVENT-001/005, REDIRECT-001/003, STATE-002, RESPONSIVE-001/003,
// and ACCESS-001/003.

test('completes anonymous UJ-0001 and preserves map context', async ({
  page
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Explore Montréal' })
  ).toBeVisible();
  await expect(page.getByLabel('Montréal event map')).toBeVisible();
  await expect(page.getByText(/matching fictional event/)).toBeVisible();
  await expect(page.getByText(/sign in|create account/i)).toHaveCount(0);

  const marker = page.getByRole('button', {
    name: 'Preview Synthetic Montréal Pulse'
  });
  await marker.focus();
  await page.keyboard.press('Enter');

  await expect(
    page.getByRole('heading', { name: 'Synthetic Montréal Pulse' })
  ).toBeVisible();
  await expect(page.getByText('Synthetic Montréal Venue')).toBeVisible();
  await expect(page.getByText('Free', { exact: true })).toBeVisible();
  await expect(page.getByText('Music / concerts')).toBeVisible();

  await page.getByRole('button', { name: 'View event details' }).click();
  await expect(page.getByLabel('Event Details')).toBeVisible();
  await expect(
    page.getByText('1000 Rue Synthétique, Montréal, QC')
  ).toBeVisible();
  await expect(
    page.getByText(
      'Free entry. No reservation is required for this fictional fixture.'
    )
  ).toBeVisible();
  await expect(page.getByText(/No freshness claim is made/)).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: /Open Synthetic event source \(example.com\) — external destination/
    })
  ).toHaveAttribute(
    'href',
    'http://localhost:3001/events/00000000-0000-4000-8000-000000000001/external'
  );

  await page.getByRole('button', { name: '← Back to map' }).click();
  await expect(page.getByLabel('Montréal event map')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Synthetic Montréal Pulse' })
  ).toBeVisible();
  await expect(page.locator('[data-map-context="preserved"]')).toBeVisible();
});

test('filters anonymously and preserves the filtered map context', async ({
  page
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Filters (0)' })).toBeVisible();

  await page.getByRole('button', { name: 'Filters (0)' }).click();
  await page.getByRole('checkbox', { name: 'Comedy' }).check();
  await expect(
    page.getByRole('button', { name: 'Clear Comedy filter' })
  ).toBeVisible();
  await expect(page.getByText('1 matching fictional event')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Preview Imaginary Montréal Comedy Hour' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Preview Synthetic Montréal Pulse' })
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Close filters' }).click();
  await page
    .getByRole('button', { name: 'Preview Imaginary Montréal Comedy Hour' })
    .click();
  await page.getByRole('button', { name: 'View event details' }).click();
  await expect(
    page.getByRole('heading', { name: 'Imaginary Montréal Comedy Hour' })
  ).toBeVisible();
  await page.getByRole('button', { name: '← Back to map' }).click();
  await expect(
    page.getByRole('button', { name: 'Clear Comedy filter' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Preview Imaginary Montréal Comedy Hour' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Clear Comedy filter' }).click();
  await expect(page.getByRole('button', { name: 'Filters (0)' })).toBeVisible();

  await page
    .getByRole('button', { name: 'Preview Synthetic Montréal Pulse' })
    .click();
  await page.getByRole('button', { name: 'Filters (0)' }).click();
  await page.getByRole('checkbox', { name: 'Comedy' }).check();
  await expect(
    page.getByText(
      'The open event preview was closed because the filters changed.'
    )
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Synthetic Montréal Pulse' })
  ).toHaveCount(0);

  await page.getByRole('radio', { name: 'Paid' }).check();
  await expect(
    page.getByText('No events match the active filters')
  ).toBeVisible();
  await page
    .getByLabel('Map filters')
    .getByRole('button', { name: 'Clear all filters' })
    .click();
  await expect(page.getByRole('button', { name: 'Filters (0)' })).toBeVisible();
  await expect(page.getByText(/matching fictional events/)).toBeVisible();
});
