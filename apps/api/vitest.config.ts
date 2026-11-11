import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    hookTimeout: 120_000,
    testTimeout: 60_000,
    fileParallelism: false,
    exclude: ['dist/**', 'node_modules/**'],
  },
});
