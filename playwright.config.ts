import { defineConfig, devices } from '@playwright/test';

const useLocal =
  process.env.PATROL_E2E_LOCAL !== '0' && process.env.PATROL_E2E_PROD !== '1';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1,
  retries: process.env.CI ? 2 : 1,
  grep: process.env.PATROL_E2E_GREP ? new RegExp(process.env.PATROL_E2E_GREP) : undefined,
  use: {
    baseURL: useLocal ? 'http://127.0.0.1:4173' : 'https://vieforce-patrol.vercel.app',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: useLocal
    ? {
        command: 'npx --yes serve . -l 4173',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
      }
    : undefined,
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  reporter: [['list'], ['html', { open: 'never' }]],
});
