import { expect, test, type Page } from '@playwright/test';
import { EN, FR } from '../helpers/copy';

// The two boards: green on a light page (default), matte black on a black page.
const GREEN = { board: 'rgb(15, 55, 42)', page: 'rgb(236, 234, 227)' };
const BLACK = { board: 'rgb(12, 13, 15)', page: 'rgb(8, 9, 10)' };

const colours = (page: Page) =>
  page.evaluate(() => ({
    board: getComputedStyle(document.querySelector('.board') as Element).backgroundColor,
    page: getComputedStyle(document.body).backgroundColor,
  }));

const jp1 = (page: Page) => page.locator('button.jp1');

test.describe('light scheme', () => {
  test.use({ colorScheme: 'light' });

  test('default is green on light scheme', async ({ page }) => {
    await page.goto('/');
    expect(await colours(page)).toEqual(GREEN);
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
  });

  test('JP1 toggles and remembers', async ({ page }) => {
    await page.goto('/');
    const button = page.getByRole('button', { name: `JP1 ${FR.theme.switchHidden}` });
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => colours(page)).toEqual(BLACK);
    expect(await page.evaluate(() => localStorage.getItem('k0t3i.theme'))).toBe('dark');

    // Reloaded, the page is black from its first render: the head script sets the theme before
    // anything is painted (and before the app script runs, which only reads it).
    await page.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const w = window as unknown as { firstPaint: unknown };
        w.firstPaint = {
          theme: document.documentElement.dataset.theme,
          board: getComputedStyle(document.querySelector('.board') as Element).backgroundColor,
        };
      });
    });
    await page.reload();
    expect(await page.evaluate(() => (window as unknown as { firstPaint: unknown }).firstPaint)).toEqual({
      theme: 'dark',
      board: BLACK.board,
    });
    await expect(jp1(page)).toHaveAttribute('aria-pressed', 'true');

    // And back to green, remembered too.
    await jp1(page).click();
    await expect(jp1(page)).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => colours(page)).toEqual(GREEN);
    expect(await page.evaluate(() => localStorage.getItem('k0t3i.theme'))).toBe('green');
  });

  test('the choice holds on the English page', async ({ page }) => {
    await page.goto('/en/');
    await page.getByRole('button', { name: `JP1 ${EN.theme.switchHidden}` }).click();
    await expect.poll(() => colours(page)).toEqual(BLACK);
    await page.goto('/');
    expect(await colours(page)).toEqual(BLACK);
  });
});

test.describe('JP1 shows its state', () => {
  test.use({ reducedMotion: 'reduce' });

  test('the cap follows the state: its pixels change with aria-pressed', async ({ page }) => {
    await page.goto('/');
    const body = page.locator('button.jp1 .jp1__body');
    await expect(body).toBeVisible();
    const box = await body.boundingBox();
    if (!box) throw new Error('no box for the jumper');
    const green = await page.screenshot({ clip: box });
    await jp1(page).click();
    await expect(jp1(page)).toHaveAttribute('aria-pressed', 'true');
    const black = await page.screenshot({ clip: box });
    expect(green.equals(black)).toBe(false);
  });

  /** Colours of the two positions, and whether the lit one is the one the cap is on. */
  const labels = (page: Page) =>
    page.evaluate(() => {
      const button = document.querySelector('button.jp1') as Element;
      const colour = (s: string) => getComputedStyle(button.querySelector(s) as Element).color;
      const silk = getComputedStyle(button.querySelector('.part__ref') as Element).color;
      return { green: colour('.jp1__pos--green'), dark: colour('.jp1__pos--dark'), silk, pressed: button.getAttribute('aria-pressed') };
    });

  test('only the active position is printed bright, also on hover', async ({ page, isMobile }) => {
    test.skip(isMobile, 'hover needs a mouse');
    await page.goto('/');
    await jp1(page).hover();
    const l = await labels(page);
    expect(l.pressed).toBe('false');
    expect(l.green).toBe(l.silk);
    expect(l.dark).not.toBe(l.silk);
  });

  test('with more contrast, the inactive position stays dimmer than the active one', async ({ page }) => {
    await page.emulateMedia({ contrast: 'more' });
    await page.goto('/');
    await expect(jp1(page)).toBeVisible();
    const off = await labels(page);
    expect(off.green).toBe(off.silk);
    expect(off.dark).not.toBe(off.silk);
    await jp1(page).click();
    await expect(jp1(page)).toHaveAttribute('aria-pressed', 'true');
    const on = await labels(page);
    expect(on.dark).toBe(on.silk);
    expect(on.green).not.toBe(on.silk);
  });
});

test.describe('dark scheme', () => {
  test.use({ colorScheme: 'dark' });

  test('dark scheme gives black', async ({ page }) => {
    await page.goto('/');
    expect(await colours(page)).toEqual(BLACK);
    await expect(jp1(page)).toHaveAttribute('aria-pressed', 'true');
  });

  test('a saved green wins over the dark scheme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('k0t3i.theme', 'green'));
    await page.goto('/');
    expect(await colours(page)).toEqual(GREEN);
    await expect(jp1(page)).toHaveAttribute('aria-pressed', 'false');
  });

  test('the 404 page follows the choice too', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('k0t3i.theme', 'green'));
    await page.goto('/nope');
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('green');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const [scheme, expected] of [
    ['light', GREEN],
    ['dark', BLACK],
  ] as const) {
    test(`no JS: follows the scheme, no JP1 (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      expect(await colours(page)).toEqual(expected);
      await expect(jp1(page)).toBeHidden();
      await expect(page.locator('.board__jp1')).toHaveCount(1);
    });
  }
});

for (const path of [FR.path, EN.path]) test(`zero layout shift when JP1 appears (${path})`, async ({ page, browser }) => {
  // The page without JavaScript is the prerender, as painted before the app mounts. Both fonts are
  // preloaded, so the load event (which goto waits for) covers them. The evaluation stays synchronous:
  // Firefox never settles a promise in a page whose JavaScript is disabled.
  const boxes = (p: Page) =>
    p.evaluate(() =>
      ['.board__header', '.board__name', '.board__rev', '.lang', '.board__jp1', '.hero__title', '.disp', '.parts'].map((s) => {
        const r = (document.querySelector(s) as Element).getBoundingClientRect();
        return `${s} ${r.x.toFixed(1)} ${r.y.toFixed(1)} ${r.width.toFixed(1)} ${r.height.toFixed(1)}`;
      }),
    );
  const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
  const still = await browser.newContext({ javaScriptEnabled: false, viewport, locale: 'fr-FR' });
  const before = await still.newPage();
  await before.goto(path);
  const prerendered = await boxes(before);
  await still.close();

  await page.goto(path);
  await expect(jp1(page)).toBeVisible();
  expect(await boxes(page)).toEqual(prerendered);
  // JP1 sits inside the slot that was kept for it, at its full height.
  const [slot, button] = await Promise.all([page.locator('.board__jp1').boundingBox(), jp1(page).boundingBox()]);
  if (!slot || !button) throw new Error('no box for JP1 or its slot');
  expect(button.x).toBeGreaterThanOrEqual(slot.x - 0.5);
  expect(button.x + button.width).toBeLessThanOrEqual(slot.x + slot.width + 0.5);
  expect(button.height).toBeCloseTo(slot.height, 0);
});
