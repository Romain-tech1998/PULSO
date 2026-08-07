import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@pulso/contracts', '@pulso/domain'],
  // Playwright's baseURL is 127.0.0.1, which Next treats as a different
  // origin from the localhost the dev server binds by default. Without this
  // it blocks the /_next dev resources, so the page renders its SSR HTML but
  // never hydrates - every e2e test then fails on an unclickable UI whenever
  // the run reuses a local `next dev` (reuseExistingServer outside CI).
  // Dev-only setting; `next start` is unaffected.
  allowedDevOrigins: ['127.0.0.1']
};

export default nextConfig;
