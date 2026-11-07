import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    maxConcurrency: 1,
    reporters: process.env.CI ? ['dot', 'github-actions'] : ['default'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    setupFiles: [
      path.resolve(__dirname, './src/tests/vitest.env.ts'),
      path.resolve(__dirname, './src/tests/vitest.setup.ts'),
    ],
  },
});
