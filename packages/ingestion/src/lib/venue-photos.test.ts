import { describe, expect, it } from 'vitest';

import {
  composeCommonsAttribution,
  extractOpenGraphImage,
  plainTextCredit,
  resolveCommonsPhotos,
  resolveVenuePhotos,
  resolveWebsitePhoto,
  resolveWikidataImages
} from './venue-photos.js';

const noPause = async (): Promise<void> => undefined;

function jsonResponder(payloadFor: (url: string) => unknown): typeof fetch {
  return (async (url: string) =>
    new Response(JSON.stringify(payloadFor(url)), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })) as unknown as typeof fetch;
}

function htmlResponder(html: string): typeof fetch {
  return (async () =>
    new Response(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' }
    })) as unknown as typeof fetch;
}

describe('plainTextCredit', () => {
  it('reduces the HTML Commons returns to a name', () => {
    expect(
      plainTextCredit(
        '<a href="//commons.wikimedia.org/wiki/User:Jean">Jean Gagnon</a>'
      )
    ).toBe('Jean Gagnon');
  });

  it('decodes the entities that survive tag stripping', () => {
    expect(plainTextCredit('Roy &amp; Fils&nbsp;')).toBe('Roy & Fils');
  });
});

describe('composeCommonsAttribution', () => {
  it('names the author and the licence when both are known', () => {
    expect(
      composeCommonsAttribution('<span>Jean Gagnon</span>', 'CC BY-SA 4.0')
    ).toBe('Photo : Jean Gagnon (CC BY-SA 4.0)');
  });

  it('still credits Commons when the author is unknown', () => {
    // A missing author is not permission to drop the credit: the licence is
    // what requires it, and the licence is still there.
    expect(composeCommonsAttribution(undefined, 'CC BY-SA 4.0')).toBe(
      'Photo : Wikimedia Commons (CC BY-SA 4.0)'
    );
    expect(composeCommonsAttribution(undefined, undefined)).toBe(
      'Photo : Wikimedia Commons'
    );
  });
});

describe('resolveWikidataImages', () => {
  it('reads the P18 claim', async () => {
    const result = await resolveWikidataImages(['Q1128578'], {
      pause: noPause,
      fetchImpl: jsonResponder(() => ({
        entities: {
          Q1128578: {
            claims: {
              P18: [
                { mainsnak: { datavalue: { value: 'Musee McCord 02.jpg' } } }
              ]
            }
          }
        }
      }))
    });
    expect(result.get('Q1128578')).toBe('Musee McCord 02.jpg');
  });

  it('omits an entity with no photo rather than inventing a placeholder', async () => {
    const result = await resolveWikidataImages(['Q1'], {
      pause: noPause,
      fetchImpl: jsonResponder(() => ({ entities: { Q1: { claims: {} } } }))
    });
    expect(result.size).toBe(0);
  });

  it('batches, so a full Montréal run is two requests and not seventy-eight', async () => {
    let requests = 0;
    const ids = Array.from({ length: 78 }, (_, index) => `Q${index}`);
    await resolveWikidataImages(ids, {
      pause: noPause,
      fetchImpl: (async () => {
        requests += 1;
        return new Response(JSON.stringify({ entities: {} }), { status: 200 });
      }) as unknown as typeof fetch
    });
    expect(requests).toBe(2);
  });
});

describe('resolveCommonsPhotos', () => {
  const page = {
    title: 'File:Musee McCord 02.jpg',
    imageinfo: [
      {
        url: 'https://upload.wikimedia.org/full.jpg',
        thumburl: 'https://upload.wikimedia.org/800px.jpg',
        descriptionurl: 'https://commons.wikimedia.org/wiki/File:Musee.jpg',
        extmetadata: {
          Artist: { value: '<a href="#">Jean Gagnon</a>' },
          LicenseShortName: { value: 'CC BY-SA 4.0' }
        }
      }
    ]
  };

  it('prefers the scaled rendition over the multi-megabyte original', async () => {
    const result = await resolveCommonsPhotos(['Musee McCord 02.jpg'], {
      pause: noPause,
      fetchImpl: jsonResponder(() => ({ query: { pages: { '1': page } } }))
    });
    const photo = result.get('File:Musee McCord 02.jpg');
    expect(photo?.imageUrl).toBe('https://upload.wikimedia.org/800px.jpg');
    expect(photo?.source).toBe('wikimedia_commons');
    expect(photo?.attribution).toBe('Photo : Jean Gagnon (CC BY-SA 4.0)');
    expect(photo?.pageUrl).toBe(
      'https://commons.wikimedia.org/wiki/File:Musee.jpg'
    );
  });

  it('accepts a tag that already carries the File: prefix', async () => {
    let requested = '';
    await resolveCommonsPhotos(['File:Musee McCord 02.jpg'], {
      pause: noPause,
      fetchImpl: (async (url: string) => {
        requested = url;
        return new Response(JSON.stringify({ query: { pages: {} } }), {
          status: 200
        });
      }) as unknown as typeof fetch
    });
    expect(requested).not.toContain('File%3AFile%3A');
  });

  it('ignores a category tag, which has no single image behind it', async () => {
    let called = false;
    const result = await resolveCommonsPhotos(['Category:Bars in Montreal'], {
      pause: noPause,
      fetchImpl: (async () => {
        called = true;
        return new Response(JSON.stringify({ query: { pages: {} } }), {
          status: 200
        });
      }) as unknown as typeof fetch
    });
    expect(result.size).toBe(0);
    expect(called).toBe(false);
  });

  it('skips a file Commons reports as missing', async () => {
    const result = await resolveCommonsPhotos(['Gone.jpg'], {
      pause: noPause,
      fetchImpl: jsonResponder(() => ({
        query: { pages: { '-1': { title: 'File:Gone.jpg', missing: '' } } }
      }))
    });
    expect(result.size).toBe(0);
  });
});

