import { defineConfig, devices } from '@playwright/test';

const isCI = process.env.CI === 'true';
const baseURL = isCI ? 'http://web-test:3100' : 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 1 : undefined,
  reporter: 'html',
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
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: isCI
    ? undefined
    : {
        command: 'run.bat test:stack:up',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
});
