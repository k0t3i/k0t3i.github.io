import { expect, test, type Page } from '@playwright/test';

/*
 * Performance and smoothness, in the browser, on dist/ served as GitHub Pages serves it: nothing moves
 * the layout (the power-on included), the fonts do not wait for the stylesheet, the art of the wide
 * board is fetched only where it is drawn, and the main thread stays free once the page has loaded.
 * The weights are budgeted on the build itself (tests/static/budget.test.mjs).
 */

/** Wide board from 79rem (wide.css). */
const WIDE_FROM = 79 * 16;

/** The Chromium projects: layout-shift and longtask entries exist in Chromium only. */
const CHROMIUM = ['chrome', 'chrome-mobile'];

type Entry = { start: number; duration: number; value: number; sources: string[] };
type Recorded = Window & { recorded?: Entry[] };

/** Records the performance entries of one type from the start of the page (an init script). */
async function record(page: Page, type: 'layout-shift' | 'longtask'): Promise<void> {
  await page.addInitScript((entryType) => {
    const w = window as Recorded;
    w.recorded = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as (PerformanceEntry & { value?: number; sources?: { node?: Node | null }[] })[]) {
        w.recorded?.push({
          start: e.startTime,
          duration: e.duration,
          value: e.value ?? 0,
          sources: (e.sources ?? []).map(({ node }) => (node instanceof Element ? `${node.localName}.${node.className}` : String(node?.nodeName))),
        });
      }
    }).observe({ type: entryType, buffered: true });
  }, type);
}

/** The entries recorded so far, once the observer has had two frames and a task to report them. */
const recorded = (page: Page): Promise<Entry[]> =>
  page.evaluate(
    () =>
      new Promise<Entry[]>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => resolve((window as Recorded).recorded ?? []), 0))),
      ),
  );

/** The power-on of the first visit of the session (motion welcome) has played: started, then ended. */
async function bootPlayed(page: Page): Promise<void> {
  const board = page.locator('.board--home');
  await expect(board).toHaveAttribute('data-booting', '');
  await expect(board).not.toHaveAttribute('data-booting', /.*/);
  await expect(page.locator('html')).not.toHaveAttribute('data-boot', /.*/);
}

test.describe('motion welcome', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const path of ['/', '/en/']) {
    test(`zero layout shift, the power-on included (${path})`, async ({ page }, testInfo) => {
      test.skip(!CHROMIUM.includes(testInfo.project.name), 'layout-shift entries: Chromium only');
      await record(page, 'layout-shift');
      await page.goto(path);
      await bootPlayed(page);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForLoadState('networkidle');
      expect((await recorded(page)).map(({ value, sources }) => ({ value, sources }))).toEqual([]);
    });
  }

  test('no long task over 50 ms after load', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chrome', 'longtask entries: measured in chrome');
    await record(page, 'longtask');
    await page.goto('/');
    await bootPlayed(page);
    // The visitor then sweeps the mouse over the parts, one after the other: the board leans, the current follows.
    const boxes = await page.locator('.board__face--front .part__trigger').evaluateAll((triggers) =>
      triggers.map((t) => t.getBoundingClientRect()).map((r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 })),
    );
    expect(boxes.length).toBeGreaterThan(0);
    for (const { x, y } of boxes) await page.mouse.move(x, y, { steps: 8 });
    await expect(page.locator('.board--home')).toHaveAttribute('data-active', /.+/);
    await page.mouse.move(1, 1, { steps: 8 });
    await page.waitForLoadState('networkidle');
    const load = await page.evaluate(() => (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).loadEventStart);
    expect(load).toBeGreaterThan(0);
    const late = (await recorded(page)).filter((t) => t.start >= load).map(({ start, duration }) => ({ start, duration }));
    expect(late).toEqual([]);
  });
});

test('fonts preloaded', async ({ page }) => {
  const fonts: string[] = [];
  let bothAsked = (): void => {};
  const asked = new Promise<void>((resolve) => (bothAsked = resolve));
  page.on('request', (request) => {
    if (!new URL(request.url()).pathname.endsWith('.woff2')) return;
    fonts.push(request.url());
    if (fonts.length === 2) bothAsked();
  });
  // The stylesheet is held back until both fonts are asked for (5 s at most): fonts found in it could not be.
  let askedBeforeTheSheet = -1;
  await page.route('**/assets/*.css', async (route) => {
    await Promise.race([asked, new Promise((resolve) => setTimeout(resolve, 5000))]);
    askedBeforeTheSheet = fonts.length;
    await route.continue();
  });
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  expect(askedBeforeTheSheet).toBe(2);
  // And only then: the stylesheet uses the preloaded files, it fetches neither again.
  expect(fonts).toHaveLength(2);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`board art only on wide screens (${viewport.width}px)`, async ({ page, isMobile }) => {
    // The phones keep their own screen: one test is theirs.
    test.skip(isMobile && viewport.width > 390, 'the phone size only');
    if (!isMobile) await page.setViewportSize(viewport);
    const art: string[] = [];
    page.on('request', (request) => {
      if (/\/board-wide-[\w-]+\.svg$/.test(new URL(request.url()).pathname)) art.push(request.url());
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const width = await page.evaluate(() => innerWidth);
    expect(art).toHaveLength(width >= WIDE_FROM ? 1 : 0);
  });
}
