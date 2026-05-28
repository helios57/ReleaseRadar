import { defineConfig, devices } from '@playwright/test';

const BASE = process.env.RR_BASE_URL ?? 'http://localhost:8080';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /global\.setup\.ts$/,
    },
    {
      name: 'chromium',
      testIgnore: /global\.setup\.ts$/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],
});
