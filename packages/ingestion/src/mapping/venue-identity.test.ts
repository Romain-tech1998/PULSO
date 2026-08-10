import { describe, expect, it } from 'vitest';

import {
  addressSimilarity,
  completenessScore,
  isUsableUrl,
  matchVenues,
  nameSimilarity,
  parseAddress
} from './venue-identity.js';

describe('nameSimilarity', () => {
  it('ignores a leading article', () => {
    expect(nameSimilarity('Le Cheval Blanc', 'Cheval Blanc')).toBe(1);
  });

  it('ignores the kind of place in the name', () => {
    expect(nameSimilarity('Bar Le Cocktail', 'Le Cocktail')).toBe(1);
    expect(
      nameSimilarity('Théâtre du Rideau Vert', 'Rideau Vert')
    ).toBeGreaterThan(0.9);
  });

  it('ignores accents and punctuation', () => {
    expect(
      nameSimilarity("Théâtre d'Aujourd'hui", 'Theatre d Aujourdhui')
    ).toBeGreaterThan(0.9);
  });

  it('keeps genuinely different places apart', () => {
    expect(nameSimilarity('Barfly', 'Turbo Haus')).toBe(0);
    expect(nameSimilarity('Casa del Popolo', 'La Sala Rossa')).toBe(0);
  });

  it('does not treat two all-generic names as the same place', () => {
    // With every token stripped there is no core left to compare; falling
    // back to the full token set is what stops "Le Bar" and "La Maison"
    // scoring 1 against each other.
    expect(nameSimilarity('Le Bar', 'La Maison')).toBeLessThan(0.5);
  });
});

describe('parseAddress', () => {
  it('separates the house number from the street', () => {
    expect(parseAddress('4479 Rue Saint-Denis, Montréal, H2J 2L2')).toEqual({
      houseNumber: '4479',
      streetTokens: ['rue', 'saint', 'denis', 'h2j', '2l2']
    });
  });

  it('normalizes Montréal street abbreviations', () => {
    expect(parseAddress('809 Av. St-Laurent E').streetTokens).toEqual([
      'avenue',
      'saint',
      'laurent',
      'est'
    ]);
  });

  it('copes with no house number', () => {
    expect(parseAddress('Boulevard Saint-Laurent').houseNumber).toBeUndefined();
  });
});

describe('addressSimilarity', () => {
  it('matches the same street written differently', () => {
    expect(
      addressSimilarity('809 Rue St-Denis', '809 rue Saint-Denis, Montréal')
    ).toBeGreaterThan(0.8);
  });

  it('treats a differing house number as decisive', () => {
    // Two doors on one street are two places, however identical the rest of
    // the string reads.
    expect(
      addressSimilarity('4479 Rue Saint-Denis', '4481 Rue Saint-Denis')
    ).toBe(0);
  });

  it('does not match two different streets', () => {
    expect(
      addressSimilarity('809 Rue Ontario Est', '4234 Boulevard Saint-Laurent')
    ).toBeLessThan(0.4);
  });
});

