import { test, expect } from '@playwright/test';
import { EN, FR, SITE } from '../helpers/copy';

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
  for (const path of ['/', '/en/', '/index.html', '/en/index.html', '/nope']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  expect(messages.filter((m) => /hydrat/i.test(m))).toEqual([]);
  expect(messages.filter((m) => /content security policy/i.test(m))).toEqual([]);
});

for (const path of ['/', '/en/', '/index.html', '/en/index.html', '/nope']) {
  test(`the app hydrates the prerendered page, it does not draw it again (${path})`, async ({ page }) => {
    // The main of the prerender, kept once the HTML is parsed, before any module runs.
    await page.addInitScript(() => {
      document.addEventListener('readystatechange', () => {
        if (document.readyState === 'interactive') (window as Window & { prerendered?: Element | null }).prerendered = document.querySelector('main');
      });
    });
    await page.goto(path);
    await page.waitForFunction(() => Boolean((document.querySelector('#app') as { __vue_app__?: unknown } | null)?.__vue_app__));
    expect(await page.evaluate(() => document.querySelector('main') === (window as Window & { prerendered?: Element | null }).prerendered)).toBe(true);
  });
}

for (const { path, home, copy } of [
  { path: '/index.html', home: '/', copy: FR },
  { path: '/en/index.html', home: '/en/', copy: EN },
]) {
  test(`${path} is the home page ${home}, served and hydrated as such`, async ({ page, request }) => {
    // Pages serves the file of a folder at its own address too: the same page, status 200.
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(await response.text()).toBe(await (await request.get(home)).text());
    const messages: string[] = [];
    page.on('console', (m) => messages.push(m.text()));
    await page.goto(path);
    // Hydrated as the home page: JP1 and SW2 are shown, the title is not the 404's.
    await expect(page.locator('button.jp1')).toBeVisible();
    await expect(page.locator('.board__face--front button.sw2')).toBeVisible();
    await expect(page).toHaveTitle(copy.title);
    await expect(page.locator('html')).toHaveAttribute('lang', copy.lang);
    // The address of the page stays the one of its folder.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE.baseUrl}${home.slice(1)}`);
    await page.waitForLoadState('networkidle');
    expect(messages.filter((m) => /hydrat/i.test(m))).toEqual([]);
  });
}

test('any other address is still the open circuit', async ({ page }) => {
  for (const path of ['/index.htm', '/en/index', '/fr/index.html']) {
    expect((await page.goto(path))?.status(), path).toBe(404);
    await expect(page.locator('h1')).toContainText(FR.notFound.title);
  }
});

test('directory without trailing slash redirects like Pages', async ({ request }) => {
  const response = await request.get('/en', { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers()['location']).toBe('/en/');
});
