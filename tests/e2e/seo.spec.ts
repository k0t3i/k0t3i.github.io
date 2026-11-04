import { expect, test, type Page } from '@playwright/test';
import { EN, FR, SITE, type Copy } from '../helpers/copy';

// Link previews, robots, sitemap and the open-circuit page (404), as Pages will serve them.

const OG_LOCALE = { fr: 'fr_FR', en: 'en_GB' } as const;

const ALTERNATES = [
  { rel: 'alternate', hreflang: 'fr', href: SITE.baseUrl },
  { rel: 'alternate', hreflang: 'en', href: `${SITE.baseUrl}en/` },
  { rel: 'alternate', hreflang: 'x-default', href: SITE.baseUrl },
];

/** The Open Graph and Twitter metas of the head, in document order: [property or name, content]. */
const socialMetas = (page: Page): Promise<string[][]> =>
  page
    .locator('head meta[property], head meta[name^="twitter:"]')
    .evaluateAll((metas) => metas.map((m) => [m.getAttribute('property') ?? m.getAttribute('name') ?? '', m.getAttribute('content') ?? '']));

for (const copy of [FR, EN] as Copy[]) {
  test(`open graph complete and image exists (${copy.path})`, async ({ page, browser, request, baseURL }) => {
    const url = copy.lang === 'fr' ? SITE.baseUrl : `${SITE.baseUrl}en/`;
    const image = `${SITE.baseUrl}img/og-${copy.lang}.jpg`;
    const other = copy.lang === 'fr' ? 'en' : 'fr';
    // og:image first, then its structured properties: they describe the og:image before them.
    const expected = [
      ['og:type', 'website'],
      ['og:title', copy.title],
      ['og:description', copy.description],
      ['og:url', url],
      ['og:image', image],
      ['og:image:type', 'image/jpeg'],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:image:alt', copy.ogImageAlt],
      ['og:locale', OG_LOCALE[copy.lang]],
      ['og:locale:alternate', OG_LOCALE[other]],
      ['twitter:card', 'summary_large_image'],
    ];

    // What a link preview reads: the prerendered page, no JavaScript.
    const crawler = await browser.newContext({ baseURL, javaScriptEnabled: false });
    const raw = await crawler.newPage();
    await raw.goto(copy.path);
    expect(await socialMetas(raw)).toEqual(expected);
    await crawler.close();

    // Once the app has mounted: the same tags, none added twice.
    await page.goto(copy.path);
    await expect(page.locator('button.jp1')).toBeVisible();
    expect(await socialMetas(page)).toEqual(expected);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', url);

    // The image answers, as a JPEG of 1200 x 630 that the browser decodes.
    const path = new URL(image).pathname;
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toBe('image/jpeg');
    const size = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, path);
    expect(size).toEqual([1200, 630]);
  });
}

// The link preview and the structured data are prerendered only (usePageHead): a switch of language
// in the page keeps those of the address loaded, once each, while the rest of the head follows.
test('a switch of language in the page: the head follows, the link preview stays as served', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('button.jp1')).toBeVisible();
  const served = await socialMetas(page);
  expect(served).toContainEqual(['og:url', SITE.baseUrl]);
  const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
  await page.locator('.lang__link[hreflang="en"]').click();
  await expect(page).toHaveURL(/\/en\/$/);
  await expect(page).toHaveTitle(EN.title);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', EN.description);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${SITE.baseUrl}en/`);
  expect(await socialMetas(page)).toEqual(served);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toBe(jsonLd);
});

test('robots and sitemap', async ({ page, request }) => {
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(robots.headers()['content-type']).toMatch(/^text\/plain/);
  expect(await robots.text()).toBe(`User-agent: *\nAllow: /\nSitemap: ${SITE.baseUrl}sitemap.xml\n`);

  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(sitemap.headers()['content-type']).toMatch(/^application\/xml/);
  const xml = await sitemap.text();
  expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  const parsed = await page.evaluate((source) => {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) return null;
    const SM = 'http://www.sitemaps.org/schemas/sitemap/0.9';
    const XHTML = 'http://www.w3.org/1999/xhtml';
    const root = doc.documentElement;
    return {
      root: `${root.namespaceURI} ${root.localName}`,
      urls: [...root.getElementsByTagNameNS(SM, 'url')].map((u) => ({
        loc: u.getElementsByTagNameNS(SM, 'loc')[0]?.textContent,
        lastmod: u.getElementsByTagNameNS(SM, 'lastmod')[0]?.textContent ?? '',
        links: [...u.getElementsByTagNameNS(XHTML, 'link')].map((l) => ({
          rel: l.getAttribute('rel'),
          hreflang: l.getAttribute('hreflang'),
          href: l.getAttribute('href'),
        })),
      })),
    };
  }, xml);
  expect(parsed).not.toBeNull();
  expect(parsed?.root).toBe('http://www.sitemaps.org/schemas/sitemap/0.9 urlset');
  // Both pages, absolute, each with the same three alternates as the hreflang links of the head.
  expect(parsed?.urls.map(({ loc, links }) => ({ loc, links }))).toEqual([
    { loc: SITE.baseUrl, links: ALTERNATES },
    { loc: `${SITE.baseUrl}en/`, links: ALTERNATES },
  ]);
  // lastmod: the day of the build, which the test server has just run (today, or yesterday past midnight).
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
  for (const { lastmod } of parsed?.urls ?? []) expect([day(0), day(1)]).toContain(lastmod);
});

