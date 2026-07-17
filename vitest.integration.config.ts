import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@pulso/contracts': fileURLToPath(
        new URL('./packages/contracts/src/index.ts', import.meta.url)
      ),
      '@pulso/database': fileURLToPath(
        new URL('./packages/database/src/index.ts', import.meta.url)
      ),
      '@pulso/domain/localization': fileURLToPath(
        new URL('./packages/domain/src/localization.ts', import.meta.url)
      ),
      '@pulso/domain': fileURLToPath(
        new URL('./packages/domain/src/index.ts', import.meta.url)
      ),
      '@pulso/search': fileURLToPath(
        new URL('./packages/search/src/index.ts', import.meta.url)
      )
    }
  },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
    pool: 'forks',
    maxWorkers: 1
  }
});
