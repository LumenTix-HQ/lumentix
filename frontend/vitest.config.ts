/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // app/ and components/ are intentionally INCLUDED in coverage now (they
      // were previously excluded, which made the gate meaningless for the UI
      // layer). Playwright e2e specs live under tests/e2e and are excluded.
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        'playwright.config.ts',
      ],
      // Realistic floor for the now-broader measurement. Raise as unit-test
      // coverage of app/ and components/ grows (tracked with the other frontend
      // testing issues).
      thresholds: {
        lines: 20,
        functions: 20,
        branches: 20,
        statements: 20,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
