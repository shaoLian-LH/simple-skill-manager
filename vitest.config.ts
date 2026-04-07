import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 30_000,
    include: ['tests/**/*.test.ts'],
  },
});