describe('matchVenues', () => {
  const chevalBlancOntario = {
    name: 'Le Cheval Blanc',
    address: '809 Rue Ontario Est, Montréal',
    point: { longitude: -73.5645, latitude: 45.5175 }
  };

  it('merges the same name mapped twice a street apart', () => {
    // The real case from the live directory: OSM carries this brewpub both
    // on Ontario Est and on Rivard, 200 m and one name-article apart.
    const chevalBlancRivard = {
      name: 'Cheval Blanc',
      address: 'Rue Rivard, Montréal',
      point: { longitude: -73.5665, latitude: 45.5188 }
    };
    const match = matchVenues(chevalBlancOntario, chevalBlancRivard);
    expect(match.same).toBe(true);
    expect(match.reason).toBe('same-name-nearby');
  });

  it('merges a similar name at a matching address', () => {
    const match = matchVenues(
      { name: "Théâtre d'Aujourd'hui", address: '3900 Rue Saint-Denis' },
      { name: 'Theatre Aujourdhui', address: '3900 rue St-Denis, Montréal' }
    );
    expect(match.same).toBe(true);
    expect(match.reason).toBe('similar-name-same-address');
  });

  it('leaves a rebrand as two rows rather than risk a false merge', () => {
    // Same address, same point, different name. Reading that as a rebrand
    // was tried and reverted: on the live directory it merged the six halls
    // of Place des Arts into one row. Two rows for a renamed bar is a
    // cosmetic problem; deleting Maison symphonique is not.
    const match = matchVenues(
      {
        name: 'Divan Orange',
        address: '4234 Boulevard Saint-Laurent',
        point: { longitude: -73.5789, latitude: 45.5178 }
      },
      {
        name: 'Le Ministère',
        address: '4234 boul. St-Laurent, Montréal',
        point: { longitude: -73.5789, latitude: 45.5178 }
      }
    );
    expect(match.same).toBe(false);
  });

  it('does not merge two venues of one organisation on a short shared name', () => {
    // Real pair from the live directory: the Fondation PHI on Rue Saint-Jean
    // and the PHI Centre on Rue Saint-Pierre, 150 m apart. Both cores reduce
    // to "phi", so name and distance agreed completely - and they are two
    // different venues.
    const match = matchVenues(
      {
        name: 'PHI',
        address: '451 Rue Saint-Jean, Montréal',
        point: { longitude: -73.5570564, latitude: 45.5024667 }
      },
      {
        name: 'Centre Phi',
        address: '407 Rue Saint-Pierre, Montréal',
        point: { longitude: -73.5563151, latitude: 45.5013472 }
      }
    );
    expect(match.same).toBe(false);
  });

  it('still merges a short name when the address itself agrees', () => {
    // Being strict on proximity costs nothing, because a genuinely matching
    // address is stronger evidence than distance and catches these anyway.
    const match = matchVenues(
      {
        name: 'Pow Pow',
        address: '4459 Rue Saint-Denis',
        point: { longitude: -73.5687, latitude: 45.5241 }
      },
      {
        name: 'Pow Pow',
        address: '4459, Rue Saint-Denis, Montréal, QC H2J 2L2',
        point: { longitude: -73.5687, latitude: 45.5241 }
      }
    );
    expect(match.same).toBe(true);
    expect(match.reason).toBe('similar-name-same-address');
  });

  it('does not merge two civic buildings that share a borough name', () => {
    // Real pair from the live directory. Montréal venues are routinely named
    // after the neighbourhood they sit in, so "Rivière-des-Prairies" alone
    // carries most of both names - and the address agrees because they are
    // on the same civic block.
    const match = matchVenues(
      {
        name: 'Bibliothèque de Rivière-des-Prairies',
        address: '9001 Boulevard Perras, Montréal',
        point: { longitude: -73.5401, latitude: 45.6501 }
      },
      {
        name: 'Centre Communautaire Rivière-Des-Prairies',
        address: '9001 Boulevard Perras, Montréal',
        point: { longitude: -73.5401, latitude: 45.6501 }
      }
    );
    expect(match.same).toBe(false);
  });

  it('keeps two bars of the same name in different districts apart', () => {
    const match = matchVenues(chevalBlancOntario, {
      name: 'Cheval Blanc',
      address: '1500 Rue Notre-Dame Ouest',
      point: { longitude: -73.5712, latitude: 45.4899 }
    });
    expect(match.same).toBe(false);
  });

  it('keeps the halls of one complex apart', () => {
    // The case that killed the rebrand tier. These share a street address
    // and a coordinate and are six different venues.
    const placeDesArts = {
      address: '175 Rue Sainte-Catherine Ouest, Montréal',
      point: { longitude: -73.5673, latitude: 45.5077 }
    };
    for (const other of [
      'Maison symphonique de Montréal',
      'Théâtre Jean-Duceppe',
      'Théâtre Maisonneuve',
      'Cinquième Salle'
    ]) {
      const match = matchVenues(
        { name: 'Salle Wilfrid-Pelletier', ...placeDesArts },
        { name: other, ...placeDesArts }
      );
      expect(match.same).toBe(false);
    }
  });

  it('keeps two tenants of one building apart', () => {
    // A gallery inside the Belgo is not the Belgo.
    const match = matchVenues(
      {
        name: 'Édifice Belgo',
        address: '372 Rue Sainte-Catherine Ouest',
        point: { longitude: -73.5698, latitude: 45.5041 }
      },
      {
        name: 'SBC Gallery of Contemporary Art',
        address: '372 Rue Sainte-Catherine Ouest',
        point: { longitude: -73.5698, latitude: 45.5041 }
      }
    );
    expect(match.same).toBe(false);
  });

  it('does not merge neighbours with different names', () => {
    const match = matchVenues(
      {
        name: 'Barfly',
        address: '4062A Boulevard Saint-Laurent',
        point: { longitude: -73.5789, latitude: 45.5166 }
      },
      {
        name: 'Turbo Haus',
        address: '2040 Rue Saint-Denis',
        point: { longitude: -73.5679, latitude: 45.5152 }
      }
    );
    expect(match.same).toBe(false);
    expect(match.reason).toBe('no-match');
  });

  it('will not merge on name alone when there is no position', () => {
    const match = matchVenues(
      { name: 'Pub Saint-Paul' },
      { name: 'Pub Saint-Paul' }
    );
    expect(match.same).toBe(false);
  });
});

describe('isUsableUrl', () => {
  it('accepts a real link', () => {
    expect(isUsableUrl('https://lepointdevente.com/billets/abc')).toBe(true);
  });

  it('rejects what is not a link', () => {
    expect(isUsableUrl(undefined)).toBe(false);
    expect(isUsableUrl('')).toBe(false);
    expect(isUsableUrl('à venir')).toBe(false);
    expect(isUsableUrl('javascript:alert(1)')).toBe(false);
    // No dot in the host: not something a visitor can be sent to.
    expect(isUsableUrl('http://localhost/tickets')).toBe(false);
  });
});

describe('completenessScore', () => {
  it('ranks a ticketed, illustrated record above a bare one', () => {
    const rich = completenessScore({
      ticketingUrl: 'https://lepointdevente.com/billets/abc',
      imageUrl: 'https://cdn.example/show.jpg',
      description: 'Une soirée de musique électronique avec quatre artistes.',
      price: { kind: 'paid' }
    });
    const bare = completenessScore({ address: '809 Rue Ontario Est' });
    expect(rich).toBeGreaterThan(bare);
  });

  it('counts a ticketing link for more than a photo', () => {
    // The link is the one field a visitor leaves Pulso to act on.
    const ticketed = completenessScore({
      ticketingUrl: 'https://lepointdevente.com/billets/abc'
    });
    const illustrated = completenessScore({
      imageUrl: 'https://cdn.example/show.jpg'
    });
    expect(ticketed).toBeGreaterThan(illustrated);
  });

  it('does not count a broken ticketing link', () => {
    expect(completenessScore({ ticketingUrl: 'à venir' })).toBe(0);
  });

  it('does not count an unknown price as information', () => {
    expect(completenessScore({ price: { kind: 'unknown' } })).toBe(0);
  });
});
