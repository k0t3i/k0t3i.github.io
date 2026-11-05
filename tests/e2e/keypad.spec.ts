import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { EN, FR, type Copy } from '../helpers/copy';

/*
 * The test keypad of revision 10 (spec 4.11): six buttons under DISP1, on the switches of the art of
 * the wide board, drawn by themselves on the flowing board. Pressed, they type the code of the easter
 * egg; in the game they play it (the arrows steer, B pauses, A plays). One tab stop, the arrows
 * inside it; nothing without JavaScript; nothing to the game while a sheet is open.
 */

type PadKey = 'up' | 'down' | 'left' | 'right' | 'b' | 'a';
const CODE = ['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a'] as const;
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

const pad = (page: Page, copy: Copy = FR): Locator => page.getByRole('group', { name: copy.keypad.group });
const key = (page: Page, k: PadKey): Locator => page.locator(`.keypad__key[data-key="${k}"]`);
const pixels = (page: Page): Locator => page.locator('svg.disp__pixels');
const head = (page: Page): Locator => pixels(page).locator('path.px--head');
const paused = (page: Page): Locator => pixels(page).locator('path.px--pause');

const booted = (page: Page): Promise<unknown> => page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));

async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('.keypad__keys')).toBeVisible();
}

/** A real press: a tap of the touch screen on the phones, a click of the mouse elsewhere. */
async function press(page: Page, isMobile: boolean, k: PadKey): Promise<void> {
  if (isMobile) await key(page, k).tap();
  else await key(page, k).click();
}

async function inGame(page: Page, copy: Copy = FR): Promise<void> {
  await expect(page.locator('html')).toHaveAttribute('data-retro', '');
  await expect(page.locator('#disp1-caption')).toHaveText(copy.captions.game);
  await expect(pixels(page)).toHaveAttribute('data-screen', 'game');
  await expect(pixels(page).locator('path.px--word')).toHaveCount(1);
}

/** Where the signal is: the top left lit pixel of its path, on the 64 x 64 screen. */
const headAt = (page: Page): Promise<{ x: number; y: number } | null> =>
  head(page).evaluateAll((paths) => {
    const m = paths[0]?.getAttribute('d')?.match(/^M(\d+) (\d+)/);
    return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
  });

