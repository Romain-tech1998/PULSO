import type { MetadataRoute } from 'next';

/**
 * Closed beta: Pulso asks not to be indexed.
 *
 * The product is being tested with invited accounts, its venue data is still
 * incomplete, and part of its content is now written by members (DEC-0017).
 * Letting search engines index that state would leave a public footprint of
 * an unfinished product that outlives the beta itself.
 *
 * Set NEXT_PUBLIC_ALLOW_INDEXING=true to open indexing at public launch;
 * a sitemap belongs with that change, not before it.
 */
export default function robots(): MetadataRoute.Robots {
  const allowIndexing = process.env.NEXT_PUBLIC_ALLOW_INDEXING === 'true';
  return {
    rules: allowIndexing
      ? { userAgent: '*', allow: '/' }
      : { userAgent: '*', disallow: '/' }
  };
}
