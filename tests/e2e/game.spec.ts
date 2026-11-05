import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { EN, FR, type Copy } from '../helpers/copy';

/*
 * The easter egg of revision 8: the code (↑ ↑ ↓ ↓ ← → ← → B A, or eight swipes and two taps on DISP1)
 * starts « Routage » on DISP1, and the page takes its retro colours for the time of the game. The game
 * is a chunk of its own, fetched only then. Its rules (moves, pads, collisions, speed, score) are
 * unit-tested with a seed (tests/unit/routage.spec.ts, play.spec.ts); here: starting it, steering,
 * the end of a game, every way out, the colours, the captions and what is said.
 */

const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
/** WCAG 1.4.12: line height 1.5, paragraph spacing 2em, letter spacing 0.12em, word spacing 0.16em. */
const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

const figure = (page: Page): Locator => page.locator('figure.disp');
const pixels = (page: Page): Locator => page.locator('svg.disp__pixels');
const caption = (page: Page): Locator => page.locator('#disp1-caption');
const said = (page: Page): Locator => page.locator('figure.disp p.vh[aria-live="polite"]');
const sw1 = (page: Page): Locator => page.locator('button.sw1');

/** This session has already powered the board on: the page opens at rest. */
const booted = (page: Page): Promise<unknown> => page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));

async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('button.jp1')).toBeVisible();
}

async function typeCode(page: Page): Promise<void> {
  for (const key of CODE) await page.keyboard.press(key);
}

/** The game mode is on, on its title: the colours, the caption, the rules said, the game screen. */
async function inGame(page: Page, copy: Copy = FR): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-retro', '');
  await expect(figure(page)).toHaveClass(/\bdisp--game\b/);
  await expect(caption(page)).toHaveText(copy.captions.game);
  await expect(said(page)).toHaveText(copy.game.intro);
  await expect(pixels(page)).toHaveAttribute('data-screen', 'game');
  await expect(pixels(page).locator('path.px--word')).toHaveCount(1);
}

/** Back at rest: no retro colours, no game, DISP1 on `screen` with its caption, nothing said, the page scrolls under DISP1. */
async function atRest(page: Page, screen: 'avatar' | 'uptime' = 'avatar', copy: Copy = FR): Promise<void> {
  await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
  await expect(figure(page)).not.toHaveClass(/\bdisp--game\b/);
  await expect(caption(page)).toHaveText(copy.captions[screen]);
  await expect(pixels(page)).toHaveAttribute('data-screen', screen);
  await expect(said(page)).toHaveText('');
  expect(await page.locator('.disp__screen').evaluate((el) => getComputedStyle(el).touchAction)).toBe('auto');
}

/** Where the signal is: the top left lit pixel of its path, on the 64 x 64 screen. */
const headAt = (page: Page): Promise<{ x: number; y: number } | null> =>
  pixels(page)
    .locator('path.px--head')
    .evaluateAll((paths) => {
      const m = paths[0]?.getAttribute('d')?.match(/^M(\d+) (\d+)/);
      return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
    });

/** The scroll of the page once it has stopped moving (a smooth scroll of the keyboard may still run). */
async function settledScroll(page: Page): Promise<number> {
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate(() => new Promise<number>((r) => setTimeout(() => r(scrollY), 120)));
    if (now === last) return now;
    last = now;
  }
  throw new Error('the page never stops scrolling');
}

/** A touch on the glass of DISP1, from (x, y) moved by (dx, dy), as a finger does it. */
async function swipe(page: Page, dx: number, dy: number): Promise<void> {
  await page.locator('.disp__screen').evaluate(
    (el, [dx, dy]) => {
      const box = el.getBoundingClientRect();
      const x = box.left + box.width / 2;
      const y = box.top + box.height / 2;
      const touch = (cx: number, cy: number) => new Touch({ identifier: 7, target: el, clientX: cx, clientY: cy });
      const fire = (type: string, t: Touch, down: boolean) =>
        el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: down ? [t] : [], targetTouches: down ? [t] : [], changedTouches: [t] }));
      fire('touchstart', touch(x, y), true);
      if (dx || dy) fire('touchmove', touch(x + (dx ?? 0), y + (dy ?? 0)), true);
      fire('touchend', touch(x + (dx ?? 0), y + (dy ?? 0)), false);
    },
    [dx, dy],
  );
}