test.describe('the test keypad', () => {
  test.use({ reducedMotion: 'no-preference' });

  for (const copy of [FR, EN] as Copy[]) {
    test(`is a named group of six named buttons, in DISP1, without a hydration warning (${copy.path})`, async ({ page }) => {
      const messages: string[] = [];
      page.on('console', (m) => messages.push(`${m.type()}: ${m.text()}`));
      page.on('pageerror', (e) => messages.push(e.message));
      await booted(page);
      await open(page, copy.path);
      await page.waitForLoadState('networkidle');
      const buttons = pad(page, copy).getByRole('button');
      await expect(buttons).toHaveCount(6);
      for (const [i, name] of copy.keypad.keys.entries()) await expect(buttons.nth(i)).toHaveAccessibleName(name);
      await expect(page.locator('figure.disp .keypad')).toHaveCount(1);
      await expect(page.locator('figure.disp > :last-child')).toHaveId('disp1-caption');
      // Pressed, it hydrated the same nodes: nothing said in the console.
      await key(page, 'up').focus();
      await page.keyboard.press('Enter');
      expect(messages.filter((m) => /hydrat|error|warn|content security policy/i.test(m))).toEqual([]);
      // Placed by a stylesheet of their own: no style attribute in the page (CSP).
      await expect(page.locator('[style]')).toHaveCount(0);
      expect(await key(page, 'right').evaluate((el) => getComputedStyle(el).getPropertyValue('--x').trim())).not.toBe('');
    });
  }

  // At the narrowest wide board, the usual window and the widest (the review of Task 18: 1264 and 1600 too).
  for (const width of [1264, 1440, 1600]) {
  test(`each hit area is at least 24 px, the areas apart, none under the text of the hero, at ${width} px`, async ({ page, isMobile }) => {
    test.skip(isMobile && width !== 1440, 'the phones once');
    await booted(page);
    if (!isMobile) await page.setViewportSize({ width, height: 900 });
    await open(page);
    const boxes = await page.locator('.keypad__key').evaluateAll((keys) => keys.map((k) => k.getBoundingClientRect().toJSON() as DOMRect));
    for (const b of boxes) expect(Math.min(b.width, b.height)).toBeGreaterThanOrEqual(24);
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1)) expect(Math.min(a.right, b.right) - Math.max(a.left, b.left) <= 0.5 || Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) <= 0.5).toBe(true);
    // The text of the title and the subtitle (their lines, not their boxes) never meets a key.
    const lines = await page.locator('.hero__title, .hero__sub').evaluateAll((els) =>
      els.flatMap((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return [...range.getClientRects()].map((r) => r.toJSON() as DOMRect);
      }),
    );
    for (const l of lines) for (const b of boxes) expect(l.right <= b.left || l.left >= b.right || l.bottom <= b.top || l.top >= b.bottom).toBe(true);
  });
  }

  test('one tab stop, the arrows inside it, Home and End; Tab leaves it', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await booted(page);
    await open(page);
    await page.locator('button.sw1').focus();
    await page.keyboard.press('Tab');
    await expect(key(page, 'up')).toBeFocused();
    for (const [k, to] of [
      ['ArrowRight', 'down'],
      ['ArrowDown', 'left'],
      ['ArrowRight', 'right'],
      ['ArrowRight', 'b'],
      ['ArrowRight', 'a'],
      ['ArrowRight', 'up'],
      ['ArrowLeft', 'a'],
      ['Home', 'up'],
      ['End', 'a'],
      ['ArrowUp', 'b'],
    ] as const) {
      await page.keyboard.press(k);
      await expect(key(page, to)).toBeFocused();
    }
    // The arrows moved the focus, they did not scroll the page.
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.classList.contains('keypad__key'))).toBe(false);
    // Back with Shift+Tab: on the key last focused.
    await page.keyboard.press('Shift+Tab');
    await expect(key(page, 'b')).toBeFocused();
  });

  // The review of Task 18: the keypad kept the arrows from the document, so the code typed with the focus on it was lost.
  test('the code typed on the keyboard with the focus on the keypad starts the game, the page not scrolled', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await booted(page);
    await open(page);
    await key(page, 'up').focus();
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) await page.keyboard.press(k);
    await inGame(page);
    expect(await page.evaluate(() => document.activeElement?.classList.contains('keypad__key'))).toBe(true);
    expect(await page.evaluate(() => scrollY)).toBe(0);
  });

  test('the whole code pressed on it starts the game (taps on the phones, clicks elsewhere), only then fetched', async ({ page, isMobile }) => {
    const asked: string[] = [];
    page.on('request', (r) => {
      if (/\/assets\/play-[\w-]+\.js$/.test(new URL(r.url()).pathname)) asked.push(r.url());
    });
    await booted(page);
    await open(page);
    for (const k of CODE.slice(0, 9)) await press(page, isMobile, k);
    expect(asked).toEqual([]);
    await press(page, isMobile, 'a');
    await inGame(page);
    expect(asked).toHaveLength(1);
  });

  test('in the game: A plays, the arrows steer, B pauses and goes on; the end screen plays again on A', async ({ page, isMobile }) => {
    await booted(page);
    await open(page);
    for (const k of CODE) await press(page, isMobile, k);
    await inGame(page);
    await press(page, isMobile, 'a');
    await expect(head(page)).toHaveCount(1);
    const start = await headAt(page);
    await press(page, isMobile, 'down');
    await expect.poll(async () => (await headAt(page))?.y ?? 0, { timeout: 3000 }).toBeGreaterThan(start?.y ?? 0);
    await press(page, isMobile, 'b');
    await expect(paused(page)).toHaveCount(1);
    const still = await headAt(page);
    await page.waitForTimeout(600);
    expect(await headAt(page)).toEqual(still);
    await press(page, isMobile, 'b');
    await expect(paused(page)).toHaveCount(0);
    // Straight on to an edge: the end of the game, then A again.
    await expect(pixels(page).locator('path.px--score')).toHaveCount(1, { timeout: 8000 });
    await press(page, isMobile, 'a');
    await expect(head(page)).toHaveCount(1);
  });

  test('the arrows typed in it steer the game, the focus stays; out of the game they move the focus again', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await booted(page);
    await open(page);
    await key(page, 'up').focus();
    for (const k of CODE) {
      await key(page, k).focus();
      await page.keyboard.press('Enter');
    }
    await inGame(page);
    await key(page, 'a').focus();
    await page.keyboard.press('Enter');
    await expect(head(page)).toHaveCount(1);
    const start = await headAt(page);
    await page.keyboard.press('ArrowDown');
    await expect.poll(async () => (await headAt(page))?.y ?? 0, { timeout: 3000 }).toBeGreaterThan(start?.y ?? 0);
    await expect(key(page, 'a')).toBeFocused();
    // Escape ends the game; the arrows go from key to key again.
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await page.keyboard.press('ArrowRight');
    await expect(key(page, 'up')).toBeFocused();
  });

  // The review of Task 18: on the title of the game, the arrows typed with the focus on the pad scrolled the page.
  test('in the game mode, out of a game too, the arrows typed on the keypad never scroll the page', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await booted(page);
    await page.setViewportSize({ width: 1024, height: 600 });
    await open(page);
    await key(page, 'up').focus();
    for (const k of CODE) {
      await key(page, k).focus();
      await page.keyboard.press('Enter');
    }
    await inGame(page);
    // On the title: the page stays where the game put it, the focus on its key.
    await page.waitForTimeout(600);
    const at = await page.evaluate(() => scrollY);
    for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowRight']) await page.keyboard.press(k);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => scrollY)).toBe(at);
    await expect(key(page, 'a')).toBeFocused();
  });

  // The review of Task 18: the code typed in an open sheet started the game and the retro colours under it.
  test('the code typed while a sheet is open, the focus in it, starts nothing', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await booted(page);
    await open(page);
    const sheet = page.locator('#sheet-j1');
    await page.locator('.part__trigger[popovertarget="sheet-j1"]').click();
    await expect(sheet).toBeVisible();
    expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (const k of ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a']) await page.keyboard.press(k);
    await page.waitForTimeout(300);
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await expect(pixels(page)).not.toHaveAttribute('data-screen', 'game');
  });

  test('a press while a sheet is open does nothing to the game, nor B typed with the focus out of the sheet', async ({ page, isMobile }) => {
    await booted(page);
    await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1600, height: 900 });
    await open(page);
    for (const k of CODE) await press(page, isMobile, k);
    await inGame(page);
    await press(page, isMobile, 'a');
    await expect(head(page)).toHaveCount(1);
    // Paused with B, then a sheet: B (from the keypad, or typed outside the sheet) does not go on with the game.
    await press(page, isMobile, 'b');
    await expect(paused(page)).toHaveCount(1);
    const sheet = page.locator('#sheet-j1');
    await page.locator('.part__trigger[popovertarget="sheet-j1"]').click();
    await expect(sheet).toBeVisible();
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('b');
    await page.keyboard.press('a');
    await expect(paused(page)).toHaveCount(1);
    // The press closes the sheet (outside it), and does nothing else.
    await press(page, isMobile, 'b');
    await expect(sheet).toBeHidden();
    await page.waitForTimeout(300);
    await expect(paused(page)).toHaveCount(1);
    await press(page, isMobile, 'b');
    await expect(paused(page)).toHaveCount(0);
  });

  test('retro recolours its focus; forced colours give each key a system outline', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a keyboard');
    await booted(page);
    await open(page);
    await key(page, 'up').focus();
    await page.keyboard.press('ArrowRight');
    const ring = (): Promise<string> => key(page, 'down').evaluate((el) => getComputedStyle(el).outlineColor);
    const before = await ring();
    for (const k of CODE) {
      await key(page, k).focus();
      await page.keyboard.press('Enter');
    }
    await inGame(page);
    await key(page, 'down').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(key(page, 'down')).toBeFocused();
    expect(await ring()).not.toBe(before);
    expect(await ring()).toBe('rgb(140, 196, 100)');
    await page.keyboard.press('Escape');
    await page.emulateMedia({ forcedColors: 'active' });
    const edge = await key(page, 'a').evaluate((el) => [getComputedStyle(el).borderTopStyle, getComputedStyle(el).borderTopWidth]);
    expect(edge).toEqual(['solid', '1px']);
    await page.emulateMedia({ forcedColors: 'none', contrast: 'more' });
    expect(await key(page, 'a').evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  });

  test('nothing of it moves at rest; a press lights its plunger only while motion is welcome', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    await booted(page);
    await open(page);
    expect(await page.locator('.keypad, .keypad *').evaluateAll((els) => els.flatMap((el) => el.getAnimations()).length)).toBe(0);
    const lit = async (): Promise<string> => {
      const box = await key(page, 'left').boundingBox();
      if (!box) throw new Error('no key');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      const bg = await key(page, 'left').evaluate((el) => getComputedStyle(el, '::before').backgroundColor);
      await page.mouse.up();
      return bg;
    };
    expect(await lit()).not.toBe('rgba(0, 0, 0, 0)');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await lit()).toBe('rgba(0, 0, 0, 0)');
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe: 0 violations with the keypad, at rest and in the retro colours (${scheme})`, async ({ page, isMobile }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      await page.setViewportSize(isMobile ? { width: 390, height: 844 } : { width: 1600, height: 900 });
      await booted(page);
      await open(page);
      const axe = async () => (await new AxeBuilder({ page }).withTags(TAGS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      await key(page, 'up').focus();
      expect(await axe()).toEqual([]);
      for (const k of CODE) await press(page, isMobile, k);
      await inGame(page);
      expect(await axe()).toEqual([]);
    });
  }

  test('on a phone of 390 x 844, in the game, the keypad and DISP1 are both in full view', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the flowing board of a phone');
    await page.setViewportSize({ width: 390, height: 844 });
    await booted(page);
    await open(page);
    // The keypad comes last in DISP1: a tap on it leaves the screen above the window, until the game brings it in.
    for (const k of CODE) await key(page, k).tap();
    await inGame(page);
    const seen = (): Promise<boolean[]> =>
      page.evaluate(() =>
        ['.disp__screen', '.keypad', '#disp1-caption'].map((s) => {
          const r = (document.querySelector(s) as Element).getBoundingClientRect();
          return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth;
        }),
      );
    await expect.poll(seen).toEqual([true, true, true]);
    // The colours cross-fade in a view transition, which takes the taps meanwhile: once it is over, the keys take them.
    await expect
      .poll(() =>
        key(page, 'a').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el;
        }),
      )
      .toBe(true);
    // And they stay so while it plays (A, a turn, B, on the keypad).
    for (const k of ['a', 'down', 'b'] as const) await key(page, k).tap();
    await expect(head(page)).toHaveCount(1);
    expect(await seen()).toEqual([true, true, true]);
  });
});

test.describe('the test keypad without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('reads as a drawing: no button, no group announced, the switches drawn on the flowing board', async ({ page, isMobile }) => {
    await page.goto('/');
    await expect(page.locator('.keypad__keys')).toBeHidden();
    await expect(page.getByRole('group', { name: FR.keypad.group })).toHaveCount(0);
    for (const name of FR.keypad.keys) await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(page.locator('svg.keypad__art')).toHaveAttribute('aria-hidden', 'true');
    if (isMobile) await expect(page.locator('svg.keypad__art')).toBeVisible();
  });
});
