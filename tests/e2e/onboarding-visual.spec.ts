import { expect, test } from '@playwright/test';

test('onboarding stays readable and contained at responsive sizes', async ({
  page
}, testInfo) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();

  const tour = page.getByRole('dialog');
  await expect(tour).toBeVisible();
  await expect(tour.locator('img')).toHaveAttribute(
    'src',
    '/brand/pulso-logo-horizontal-dark.svg'
  );

  const viewport = page.viewportSize();
  const box = await tour.boundingBox();
  expect(viewport).not.toBeNull();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);

  const buttons = await tour.getByRole('button').all();
  for (const button of buttons) {
    const buttonBox = await button.boundingBox();
    expect(buttonBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(viewport!.width);

  await page.screenshot({
    path: testInfo.outputPath('onboarding.png'),
    fullPage: true
  });

  await tour.getByRole('button', { name: /skip|passer/i }).click();

  await expect(
    page.getByRole('region', {
      name: /carte des événements|event map/i
    })
  ).toBeVisible();
  await expect(
    page.getByRole('textbox', {
      name: /que voulez-vous faire|what do you want to do/i
    })
  ).toBeVisible();

  const mapShell = page.locator('.map-container-wrapper').first();
  const mapBox = await mapShell.boundingBox();
  expect(mapBox).not.toBeNull();
  expect(mapBox!.height).toBeGreaterThanOrEqual(viewport!.height - 2);

  if (viewport!.width <= 768) {
    await expect(page.locator('.anonymous-primary-rail')).toBeHidden();
    await expect(page.locator('.mobile-bottom-nav')).toBeVisible();
  } else {
    await expect(page.locator('.anonymous-primary-rail')).toBeVisible();
    await expect(page.locator('.mobile-bottom-nav')).toBeHidden();
    expect(mapBox!.x).toBeGreaterThanOrEqual(100);
  }

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth)
  ).toBeLessThanOrEqual(viewport!.width);

  await page.screenshot({
    path: testInfo.outputPath('landing.png'),
    fullPage: false
  });
});
