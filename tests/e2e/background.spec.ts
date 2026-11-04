import { expect, test, type Page } from '@playwright/test';

/*
 * The page around the board (revision 8): a workbench mat, a fine grid of dots over the page; now and
 * then a slow wave lights its dots as it crosses the page; under a mouse, a glow follows the pointer
 * like a lamp over the mat. Decoration only, under everything; still under reduced motion (the grid
 * alone), gone with more contrast and in forced colours.
 */

const mat = (page: Page) => page.locator('.mat');
const glow = (page: Page) => page.locator('.mat__glow');

/** This session has already powered the board on: the page opens at rest. */
const booted = (page: Page): Promise<unknown> => page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));

/** Relative luminance (WCAG) of an rgb() or color(srgb ...) colour. */
function luminance(colour: string): number {
  const n = (colour.match(/-?[\d.]+/g) ?? []).map(Number).slice(0, 3);
  const rgb = colour.startsWith('color(srgb') ? n : n.map((v) => v / 255);
  const [r = 0, g = 0, b = 0] = rgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** The grid of the mat as drawn: the colour of its dots, its cell, where it starts; and the page under it. */
const grid = (page: Page) =>
  mat(page).evaluate((el) => {
    const cs = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      position: cs.position,
      zIndex: cs.zIndex,
      hidden: el.getAttribute('aria-hidden'),
      image: cs.backgroundImage,
      dot: cs.backgroundImage.match(/(rgba?|color)\([^)]*\)/)?.[0] ?? '',
      size: cs.backgroundSize,
      at: cs.backgroundPosition,
      page: getComputedStyle(document.body).backgroundColor,
      box: { x: box.x, y: box.y, w: box.width, h: box.height },
      window: { w: document.documentElement.clientWidth, h: innerHeight },
    };
  });

/** The animations of the wave: the band, and the dots in it. */
const wave = (page: Page) =>
  page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => (a.effect as KeyframeEffect | null)?.target?.classList.contains('mat__wave'))
      .map((a) => {
        const effect = a.effect as KeyframeEffect;
        const timing = effect.getComputedTiming();
        return {
          name: (a as CSSAnimation).animationName,
          pseudo: effect.pseudoElement,
          duration: timing.duration,
          iterations: timing.iterations,
          properties: [...new Set(effect.getKeyframes().flatMap((f) => Object.keys(f)))].filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)),
          state: a.playState,
        };
      })
      .sort((x, y) => x.name.localeCompare(y.name)),
  );