const SWIPES: [number, number][] = [
  [0, -60],
  [0, -60],
  [0, 60],
  [0, 60],
  [-60, 0],
  [60, 0],
  [-60, 0],
  [60, 0],
  [0, 0],
  [0, 0],
];

/** The requests for the chunk of the game. */
function chunks(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (/\/assets\/play-[\w-]+\.js$/.test(new URL(r.url()).pathname)) asked.push(r.url());
  });
  return asked;
}

test.describe('the code, by keyboard', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'a keyboard: the touch screens swipe it');
  });

  for (const copy of [FR, EN] as Copy[]) {
    test(`starts the game mode, and fetches the game only then (${copy.path})`, async ({ page }) => {
      const asked = chunks(page);
      const messages: string[] = [];
      page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
      page.on('pageerror', (e) => messages.push(e.message));
      await booted(page);
      await open(page, copy.path);
      await page.waitForLoadState('networkidle');
      expect(asked).toEqual([]);
      // Nothing of it in the page as served.
      await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
      await expect(said(page)).toHaveText('');
      await typeCode(page);
      await inGame(page, copy);
      expect(asked).toHaveLength(1);
      // Its title: ROUTE, and the key A in its cap.
      await expect(pixels(page).locator('path.px--key')).toHaveCount(1);
      expect(messages.filter((m) => /hydrat|error|warn/i.test(m))).toEqual([]);
    });
  }

  test('A plays, the arrows steer and never scroll the page, B pauses', async ({ page }) => {
    await booted(page);
    // A flowing board taller than the window: the page could scroll.
    await page.setViewportSize({ width: 1024, height: 700 });
    await open(page);
    await page.locator('figure.disp').scrollIntoViewIfNeeded();
    await typeCode(page);
    await inGame(page);
    await page.keyboard.press('a');
    await expect(pixels(page).locator('path.px--head')).toHaveCount(1);
    await expect(said(page)).toHaveText('');
    // The arrows of the code scrolled the page, as they always do: once that scroll is over, none more.
    const scroll = await settledScroll(page);
    const start = await headAt(page);
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await headAt(page))?.y ?? 0, { timeout: 3000 }).toBeGreaterThan(start?.y ?? 0);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    // B: still.
    await page.keyboard.press('b');
    await expect(pixels(page).locator('path.px--pause')).toHaveCount(1);
    const paused = await headAt(page);
    await page.waitForTimeout(700);
    expect(await headAt(page)).toEqual(paused);
    // Paused, an arrow is the page's again.
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scroll);
    await page.keyboard.press('b');
    await expect(pixels(page).locator('path.px--pause')).toHaveCount(0);
  });

  test('a game ends on the edge: DRC ERR and the score, said with its count; A plays again', async ({ page }) => {
    await booted(page);
    await open(page);
    await typeCode(page);
    await inGame(page);
    await page.keyboard.press('a');
    await expect(pixels(page).locator('path.px--head')).toHaveCount(1);
    // Straight up from the middle of the left side: the top edge in less than 8 steps.
    await page.keyboard.press('ArrowUp');
    await expect(pixels(page).locator('path.px--score')).toHaveCount(1, { timeout: 5000 });
    await expect(pixels(page).locator('path.px--word')).toHaveCount(1);
    await expect(pixels(page).locator('path.px--key')).toHaveCount(1);
    // A pad may have lain on the way.
    await expect(said(page)).toHaveText(new RegExp(`^(${[FR.game.over(0), FR.game.over(1)].map((s) => s.replace(/[.()]/g, '\\$&')).join('|')})$`));
    // The end screen is still: it redraws once, it never blinks.
    const drawn = await pixels(page).innerHTML();
    await page.waitForTimeout(800);
    expect(await pixels(page).innerHTML()).toBe(drawn);
    await page.keyboard.press('a');
    await expect(pixels(page).locator('path.px--head')).toHaveCount(1);
    await expect(said(page)).toHaveText('');
  });
});

