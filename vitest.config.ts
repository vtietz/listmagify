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
    testTimeout: 15000,
    include: [
      'tests/unit/**/*.{test,spec}.{ts,tsx}',
      'features/**/*.{test,spec}.{ts,tsx}',
      'shared/**/*.{test,spec}.{ts,tsx}',
      'widgets/**/*.{test,spec}.{ts,tsx}',
      'lib/**/*.{test,spec}.{ts,tsx}',
      'components/**/*.{test,spec}.{ts,tsx}',
    ],
    exclude: ['tests/e2e/**', 'node_modules/**', '.next/**'],
    setupFiles: ['tests/setup/vitest.setup.ts'],
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  resolve: {
    alias: [
      { find: /^@features\//, replacement: `${root}features/` },
      { find: /^@shared\//, replacement: `${root}shared/` },
      { find: /^@widgets\//, replacement: `${root}widgets/` },
      // Support both "@/..." and "@" prefix forms
      { find: /^@\//, replacement: root },
      { find: '@', replacement: root },
    ],
  },
});