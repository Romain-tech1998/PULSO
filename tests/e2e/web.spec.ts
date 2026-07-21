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
    .getByLabel('Filters')
    .getByRole('button', { name: 'Clear all filters' })
    .click();
  await expect(page.getByRole('button', { name: 'Filters (0)' })).toBeVisible();
  await expect(page.getByText(/matching fictional events/)).toBeVisible();
});

test('completes transparent deterministic UJ-0002 and preserves search context', async ({
  page
}) => {
  await page.goto('/');
  const query = page.getByLabel('What do you want to do?');
  await expect(query).toBeVisible();
  await query.fill('free music tonight starting soon');
  await query.press('Enter');

  await expect(
    page.getByRole('heading', { name: 'Pulso understood' })
  ).toBeVisible();
  await expect(page.getByText('Optional deterministic matching')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Clear derived constraint Tonight' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Clear derived constraint Music / concerts'
    })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Clear derived constraint Free' })
  ).toBeVisible();
  await expect(page.getByText('Prefer events starting sooner')).toBeVisible();
  await expect(page.getByText(/exact fictional match/)).toBeVisible();
  await expect(page.getByText(/sign in|create account/i)).toHaveCount(0);
  await expect(page.locator('button.marker')).toHaveCount(1);

  await page
    .getByRole('button', { name: 'Preview search result 1: exact' })
    .click();
  await expect(query).toHaveValue('free music tonight starting soon');
  await expect(page.getByText('Why this matches')).toBeVisible();
  await expect(page.getByText('Price matches: Free')).toBeVisible();
  await page.getByRole('button', { name: 'View event details' }).click();
  await expect(page.getByLabel('Event Details')).toBeVisible();
  await page.getByRole('button', { name: /Back to map/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Pulso understood' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters (3)' })).toBeVisible();

  await page
    .getByRole('button', { name: 'Preview search result 1: exact' })
    .click();
  await page
    .getByRole('button', { name: 'Clear derived constraint Music / concerts' })
    .click();
  await expect(
    page.getByText(
      'The open event preview was closed because the search interpretation changed.'
    )
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Synthetic Montréal Pulse' })
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Filters (2)' }).click();
  await page.getByRole('radio', { name: 'Paid' }).check();
  await page.getByRole('checkbox', { name: 'Comedy' }).check();
  await expect(
    page
      .getByLabel('Optional intelligent search')
      .getByText(/No reliable exact match/)
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters (3)' })).toBeVisible();
  await page.getByRole('button', { name: 'Close filters' }).click();
  await page.getByRole('button', { name: 'Clear search' }).first().click();
  await expect(page.getByRole('button', { name: 'Filters (2)' })).toBeVisible();
  await expect(
    page.getByText(/No events match the active filters/)
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear Paid filter' }).click();
  await page.getByRole('button', { name: 'Clear Comedy filter' }).click();
  await expect(page.getByText(/matching fictional events/)).toBeVisible();

  await query.fill('paid comedy');
  await query.press('Enter');
  await expect(
    page.getByText(/These alternatives differ only as stated/)
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Preview search result 1: alternative' })
    .click();
  await expect(page.getByText('Price differs from paid.')).toBeVisible();

  await page.getByRole('button', { name: 'Clear search' }).first().click();
  await query.fill('surprise me with magic vibes');
  await query.press('Enter');
  await expect(
    page
      .getByLabel('Optional intelligent search')
      .getByText(/could not reliably map this request/)
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /Filters/ })).toBeVisible();
});