/** Swipes can be dispatched: Chromium builds touch events; this WebKit builds none (no TouchEvent constructor, no initTouchEvent). */
const swipes = ({ browserName, isMobile }: { browserName: string; isMobile: boolean }): boolean => isMobile && browserName === 'chromium';

test.describe('the code, by touch', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ browserName, isMobile }) => {
    test.skip(!isMobile, 'a touch screen');
    test.skip(!swipes({ browserName, isMobile }), 'WebKit builds no synthetic touch event here: the phone of Chromium swipes');
  });

  test('eight swipes and two taps on DISP1 start it; a tap plays, a swipe steers', async ({ page }) => {
    const asked = chunks(page);
    await booted(page);
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    // Before the game, the page scrolls over DISP1 as anywhere else.
    expect(await page.locator('.disp__screen').evaluate((el) => getComputedStyle(el).touchAction)).toBe('auto');
    for (const [dx, dy] of SWIPES) await swipe(page, dx, dy);
    await inGame(page);
    expect(asked).toHaveLength(1);
    // While it runs, DISP1 keeps the swipes for the game.
    expect(await page.locator('.disp__screen').evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');
    await swipe(page, 0, 0);
    await expect(pixels(page).locator('path.px--head')).toHaveCount(1);
    const start = await headAt(page);
    await swipe(page, 0, 60);
    await expect.poll(async () => (await headAt(page))?.y ?? 0, { timeout: 3000 }).toBeGreaterThan(start?.y ?? 0);
    // SW1, a tap: out of the game.
    await sw1(page).tap();
    await atRest(page);
  });
});

test.describe('the code on a phone, its B and A tapped', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ isMobile }) => {
    test.skip(!isMobile, 'a touch screen');
  });

  test('the eight arrows typed, then two real taps on DISP1 start it; a tap plays', async ({ page }) => {
    // Real taps (Playwright's touch screen, in WebKit too): the touchend path of the code and of the game.
    await booted(page);
    await page.goto('/');
    await expect(page.locator('h1')).toBeVisible();
    for (const key of CODE.slice(0, 8)) await page.keyboard.press(key);
    const glass = page.locator('.disp__screen');
    await glass.scrollIntoViewIfNeeded();
    await glass.tap();
    await glass.tap();
    await inGame(page);
    await glass.tap();
    await expect(pixels(page).locator('path.px--head')).toHaveCount(1);
    await sw1(page).tap();
    await atRest(page);
  });
});