test.describe('the open-circuit page', () => {
  // A nested unknown path too: every URL of the page must be absolute to the root.
  for (const path of ['/nope', '/deep/unknown/path']) {
    test(`unknown path serves the open-circuit page (${path})`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
      // No link preview, no canonical: this page is nobody's address.
      await expect(page.locator('meta[property^="og:"], link[rel="canonical"]')).toHaveCount(0);

      const h1 = page.locator('h1');
      await expect(h1).toHaveText(`${FR.notFound.title} · ${EN.notFound.title}`);
      await expect(h1.locator('span[lang="en"]')).toHaveText(`· ${EN.notFound.title}`);

      // The cut trace is a drawing, hidden from assistive technologies.
      await expect(page.locator('main svg')).toHaveAttribute('aria-hidden', 'true');

      const main = page.locator('main');
      await expect(main.locator('p', { hasText: FR.notFound.text })).not.toHaveAttribute('lang', /.*/);
      await expect(main.locator('p', { hasText: EN.notFound.text })).toHaveAttribute('lang', 'en');

      // Back to the board, one link per language, French first.
      const links = main.locator('a');
      await expect(links).toHaveCount(2);
      await expect(links.nth(0)).toHaveText(FR.notFound.back);
      await expect(links.nth(0)).toHaveAttribute('href', '/');
      await expect(links.nth(0)).not.toHaveAttribute('lang', /.*/);
      await expect(links.nth(1)).toHaveText(EN.notFound.back);
      await expect(links.nth(1)).toHaveAttribute('href', '/en/');
      await expect(links.nth(1)).toHaveAttribute('lang', 'en');
      await expect(links.nth(1)).toHaveAttribute('hreflang', 'en');
      // Both stay in the tab (revision 8: only the projects and GitHub open a new one).
      await expect(page.locator('a[target]')).toHaveCount(0);

      // The stylesheet applies here too: the board is drawn.
      expect(await page.locator('.board__face').evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
    });
  }

  test('the open circuit is static, even when motion is welcome', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/nope');
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });

  // Motion welcome (the default here): the view transition out of this page is skipped, it crashed WebKit on an iPhone.
  test('a link back is a choice of language, kept by the redirect of /', async ({ browser, baseURL }) => {
    // A browser in English: without a choice, / would send it to /en/.
    const context = await browser.newContext({ baseURL, locale: 'en-GB', reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto('/nope');
    // Mounted: the link remembers the choice from then on (without JavaScript, / does not redirect).
    await page.waitForFunction(() => Boolean((document.querySelector('#app') as { __vue_app__?: unknown } | null)?.__vue_app__));
    await page.locator('main a', { hasText: FR.notFound.back }).click();
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await context.close();
  });

  test('the English link back is remembered too: / then sends a French browser to /en/', async ({ browser, baseURL }) => {
    // A browser in French: without a choice, / would stay in French.
    const context = await browser.newContext({ baseURL, locale: 'fr-FR', reducedMotion: 'no-preference' });
    const page = await context.newPage();
    await page.goto('/nope');
    await page.waitForFunction(() => Boolean((document.querySelector('#app') as { __vue_app__?: unknown } | null)?.__vue_app__));
    await page.locator('main a', { hasText: EN.notFound.back }).click();
    await page.waitForLoadState('networkidle');
    expect(new URL(page.url()).pathname).toBe('/en/');
    expect(await page.evaluate(() => localStorage.getItem('k0t3i.lang'))).toBe('en');
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await context.close();
  });
});
