import { expect, test, type Page } from '@playwright/test';

// The redirect runs in a real browser; chrome and firefox are enough to cover it.
test.beforeEach(({ isMobile }, testInfo) => {
  test.skip(isMobile || !['chrome', 'firefox'].includes(testInfo.project.name), 'language redirect: chrome and firefox only');
});

async function setLanguages(page: Page, languages: string[], saved?: string): Promise<void> {
  await page.addInitScript(
    ({ languages, saved }) => {
      Object.defineProperty(navigator, 'languages', { get: () => languages });
      if (saved) localStorage.setItem('k0t3i.lang', saved);
    },
    { languages, saved },
  );
}

test.describe('browser language', () => {
  test('English goes to /en/ without leaving a history entry', async ({ page, context }) => {
    // A direct load of /en/ in a fresh tab gives the baseline (Chrome counts its initial blank entry).
    const direct = await context.newPage();
    await direct.goto('/en/');
    const baseline = await direct.evaluate(() => history.length);

    await setLanguages(page, ['en-US', 'en']);
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    expect(await page.evaluate(() => history.length)).toBe(baseline);
  });

  test('French stays on /', async ({ page }) => {
    await setLanguages(page, ['fr-FR']);
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('another language goes to /en/', async ({ page }) => {
    await setLanguages(page, ['de-DE']);
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/$/);
  });

  test('the first fr or en language wins', async ({ page }) => {
    await setLanguages(page, ['de-DE', 'fr']);
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('the query string and the hash are kept', async ({ page }) => {
    await setLanguages(page, ['en-GB']);
    await page.goto('/?utm=x#top');
    await expect(page).toHaveURL(/\/en\/\?utm=x#top$/);
  });

  test('/en/ never redirects', async ({ page }) => {
    await setLanguages(page, ['fr-FR']);
    await page.goto('/en/');
    await expect(page).toHaveURL(/\/en\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('remembered choice', () => {
  test('saved fr wins over an English browser', async ({ page }) => {
    await setLanguages(page, ['en-US'], 'fr');
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });

  test('saved en wins over a French browser', async ({ page }) => {
    await setLanguages(page, ['fr-FR'], 'en');
    await page.goto('/');
    await expect(page).toHaveURL(/\/en\/$/);
  });

  // The FR link of the language switch arrives with Task 6 (LangSwitch).
  test.fixme('a click on FR from /en/ remembers the choice', async ({ page }) => {
    await setLanguages(page, ['en-US']);
    await page.goto('/en/');
    await page.getByRole('link', { name: 'Français' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => localStorage.getItem('k0t3i.lang'))).toBe('fr');
    await page.reload();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe('robots', () => {
  test.use({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' });

  test('Googlebot is never redirected', async ({ page }) => {
    await setLanguages(page, ['en-US']);
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});

test.describe('lighthouse', () => {
  test.use({ userAgent: 'Mozilla/5.0 Chrome-Lighthouse' });

  test('Lighthouse is never redirected', async ({ page }) => {
    await setLanguages(page, ['en-US']);
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
  });
});