test.describe('every way out ends it, and puts the colours and DISP1 back', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'a keyboard');
  });

  const ways: [string, (page: Page) => Promise<unknown>, 'avatar' | 'uptime', Copy][] = [
    ['Escape', (page) => page.keyboard.press('Escape'), 'uptime', FR],
    ['SW1', (page) => sw1(page).click(), 'uptime', FR],
    ['the code typed again', (page) => typeCode(page), 'uptime', FR],
    ['a language switch', (page) => page.getByRole('link', { name: 'English' }).click(), 'avatar', EN],
    // Revision 11: a turn is no way out; the QUITTER of the back face is one.
    [
      'the QUITTER of the back face',
      async (page) => {
        await page.locator('.board__face--front button.sw2').click();
        await page.getByRole('button', { name: FR.back.bench.exitName }).click();
        await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
        await page.locator('.board__face--back button.sw2').click();
        await expect(page.locator('.board')).not.toHaveAttribute('data-flipped', /.*/);
      },
      'uptime',
      FR,
    ],
  ];
  for (const [way, leave, screen, copy] of ways) {
    test(`${way}`, async ({ page }) => {
      await booted(page);
      await page.setViewportSize({ width: 1600, height: 900 });
      await open(page);
      // SW1 chose the uptime: DISP1 goes back to it.
      await sw1(page).click();
      await expect(caption(page)).toHaveText(FR.captions.uptime);
      await typeCode(page);
      await inGame(page);
      await page.keyboard.press('a');
      await expect(pixels(page).locator('path.px--head')).toHaveCount(1);
      await leave(page);
      await atRest(page, screen, copy);
      // No game left running: the signal does not move, the arrows are the page's.
      await expect(pixels(page).locator('path.px--head')).toHaveCount(0);
      const prevented = await page.evaluate(() => {
        const e = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
        document.dispatchEvent(e);
        return e.defaultPrevented;
      });
      expect(prevented).toBe(false);
    });
  }

  // Revision 11 (Anthony, 05/11/2026): the mode survives the turn of the board, both ways.
  test('the code then SW2 in the same moment: the mode and its colours go to the back face with the board', async ({ page }) => {
    await booted(page);
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page);
    // With motion, the colours come in a view transition a frame later: SW2 is pressed before it.
    await page.evaluate((code) => {
      for (const key of code) document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      (document.querySelector('.board__face--front button.sw2') as HTMLElement).click();
    }, CODE);
    await expect(page.locator('.board')).toHaveAttribute('data-flipped', '');
    await expect(page.locator('.board')).not.toHaveAttribute('data-turning', /.*/);
    await page.waitForTimeout(600);
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await expect(figure(page)).toHaveClass(/\bdisp--game\b/);
  });

  test('a turn of the board, both ways, keeps the game where it was: held, paused, B goes on', async ({ page }) => {
    await booted(page);
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page);
    await typeCode(page);
    await inGame(page);
    await page.keyboard.press('a');
    await expect(pixels(page).locator('path.px--head')).toHaveCount(1);
    await page.locator('.board__face--front button.sw2').click();
    await expect(page.locator('.board')).toHaveAttribute('data-flipped', '');
    const head = await headAt(page);
    await page.waitForTimeout(800);
    // Held while the back face is up: the signal still, the colours kept.
    expect(await headAt(page)).toEqual(head);
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await page.locator('.board__face--back button.sw2').click();
    await expect(page.locator('.board')).not.toHaveAttribute('data-flipped', /.*/);
    await expect(pixels(page).locator('path.px--pause')).toHaveCount(1);
    expect(await headAt(page)).toEqual(head);
    await expect(caption(page)).toHaveText(FR.captions.game);
    await page.keyboard.press('b');
    await expect(pixels(page).locator('path.px--pause')).toHaveCount(0);
    await expect.poll(async () => JSON.stringify(await headAt(page)), { timeout: 3000 }).not.toBe(JSON.stringify(head));
    await page.keyboard.press('Escape');
    await atRest(page);
  });

  test('a sheet over the game: it pauses the game and keeps its keys; one Escape closes it, the next ends the game', async ({ page }) => {
    await booted(page);
    await page.setViewportSize({ width: 1600, height: 900 });
    await open(page);
    await typeCode(page);
    await inGame(page);
    await page.keyboard.press('a');
    await expect(pixels(page).locator('path.px--head')).toHaveCount(1);
    await page.locator('.part__trigger[popovertarget="sheet-j1"]').click();
    const sheet = page.locator('#sheet-j1');
    await expect(sheet).toBeVisible();
    await expect(pixels(page).locator('path.px--pause')).toHaveCount(1);
    const head = await headAt(page);
    // The arrows are the sheet's: taken by no game, the signal still.
    const taken = await sheet.evaluate((el) => {
      const e = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
      (el.querySelector('h3') as HTMLElement).dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(taken).toBe(false);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(600);
    expect(await headAt(page)).toEqual(head);
    // One Escape: the sheet goes, the game stays and goes on.
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await expect(caption(page)).toHaveText(FR.captions.game);
    await expect(pixels(page).locator('path.px--pause')).toHaveCount(0);
    // The next one ends it (DISP1 then shows the readout of J1, which has the focus back).
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await expect(caption(page)).toHaveText(FR.captions.avatar);
    await expect(pixels(page)).not.toHaveAttribute('data-screen', 'game');
    await expect(said(page)).toHaveText('');
  });

  // Revision 11: typed with the back face up, the code starts the mode; the front then shows the title.
  test('the code typed with the back face up starts the mode, the front then on the title of the game; nothing on the open-circuit page', async ({ page }) => {
    await booted(page);
    await open(page);
    await page.locator('.board__face--front button.sw2').click();
    await expect(page.locator('.board')).toHaveAttribute('data-flipped', '');
    await typeCode(page);
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await page.locator('.board__face--back button.sw2').click();
    await expect(page.locator('.board')).not.toHaveAttribute('data-flipped', /.*/);
    await inGame(page);
    // Typed again, the code ends it.
    await typeCode(page);
    await atRest(page);
    await page.goto('/nope');
    await expect(page.locator('h1')).toBeVisible();
    await typeCode(page);
    await page.waitForTimeout(300);
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
  });

  test('leaving the page: the next one opens in its own colours', async ({ page }) => {
    await booted(page);
    await open(page);
    await typeCode(page);
    await inGame(page);
    await page.goto('/nope');
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await page.goBack();
    await expect(page.locator('button.jp1')).toBeVisible();
    await atRest(page);
  });

  test('fast: the code during the power-on, SW1 pressed again and again, Escape before the game has loaded', async ({ page }) => {
    // The power-on of the first visit: the code ends it, as SW1 does.
    await page.route(/\/assets\/play-[\w-]+\.js$/, async (route) => {
      await new Promise((r) => setTimeout(r, 400));
      await route.continue();
    });
    await page.goto('/');
    await typeCode(page);
    await expect(page.locator('div.board')).not.toHaveAttribute('data-booting', /.*/);
    // Out before the game has come: it never starts.
    await page.keyboard.press('Escape');
    await atRest(page);
    await page.waitForTimeout(600);
    await atRest(page);
    // In and out, again and again.
    for (let i = 0; i < 3; i++) {
      await typeCode(page);
      await expect(page.locator('html')).toHaveAttribute('data-retro', '');
      await sw1(page).click();
      await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    }
    await page.waitForTimeout(600);
    await atRest(page);
    // SW1 is SW1 again: the next screen.
    await sw1(page).click();
    await expect(caption(page)).toHaveText(FR.captions.uptime);
  });

  test('JP1 during the game: the choice is kept, and shows once the game is over', async ({ page }) => {
    await booted(page);
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);
    const page0 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await typeCode(page);
    await inGame(page);
    const retro = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(retro).not.toBe(page0);
    await page.locator('button.jp1').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await page.evaluate(() => localStorage.getItem('k0t3i.theme'))).toBe('dark');
    // Still the colours of the game.
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(retro);
    await page.keyboard.press('Escape');
    await atRest(page);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(8, 9, 10)');
  });
});