for (const scheme of ['light', 'dark'] as const) {
  test(`the mat: a fine grid of dots over the page, fixed to the window, under everything (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const g = await grid(page);
    expect([g.position, g.zIndex, g.hidden]).toEqual(['fixed', '-1', 'true']);
    // The whole window, from its top left corner: aligned to the page, never to the board.
    expect(g.box).toMatchObject({ x: 0, y: 0, w: g.window.w });
    expect(g.box.h).toBeGreaterThanOrEqual(g.window.h);
    // One square dot of 1px in each cell of 12px, whole pixels: crisp at 1x and 2x.
    expect(g.image).toMatch(/^conic-gradient\(from 270deg at 1px 1px, /);
    expect(g.size).toBe('12px 12px');
    expect(g.at).toBe('6px 6px');
    // Discreet: a little darker than the page on the light one, a little lighter on the dark one.
    const [dot, under] = [luminance(g.dot), luminance(g.page)];
    if (scheme === 'light') expect(dot).toBeLessThan(under);
    else expect(dot).toBeGreaterThan(under);
    const contrast = (Math.max(dot, under) + 0.05) / (Math.min(dot, under) + 0.05);
    expect(contrast).toBeGreaterThan(1.1);
    expect(contrast).toBeLessThan(1.6);
  });
}

test('the mat is drawn on the open-circuit page too, and without JavaScript', async ({ browser, baseURL }) => {
  for (const javaScriptEnabled of [true, false]) {
    const context = await browser.newContext({ baseURL, javaScriptEnabled });
    const page = await context.newPage();
    for (const path of ['/', '/en/', '/nope']) {
      await page.goto(path);
      expect((await grid(page)).size, `${path}, JavaScript ${javaScriptEnabled}`).toBe('12px 12px');
    }
    await context.close();
  }
});

test('no mat with more contrast, nor in forced colours: a plain page', async ({ page, browserName }) => {
  await page.emulateMedia({ contrast: 'more' });
  await page.goto('/');
  await expect(mat(page)).toBeHidden();
  expect(await mat(page).evaluate((el) => getComputedStyle(el).display)).toBe('none');
  if (browserName === 'chromium') {
    await page.emulateMedia({ contrast: 'no-preference', forcedColors: 'active' });
    expect(await mat(page).evaluate((el) => getComputedStyle(el).display)).toBe('none');
  }
});

test.describe('the wave', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const path of ['/', '/en/', '/nope']) {
    test(`a soft band crosses the page every 20 s, its dots kept on the grid (${path})`, async ({ page }) => {
      await booted(page);
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      // Two transforms, run by the compositor: the band, and its dots moved back as much.
      expect(await wave(page)).toEqual([
        { name: 'mat-dots', pseudo: '::before', duration: 20000, iterations: Infinity, properties: ['transform'], state: 'running' },
        { name: 'mat-wave', pseudo: null, duration: 20000, iterations: Infinity, properties: ['transform'], state: 'running' },
      ]);
      // Where both are at a moment of the cycle: the band across the window, the dots where they were.
      const at = (ms: number) =>
        page.evaluate((t) => {
          const band = document.querySelector('.mat__wave') as Element;
          for (const a of document.getAnimations()) if ((a.effect as KeyframeEffect | null)?.target === band) a.currentTime = t;
          const x = (s: string) => new DOMMatrix(s).m41;
          const box = band.getBoundingClientRect();
          return { band: x(getComputedStyle(band).transform), dots: x(getComputedStyle(band, '::before').transform), left: box.left, right: box.right, width: innerWidth };
        }, ms);
      // Waiting off the page (5 s), then 3 s across, then off the page again until the next pass.
      for (const ms of [0, 4000]) expect((await at(ms)).right, `${ms} ms`).toBeLessThanOrEqual(0);
      for (const ms of [8000, 15000, 19999]) expect((await at(ms)).left, `${ms} ms`).toBeGreaterThanOrEqual((await at(ms)).width);
      // Half way, the middle of the band is in the middle of the window (on a phone the band is wider than it).
      const halfway = await at(6500);
      expect(Math.abs((halfway.left + halfway.right) / 2 - halfway.width / 2)).toBeLessThan(halfway.width * 0.1);
      for (const ms of [5200, 6500, 7800]) {
        const p = await at(ms);
        expect(p.dots, `${ms} ms`).toBeCloseTo(-p.band, 3);
      }
    });
  }

  test('the wave runs on through a sheet and a turn of the board: never paused, never started again', async ({ page }) => {
    await booted(page);
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');
    await expect(page.locator('button.jp1')).toBeVisible();
    const keep = () =>
      page.evaluate(() => {
        const w = window as unknown as { waveAnimations?: Animation[] };
        const now = document.getAnimations().filter((a) => (a.effect as KeyframeEffect | null)?.target?.classList.contains('mat__wave'));
        w.waveAnimations ??= now;
        return { same: now.length === 2 && now.every((a) => w.waveAnimations?.includes(a)), states: now.map((a) => a.playState), starts: now.map((a) => a.startTime) };
      });
    // Started together, on the same time: the dots never drift from the band.
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.ready)));
    const first = await keep();
    expect(first.same).toBe(true);
    expect(first.starts[0]).not.toBeNull();
    expect(first.starts[1]).toBe(first.starts[0]);
    await page.locator('.part__trigger[popovertarget="sheet-j1"]').click();
    await expect(page.locator('#sheet-j1')).toBeVisible();
    expect(await keep()).toEqual(first);
    await page.keyboard.press('Escape');
    await page.locator('.board__face--front button.sw2').click();
    await expect(page.locator('.board')).toHaveAttribute('data-flipped', '');
    await expect(page.locator('.board')).not.toHaveAttribute('data-turning', /.*/);
    expect(await keep()).toEqual(first);
    await page.locator('.board__face--back button.sw2').click();
    await expect(page.locator('.board')).not.toHaveAttribute('data-flipped', /.*/);
    expect(await keep()).toEqual(first);
  });
});

test.describe('the glow', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('a soft light follows the mouse over the page, and fades out when it leaves the window', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    await booted(page);
    await page.goto('/');
    await expect(page.locator('button.jp1')).toBeVisible();
    await expect(glow(page)).not.toHaveAttribute('data-on', /.*/);
    await page.mouse.move(101, 250);
    await page.mouse.move(130, 262, { steps: 3 });
    await expect(glow(page)).toHaveAttribute('data-on', '');
    // On the grid of the mat (12px), centred on the pointer: its dots are those of the mat, lit.
    await expect.poll(() => glow(page).evaluate((el) => [el.style.getPropertyValue('--glow-x'), el.style.getPropertyValue('--glow-y')])).toEqual(['132px', '264px']);
    const shown = await glow(page).evaluate((el) => {
      const box = el.getBoundingClientRect();
      return { cx: box.x + box.width / 2, cy: box.y + box.height / 2, size: box.width };
    });
    expect(Math.abs(shown.cx - 132)).toBeLessThanOrEqual(1);
    expect(Math.abs(shown.cy - 264)).toBeLessThanOrEqual(1);
    expect(shown.size).toBeGreaterThanOrEqual(320);
    expect(shown.size).toBeLessThanOrEqual(960);
    await expect.poll(() => glow(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
    // Written on the glow only: the page and the board keep no style of it.
    expect(await page.evaluate(() => [document.documentElement.getAttribute('style'), document.body.getAttribute('style')])).toEqual([null, null]);
    // The pointer leaves the window.
    await page.evaluate(() => document.documentElement.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: null, pointerType: 'mouse' })));
    await expect(glow(page)).not.toHaveAttribute('data-on', /.*/);
    await expect.poll(() => glow(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  });

  test('no glow under a finger', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'a touch screen');
    await booted(page);
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    await page.touchscreen.tap(4, 300);
    await page.locator('h1').tap();
    await page.waitForTimeout(300);
    await expect(glow(page)).not.toHaveAttribute('data-on', /.*/);
    expect(await glow(page).getAttribute('style')).toBeNull();
    expect(await glow(page).evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  });
});

test('under reduced motion: the grid alone, no wave, no glow', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('h1')).toBeVisible();
  expect((await grid(page)).size).toBe('12px 12px');
  expect(await wave(page)).toEqual([]);
  if (!isMobile) {
    await page.mouse.move(200, 300, { steps: 3 });
    await page.waitForTimeout(200);
    await expect(glow(page)).not.toHaveAttribute('data-on', /.*/);
    expect(await glow(page).getAttribute('style')).toBeNull();
  }
});
