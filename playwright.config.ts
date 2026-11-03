import { defineConfig, devices } from '@playwright/test';

const desktop = { viewport: { width: 1440, height: 900 } };
// The port of the local server: scripts/serve.mjs reads the same variable (4173 by default).
const PORT = Number(process.env.PORT) || 4173;
const baseURL = `http://localhost:${PORT}`;
// The populated back side, built into dist-populated/ and served on the next port (project "populated").
const POPULATED_PORT = PORT + 1;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Chrome-mobile workers crashed (V8 out of memory) with the default worker count on this machine.
  workers: 4,
  reporter: [['list'], ['html', { open: 'never' }]],
  // French by default: the home page redirects other languages to /en/.
  use: { baseURL, locale: 'fr-FR' },
  // One after the other: the two builds share the temporary folder of vite-ssg.
  webServer: [
    {
      command: 'npm run build && npm run serve',
      url: baseURL,
      env: { PORT: String(PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run build && npm run serve',
      url: `http://localhost:${POPULATED_PORT}`,
      env: { PORT: String(POPULATED_PORT), BACK_VARIANT: 'populated', DIST_DIR: 'dist-populated' },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', ...desktop } },
    { name: 'chrome-mobile', use: { ...devices['Pixel 7'], channel: 'chrome' } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], ...desktop } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], ...desktop } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 15'] } },
    // The other variant of the back side: its own build, checked by the back-face tests only.
    {
      name: 'populated',
      testMatch: ['a11y.spec.ts', 'depth.spec.ts'],
      grep: /back face/,
      use: { ...devices['Desktop Chrome'], channel: 'chrome', ...desktop, baseURL: `http://localhost:${POPULATED_PORT}` },
    },
  ],
});
