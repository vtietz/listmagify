import { defineConfig } from 'vitest/config';

/**
 * Minimal Vitest config for unit tests in jsdom.
 * Maps "@/..." imports to the project root so tests can import app files.
 */
const root = new URL('.', import.meta.url).pathname;

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['tests/setup/vitest.setup.ts'],
  },
  resolve: {
    alias: [
      // Support both "@/..." and "@" prefix forms
      { find: /^@\//, replacement: root },
      { find: '@', replacement: root },
    ],
  },
});