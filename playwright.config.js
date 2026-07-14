import { defineConfig } from '@playwright/test';

const PORT = process.env.PW_PORT || 4173;
const HOST = '127.0.0.1';
const baseURL = `http://${HOST}:${PORT}`;

const iphoneUserAgent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 7_500 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: 'test-results/playwright',
  workers: 1,
  use: {
    baseURL,
    // WebKit is the iPhone-fidelity default. PW_BROWSER=chromium exists only
    // for sandboxes where WebKit host libraries are unavailable.
    browserName: process.env.PW_BROWSER || 'webkit',
    launchOptions: process.env.PW_NO_SANDBOX ? { args: ['--no-sandbox'] } : {},
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  webServer: {
    command: `PORT=${PORT} npm run serve:foundation`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
  projects: [
    {
      name: 'iphone-390',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: iphoneUserAgent,
      },
    },
    {
      name: 'iphone-430',
      use: {
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        userAgent: iphoneUserAgent,
      },
    },
  ],
});