test.describe('the retro colours', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`every text stays AA: axe on the board and on an open sheet (${scheme})`, async ({ page, isMobile, browserName }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1600, height: 900 });
      await page.goto('/');
      await expect(page.locator('h1')).toBeVisible();
      if (swipes({ browserName, isMobile })) for (const [dx, dy] of SWIPES) await swipe(page, dx, dy);
      else await typeCode(page);
      await expect(page.locator('html')).toHaveAttribute('data-retro', '');
      const axe = async () => (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      expect(await axe()).toEqual([]);
      // The board and the page are in their old LCD greens, apart from the green and the black of the boards.
      const colours = await page.evaluate(() => [getComputedStyle(document.body).backgroundColor, getComputedStyle(document.querySelector('.board__face') as Element).backgroundColor]);
      expect(colours).not.toContain('rgb(236, 234, 227)');
      expect(colours).not.toContain('rgb(8, 9, 10)');
      expect(colours).not.toContain('rgb(15, 55, 42)');
      expect(colours).not.toContain('rgb(12, 13, 15)');
      await page.locator('.part__trigger[popovertarget="sheet-j3"]').click();
      await expect(page.locator('#sheet-j3')).toBeVisible();
      expect(await axe()).toEqual([]);
    });
  }

  test('under reduced motion: the game plays, the colours change at once, nothing else moves', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('button.jp1')).toBeVisible();
    await page.evaluate(() => {
      const w = window as unknown as { transitions: number };
      w.transitions = 0;
      const start = document.startViewTransition?.bind(document);
      if (start) document.startViewTransition = ((cb: ViewTransitionUpdateCallback) => (w.transitions++, start(cb))) as typeof document.startViewTransition;
    });
    await typeCode(page);
    await inGame(page);
    await page.keyboard.press('a');
    const start = await headAt(page);
    await expect.poll(async () => (await headAt(page))?.x ?? 0, { timeout: 3000 }).toBeGreaterThan(start?.x ?? 0);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await page.keyboard.press('Escape');
    await atRest(page);
    expect(await page.evaluate(() => (window as unknown as { transitions: number }).transitions)).toBe(0);
  });

  test('when motion is welcome, the colours cross-fade in and out with the page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await booted(page);
    await open(page);
    const supported = await page.evaluate(() => {
      const w = window as unknown as { transitions: number };
      w.transitions = 0;
      const start = document.startViewTransition?.bind(document);
      if (start) document.startViewTransition = ((cb: ViewTransitionUpdateCallback) => (w.transitions++, start(cb))) as typeof document.startViewTransition;
      return Boolean(start);
    });
    await typeCode(page);
    await inGame(page);
    await page.keyboard.press('Escape');
    await atRest(page);
    expect(await page.evaluate(() => (window as unknown as { transitions: number }).transitions)).toBe(supported ? 2 : 0);
  });
});