describe('extractOpenGraphImage', () => {
  it('reads og:image', () => {
    expect(
      extractOpenGraphImage(
        '<head><meta property="og:image" content="https://cdn.example/bar.jpg"></head>',
        'https://bar.example/'
      )
    ).toBe('https://cdn.example/bar.jpg');
  });

  it('resolves a relative URL against the page it came from', () => {
    expect(
      extractOpenGraphImage(
        '<meta property="og:image" content="/img/hero.jpg">',
        'https://bar.example/accueil'
      )
    ).toBe('https://bar.example/img/hero.jpg');
  });

  it('falls back to twitter:image', () => {
    expect(
      extractOpenGraphImage(
        '<meta name="twitter:image" content="https://cdn.example/t.jpg">',
        'https://bar.example/'
      )
    ).toBe('https://cdn.example/t.jpg');
  });

  it('ignores ordinary img tags, which are logos and spacers as often as photos', () => {
    expect(
      extractOpenGraphImage(
        '<body><img src="https://cdn.example/logo.png"></body>',
        'https://bar.example/'
      )
    ).toBeUndefined();
  });

  it('ignores a data: or javascript: content value', () => {
    expect(
      extractOpenGraphImage(
        '<meta property="og:image" content="javascript:alert(1)">',
        'https://bar.example/'
      )
    ).toBeUndefined();
  });
});

describe('resolveWebsitePhoto', () => {
  it('returns the preview image with its provenance', async () => {
    const photo = await resolveWebsitePhoto('https://bar.example/', {
      fetchImpl: htmlResponder(
        '<meta property="og:image" content="https://cdn.example/bar.jpg">'
      )
    });
    expect(photo).toEqual({
      imageUrl: 'https://cdn.example/bar.jpg',
      source: 'website_og',
      pageUrl: 'https://bar.example/'
    });
  });

  it("carries no attribution, since the photo is the venue's own", async () => {
    // Captioning a bar's listing "Photo: that bar" would be noise, not credit.
    const photo = await resolveWebsitePhoto('https://bar.example/', {
      fetchImpl: htmlResponder(
        '<meta property="og:image" content="https://cdn.example/bar.jpg">'
      )
    });
    expect(photo?.attribution).toBeUndefined();
  });

  it('gives up quietly on a dead domain', async () => {
    const throwing = (async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof fetch;
    expect(
      await resolveWebsitePhoto('https://gone.example/', {
        fetchImpl: throwing
      })
    ).toBeUndefined();
  });

  it('gives up on a non-HTML response', async () => {
    const pdf = (async () =>
      new Response('%PDF', {
        status: 200,
        headers: { 'content-type': 'application/pdf' }
      })) as unknown as typeof fetch;
    expect(
      await resolveWebsitePhoto('https://bar.example/menu.pdf', {
        fetchImpl: pdf
      })
    ).toBeUndefined();
  });

  it('gives up on a malformed website tag', async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response('', { status: 200 });
    }) as unknown as typeof fetch;
    expect(
      await resolveWebsitePhoto('not a url', { fetchImpl: spy })
    ).toBeUndefined();
    expect(called).toBe(false);
  });
});

describe('resolveVenuePhotos', () => {
  it("prefers Commons over the venue's own website", async () => {
    const photos = await resolveVenuePhotos(
      [
        {
          key: 'node/1',
          hints: { wikidata: 'Q1', website: 'https://bar.example/' }
        }
      ],
      {
        pause: noPause,
        fetchImpl: jsonResponder((url) =>
          url.includes('wikidata')
            ? {
                entities: {
                  Q1: {
                    claims: {
                      P18: [{ mainsnak: { datavalue: { value: 'Bar.jpg' } } }]
                    }
                  }
                }
              }
            : {
                query: {
                  pages: {
                    '1': {
                      title: 'File:Bar.jpg',
                      imageinfo: [
                        {
                          thumburl: 'https://upload.wikimedia.org/bar.jpg',
                          extmetadata: {
                            LicenseShortName: { value: 'CC BY-SA 4.0' }
                          }
                        }
                      ]
                    }
                  }
                }
              }
        )
      }
    );
    expect(photos.get('node/1')?.source).toBe('wikimedia_commons');
  });

  it('marks a raw image tag as such, not as freely licensed Commons content', async () => {
    const photos = await resolveVenuePhotos(
      [{ key: 'node/2', hints: { image: 'https://example.org/bar.jpg' } }],
      { pause: noPause, fetchImpl: jsonResponder(() => ({})) }
    );
    expect(photos.get('node/2')?.source).toBe('osm_image_tag');
  });

  it('leaves a venue with no lead without a photo', async () => {
    const photos = await resolveVenuePhotos([{ key: 'node/3', hints: {} }], {
      pause: noPause,
      fetchImpl: jsonResponder(() => ({}))
    });
    expect(photos.size).toBe(0);
  });

  it('can be told to skip websites entirely', async () => {
    const photos = await resolveVenuePhotos(
      [{ key: 'node/4', hints: { website: 'https://bar.example/' } }],
      {
        pause: noPause,
        includeWebsites: false,
        fetchImpl: jsonResponder(() => ({}))
      }
    );
    expect(photos.size).toBe(0);
  });
});