test('falls back to French for an unsupported browser locale', async ({
  browser
}) => {
  const context = await browser.newContext({ locale: 'es-MX' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', { name: 'Explorer Montréal' })
  ).toBeVisible();
  await expect(
    page.getByLabel('Carte des événements à Montréal')
  ).toBeVisible();
  await context.close();
});

test('switches, persists, and preserves bilingual map, filter, search, and details context', async ({
  page
}) => {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.context().addCookies([
    {
      name: 'pulso-locale',
      value: 'fr',
      url: 'http://127.0.0.1:3000'
    }
  ]);
  await page.reload();

  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', { name: 'Explorer Montréal' })
  ).toBeVisible();
  await expect(
    page.getByLabel('Carte des événements à Montréal')
  ).toBeVisible();
  await expect(
    page.getByText(/événements fictifs correspondants/)
  ).toBeVisible();

  await page.getByRole('button', { name: 'Filtres (0)' }).click();
  await page.getByRole('checkbox', { name: 'Humour' }).check();
  await expect(
    page.getByRole('button', { name: 'Effacer le filtre Humour' })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fermer les filtres' }).click();

  const query = page.getByLabel('Que voulez-vous faire?');
  await query.fill('humour gratuit, commence bientôt');
  await query.press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Pulso a compris' })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Effacer la contrainte dérivée Humour' })
  ).toBeVisible();
  await expect(
    page.getByText('Privilégier les événements qui commencent plus tôt')
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'Aperçu du résultat de recherche 1 : exact' })
    .click();
  await expect(
    page.getByText('Pourquoi cet événement correspond')
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Imaginary Montréal Comedy Hour' })
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Voir les détails de l’événement' })
    .click();
  const frenchDetails = page.getByLabel('Détails de l’événement');
  await expect(frenchDetails).toBeVisible();
  await expect(
    frenchDetails.getByText('Imaginary Montréal Comedy Hour')
  ).toBeVisible();
  await expect(
    frenchDetails.getByText('Fictional Laughs Collective')
  ).toBeVisible();

  await page.getByRole('button', { name: '← Retour à la carte' }).click();
  await page
    .getByRole('button', { name: 'Effacer la recherche' })
    .first()
    .click();
  await query.fill('humour payant');
  await query.press('Enter');
  await expect(
    page.getByText(/Ces alternatives diffèrent uniquement/)
  ).toBeVisible();
  await page
    .getByRole('button', {
      name: 'Aperçu du résultat de recherche 1 : alternative'
    })
    .click();
  await expect(page.getByText('Le prix diffère de Payant.')).toBeVisible();
  const closeFrenchPreview = page.getByRole('button', {
    name: 'Fermer l’aperçu'
  });
  await closeFrenchPreview.focus();
  await page.keyboard.press('Enter');

  await page
    .getByRole('button', { name: 'Effacer la recherche' })
    .first()
    .click();
  await query.fill('humour à moins de 5 km');
  await query.press('Enter');
  await expect(page.getByText(/Quel lieu explicite Pulso/)).toBeVisible();
  await page
    .getByRole('button', { name: 'Effacer la recherche' })
    .first()
    .click();
  await query.fill('ambiance magique surprise');
  await query.press('Enter');
  await expect(
    page
      .getByLabel('Recherche intelligente facultative')
      .getByText(/n’a pas pu associer cette demande/)
  ).toBeVisible();

  await page
    .getByRole('button', { name: 'Effacer la recherche' })
    .first()
    .click();
  await query.fill('humour gratuit');
  await query.press('Enter');
  await page
    .getByRole('button', { name: 'Aperçu du résultat de recherche 1 : exact' })
    .click();
  await page
    .getByRole('button', { name: 'Voir les détails de l’événement' })
    .click();

  await page.getByRole('radio', { name: 'English' }).check();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel('Event Details')).toBeVisible();
  await expect(
    page.getByLabel('Event Details').getByText('Imaginary Montréal Comedy Hour')
  ).toBeVisible();
  await page.getByRole('button', { name: '← Back to map' }).click();
  await expect(
    page.getByRole('heading', { name: 'Pulso understood' })
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Filters (2)' })).toBeVisible();

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(
    page.getByRole('heading', { name: 'Explore Montréal' })
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('pulso.locale')))
    .toBe('en');

  const englishQuery = page.getByLabel('What do you want to do?');
  await englishQuery.fill('comedy within 5 km');
  await englishQuery.press('Enter');
  await expect(page.getByText(/Which explicit location/)).toBeVisible();
  await page.getByRole('button', { name: 'Clear search' }).first().click();
  await englishQuery.fill('surprise me with magic vibes');
  await englishQuery.press('Enter');
  await expect(
    page
      .getByLabel('Optional intelligent search')
      .getByText(/could not reliably map this request/)
  ).toBeVisible();
});
