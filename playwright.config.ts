import { defineConfig, devices } from '@playwright/test';

const desktop = { viewport: { width: 1440, height: 900 } };
// The port of the local server: scripts/serve.mjs reads the same variable (4173 by default).
const PORT = Number(process.env.PORT) || 4173;
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Chrome-mobile workers crashed (V8 out of memory) with the default worker count on this machine.
  workers: 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  // French by default: the home page redirects other languages to /en/.
  use: { baseURL, locale: 'fr-FR' },
  webServer: {
    command: 'npm run build && npm run serve',
    url: baseURL,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', ...desktop } },
    { name: 'chrome-mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...desktop } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...desktop } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 15'] } },
  ],
});
