import { describe, expect, it } from 'vitest';

import { mapMontrealOpenDataRow } from './montreal-open-data.js';

const observedAt = '2026-07-28T12:00:00.000Z';

function row(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return {
    titre: 'Concert au parc',
    date_debut: '2026-08-01T18:00:00',
    date_fin: '',
    type_evenement: 'musique',
    description: 'Un concert en plein air.',
    titre_adresse: 'Parc de la Savane',
    adresse_principale: 'Rue Exemple, Montréal, QC, Canada',
    long: '-73.6',
    lat: '45.5',
    cout: '',
    url_fiche: 'https://montreal.ca/evenements/concert-au-parc-12345',
    arrondissement: 'Le Plateau-Mont-Royal',
    ...overrides
  };
}

describe('mapMontrealOpenDataRow', () => {
  it('sets identitySeed from the stable civic address rather than the drifting venue-name field', () => {
    const mapped = mapMontrealOpenDataRow(row(), observedAt);
    expect(mapped?.identitySeed).toBe('rue exemple montreal qc canada');
    // Display name still prefers the prettier titre_adresse text.
    expect(mapped?.venueName).toBe('Parc de la Savane');
  });

  it('leaves identitySeed undefined when no address is available', () => {
    const mapped = mapMontrealOpenDataRow(row({ adresse_principale: 'nan' }), observedAt);
    expect(mapped?.identitySeed).toBeUndefined();
  });

  it('excludes a family/kids-audience event by forcing category to unmapped', () => {
    const mapped = mapMontrealOpenDataRow(
      row({
        titre: 'Ciné-biblio',
        type_evenement: 'cinéma',
        description: 'Venez voir de merveilleux films pour enfants dans notre salle.'
      }),
      observedAt
    );
    expect(mapped?.category).toBe('unmapped');
  });

  it('excludes a family event matched via the title rather than the description', () => {
    const mapped = mapMontrealOpenDataRow(
      row({ titre: 'Cinéma en plein air en famille', description: '' }),
      observedAt
    );
    expect(mapped?.category).toBe('unmapped');
  });

  it('does not exclude an ordinary event with no family/kids signal', () => {
    const mapped = mapMontrealOpenDataRow(row(), observedAt);
    expect(mapped?.category).toBe('music');
  });
});
