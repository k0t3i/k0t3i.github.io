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
      await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#0c0d0f');
      await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
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
      const critical = at(/<script[^>]*\bdata-critical\b/i);
      // Whichever of these exist: nothing may come before the CSP and the redirect script.
      const later = [
        at(/<link[^>]+rel="stylesheet"/i),
        at(/<link[^>]+rel="modulepreload"/i),
        at(/<script[^>]+type="module"/i),
      ].filter((i) => i !== -1);
      expect(charset).toBeGreaterThan(-1);
      expect(csp).toBeGreaterThan(charset);
      expect(later.length).toBeGreaterThan(0);
      const firstLater = Math.min(...later);
      if (copy.lang === 'fr') {
        expect(critical).toBeGreaterThan(csp);
        expect(firstLater).toBeGreaterThan(critical);
      } else {
        expect(critical).toBe(-1);
        expect(firstLater).toBeGreaterThan(csp);
      }
    });
  });
}

test('the 404 page is not indexed', async ({ request }) => {
  const html = await (await request.get('/nope')).text();
  expect(html).toMatch(/<meta name="robots" content="noindex">/);
  expect(html).not.toMatch(/data-critical/);
});