/*
 * The way out on a phone (hotfix of 05/11/2026, Anthony): while the game mode is on, SW1 carries the
 * silkscreen « QUITTER » / "EXIT", drawn only (the rules said at the start name SW1), gone on every
 * way out. Keyboard, mouse and touch alike.
 */
test.describe('« QUITTER » by SW1', () => {
  test.use({ reducedMotion: 'reduce' });
  const exit = (page: Page): Locator => page.locator('button.sw1 .sw1__exit');

  /** The game mode on: by the keys, or by the keypad tapped on a phone. */
  async function start(page: Page, isMobile: boolean): Promise<void> {
    if (isMobile) for (const k of ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a']) await page.locator(`.keypad__key[data-key="${k}"]`).tap();
    else await typeCode(page);
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
  }

  const ways: [string, (page: Page, isMobile: boolean) => Promise<unknown>][] = [
    ['Escape', (page) => page.keyboard.press('Escape')],
    ['SW1', (page, isMobile) => (isMobile ? sw1(page).tap() : sw1(page).click())],
    [
      'the QUITTER of the back face',
      async (page, isMobile) => {
        const go = (l: Locator) => (isMobile ? l.tap() : l.click());
        await go(page.locator('.board__face--front button.sw2'));
        await go(page.getByRole('button', { name: FR.back.bench.exitName }));
        await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
        await go(page.locator('.board__face--back button.sw2'));
      },
    ],
    ['a language switch', (page) => page.getByRole('link', { name: 'English' }).click()],
  ];
  for (const [way, leave] of ways) {
    test(`shown in the game mode, drawn only, gone after ${way}`, async ({ page, isMobile }) => {
      await booted(page);
      await open(page);
      await expect(exit(page)).toHaveCount(0);
      const name = await sw1(page).evaluate((el) => el.textContent);
      await start(page, isMobile);
      await expect(exit(page)).toBeVisible();
      await expect(exit(page)).toHaveText(FR.game.exit);
      await expect(exit(page)).toHaveAttribute('aria-hidden', 'true');
      // Said nowhere: the name of SW1 is what it was.
      await expect(sw1(page)).toHaveAccessibleName(`${FR.switchRef} ${FR.switchHidden}`);
      expect(await exit(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12);
      await leave(page, isMobile);
      await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
      await expect(page.locator('button.sw1 .sw1__exit')).toHaveCount(0);
      if (way === 'a language switch') await expect(sw1(page)).toHaveAccessibleName(`${EN.switchRef} ${EN.switchHidden}`);
      else expect(await sw1(page).evaluate((el) => el.textContent)).toBe(name);
    });
  }

  test('in English: EXIT', async ({ page, isMobile }) => {
    await booted(page);
    await open(page, '/en/');
    await start(page, isMobile);
    await expect(exit(page)).toHaveText(EN.game.exit);
  });
});

test.describe('the caption of the game fits', () => {
  // These tests inject a stylesheet: the CSP of the page is bypassed for them only.
  test.use({ bypassCSP: true, reducedMotion: 'reduce' });
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'the widths are set here');
  });

  for (const width of [320, 390, 768, 1024, 1264, 1600]) {
    for (const [label, css] of [
      ['plain', ''],
      ['the root font at 125%', 'html { font-size: 125% !important; }'],
      ['text spacing', TEXT_SPACING],
    ]) {
      test(`${width}px, ${label}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await expect(page.locator('button.jp1')).toBeVisible();
        if (css) await page.addStyleTag({ content: css });
        // The lines of a caption: as many for the game as for the others (at 320px with a large font they all take two).
        const lines = () =>
          caption(page).evaluate((c) => {
            const range = document.createRange();
            range.selectNodeContents(c);
            return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
          });
        const others = await lines();
        // What is around SW1, before and in the game mode (in the page: the game scrolls DISP1 into view):
        // « QUITTER » comes out of the flow, nothing moves.
        const boxes = () =>
          page.evaluate(() =>
            ['figure.disp', '#disp1-caption', 'button.sw1', '.keypad', '.parts .silk-heading'].map((q) => {
              const r = (document.querySelector(q) as Element).getBoundingClientRect();
              // The caption keeps its place; its width is its text's.
              return `${q} ${(r.x + scrollX).toFixed(1)} ${(r.y + scrollY).toFixed(1)} ${q === '#disp1-caption' ? '' : r.width.toFixed(1)} ${r.height.toFixed(1)}`;
            }),
          );
        const before = await boxes();
        await typeCode(page);
        await expect(caption(page)).toHaveText(FR.captions.game);
        expect(await lines()).toBeLessThanOrEqual(others);
        await expect(page.locator('.sw1__exit')).toHaveText(FR.game.exit);
        expect(await boxes()).toEqual(before);
        const problems = await page.evaluate(() => {
          const out: string[] = [];
          const c = document.querySelector('#disp1-caption') as HTMLElement;
          const box = c.getBoundingClientRect();
          const disp = (document.querySelector('figure.disp') as HTMLElement).getBoundingClientRect();
          const sw1 = (document.querySelector('button.sw1') as HTMLElement).getBoundingClientRect();
          if (c.scrollWidth > c.clientWidth + 1) out.push(`its text overflows: ${c.scrollWidth} > ${c.clientWidth}`);
          if (box.left < disp.left - 1 || box.right > disp.right + 1) out.push(`out of DISP1: ${box.left}-${box.right} in ${disp.left}-${disp.right}`);
          const overlap = Math.min(box.right, sw1.right) - Math.max(box.left, sw1.left) > 0 && Math.min(box.bottom, sw1.bottom) - Math.max(box.top, sw1.top) > 0;
          if (overlap) out.push('over SW1');
          // « QUITTER » by SW1 (hotfix of 05/11/2026): 12 px at least, on one line, on the face, clear of
          // the caption, the body and the reference of SW1, the keypad, the headings and the parts.
          const exit = (document.querySelector('.sw1__exit') as HTMLElement).getBoundingClientRect();
          const face = (document.querySelector('.board__face--front') as HTMLElement).getBoundingClientRect();
          const size = parseFloat(getComputedStyle(document.querySelector('.sw1__exit') as Element).fontSize);
          if (size < 12) out.push(`QUITTER at ${size}px`);
          if (exit.left < face.left + 2 || exit.right > face.right - 2 || exit.top < face.top || exit.bottom > face.bottom) out.push(`QUITTER off the face: ${exit.left}-${exit.right} in ${face.left}-${face.right}`);
          const hits = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
          const others = ['#disp1-caption', '.disp__screen', 'button.sw1 .sw1__body', 'button.sw1 .part__ref', '.keypad__key', '.keypad__art > *', '.silk-heading', '.part__trigger', '.board__header', '.jp1'];
          for (const q of others) for (const el of document.querySelectorAll(q)) if (hits(exit, el.getBoundingClientRect())) out.push(`QUITTER over ${q}`);
          return out;
        });
        expect(problems).toEqual([]);
      });
    }
  }
});
