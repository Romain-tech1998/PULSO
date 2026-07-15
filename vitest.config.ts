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
      '@pulso/domain': fileURLToPath(
        new URL('./packages/domain/src/index.ts', import.meta.url)
      )
    }
  },
  test: {
    include: ['apps/**/*.test.ts', 'packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', 'tests/integration/**'],
    coverage: { reporter: ['text', 'json', 'html'] }
  }
});
