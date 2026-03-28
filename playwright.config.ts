import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true';
const baseURL = process.env.BASE_URL || (isCI ? 'http://web-test:3100' : 'http://127.0.0.1:3100');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : 3,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer config - tests run in Docker with services orchestrated by docker-compose
});
