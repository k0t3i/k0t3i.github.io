import { test, expect } from '@playwright/test';

test('fr page', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
});

test('en page', async ({ page }) => {
  const response = await page.goto('/en/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});

test('unknown path', async ({ page, request }) => {
  const response = await request.get('/nope');
  expect(response.status()).toBe(404);
  const notFound = await page.goto('/nope');
  expect(notFound?.status()).toBe(404);
  await expect(page.locator('h1')).toBeVisible();
  const body = await request.get('/404.html');
  expect(await response.text()).toBe(await body.text());
});

test('no hydration warning', async ({ page }) => {
  const messages: string[] = [];
  page.on('console', (m) => messages.push(m.text()));
  page.on('pageerror', (e) => messages.push(e.message));
  for (const path of ['/', '/en/', '/nope']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(messages.filter((m) => /hydrat/i.test(m))).toEqual([]);
  expect(messages.filter((m) => /content security policy/i.test(m))).toEqual([]);
});

test('directory without trailing slash redirects like Pages', async ({ request }) => {
  const response = await request.get('/en', { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()['location']).toBe('/en/');
});
