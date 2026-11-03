import { expect, test } from '@playwright/test';
import { EN, FR, SITE, type Copy } from '../helpers/copy';

const ALTERNATES = [
  { hreflang: 'fr', href: SITE.baseUrl },
  { hreflang: 'en', href: `${SITE.baseUrl}en/` },
  { hreflang: 'x-default', href: SITE.baseUrl },
];

for (const copy of [FR, EN] as Copy[]) {
  test.describe(`head of ${copy.path}`, () => {
    test('exact title and description', async ({ page }) => {
      await page.goto(copy.path);
      await expect(page).toHaveTitle(copy.title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', copy.description);
      // The page colour of each board, for the browser chrome; the page follows the device scheme.
      const themeColors = await page.locator('meta[name="theme-color"]').evaluateAll((metas) =>
        metas.map((m) => `${m.getAttribute('content')} ${m.getAttribute('media')}`),
      );
      expect(themeColors).toEqual(['#eceae3 (prefers-color-scheme: light)', '#08090a (prefers-color-scheme: dark)']);
      await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light dark');
      await expect(page.locator('html')).toHaveAttribute('lang', copy.lang);
    });

    test('canonical and hreflang absolute and reciprocal', async ({ page }) => {
      await page.goto(copy.path);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        copy.lang === 'fr' ? SITE.baseUrl : `${SITE.baseUrl}en/`,
      );
      const alternates = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((links) =>
        links.map((l) => ({ hreflang: l.getAttribute('hreflang'), href: l.getAttribute('href') })),
      );
      // The same three links on both pages, so each page points to the other and to itself.
      expect(alternates).toEqual(ALTERNATES);
    });

    test('json-ld parses', async ({ page }) => {
      await page.goto(copy.path);
      const raw = await page.locator('script[type="application/ld+json"]').textContent();
      const data = JSON.parse(raw ?? '');
      expect(data['@context']).toBe('https://schema.org');
      expect(data['@type']).toBe('ProfilePage');
      expect(data.mainEntity['@type']).toBe('Person');
      expect(data.mainEntity.name).toBe('Anthony');
      expect(data.mainEntity.sameAs).toEqual([SITE.github]);
      expect(data.mainEntity.worksFor.name).toBe('Fircosoft');
      expect(JSON.stringify(data)).not.toMatch(/email|@[a-z0-9-]+\./i);
    });

    test('head order', async ({ request }) => {
      const html = await (await request.get(copy.path)).text();
      const head = html.slice(html.indexOf('<head'), html.indexOf('</head>'));
      const at = (re: RegExp) => head.search(re);
      const charset = at(/<meta charset=/i);
      const csp = at(/<meta http-equiv="Content-Security-Policy"/i);
      const theme = at(/<script[^>]*\bdata-critical="theme"/i);
      const redirect = at(/<script[^>]*\bdata-critical="redirect"/i);
      // Whichever of these exist: nothing may come before the CSP and the critical scripts.
      const later = [
        at(/<link[^>]+rel="stylesheet"/i),
        at(/<link[^>]+rel="modulepreload"/i),
        at(/<script[^>]+type="module"/i),
      ].filter((i) => i !== -1);
      expect(charset).toBeGreaterThan(-1);
      expect(csp).toBeGreaterThan(charset);
      expect(later.length).toBeGreaterThan(0);
      const firstLater = Math.min(...later);
      // The theme script on every page, right after the CSP; the redirect after it, on / only.
      expect(theme).toBeGreaterThan(csp);
      if (copy.lang === 'fr') {
        expect(redirect).toBeGreaterThan(theme);
        expect(firstLater).toBeGreaterThan(redirect);
      } else {
        expect(redirect).toBe(-1);
        expect(firstLater).toBeGreaterThan(theme);
      }
    });
  });
}

test('the font preloads are the files the stylesheet loads', async ({ page, request }) => {
  await page.goto('/');
  const preloads = await page.locator('link[rel="preload"][as="font"]').evaluateAll((links) =>
    links.map((l) => ({ href: l.getAttribute('href'), type: l.getAttribute('type'), crossorigin: l.getAttribute('crossorigin') })),
  );
  const css = await (await request.get((await page.locator('link[rel="stylesheet"]').getAttribute('href')) ?? '')).text();
  const faces = [...css.matchAll(/url\(["']?([^)"']+\.woff2)["']?\)/g)].map((m) => m[1]);
  expect(faces).toHaveLength(2);
  // Same hashed URLs, in CORS mode like every font fetch: otherwise the preload is downloaded twice.
  expect(preloads).toEqual(faces.map((href) => ({ href, type: 'font/woff2', crossorigin: '' })));
});

test('the 404 page is not indexed', async ({ request }) => {
  const html = await (await request.get('/nope')).text();
  expect(html).toMatch(/<meta name="robots" content="noindex">/);
  // The theme script only: the 404 page never redirects.
  expect(html.match(/data-critical="[^"]*"/g)).toEqual(['data-critical="theme"']);
});
