import { chromium, expect, test, type Locator, type Page } from '@playwright/test';
import { EN, FR, type Copy } from '../helpers/copy';
import { armFlatTiming, flatAfter, tiltStill } from '../helpers/still';

/*
 * The board as an object: its edge (thickness), the tilt that follows a mouse at every width, and
 * SW2, which turns it over to its back face.
 */

const WIDE = { width: 1600, height: 900 };
const PHONE = { width: 390, height: 844 };
const FR4 = 'rgb(205, 196, 154)';

const board = (page: Page): Locator => page.locator('div.board');
const face = (page: Page, side: 'front' | 'back'): Locator => page.locator(`.board__face--${side}`);
const sw2 = (page: Page, side: 'front' | 'back'): Locator => page.locator(`.board__face--${side} button.sw2`);

/** The page once the app has mounted: SW2 is shown on the front face. */
async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(sw2(page, 'front')).toBeVisible();
}

/** Resolves when no turn is running. */
const atRest = (page: Page): Promise<void> => expect(board(page)).not.toHaveAttribute('data-turning', /.*/);

/** Whether an element is drawn flat: no transform, or the identity. */
const isFlat = (l: Locator): Promise<boolean> =>
  l.evaluate((el) => {
    const t = getComputedStyle(el).transform;
    return t === 'none' || new DOMMatrix(t).isIdentity;
  });

/**
 * Turns the board over with a click on the SW2 of the face that is up, then moves the mouse off the
 * board and waits for the board to be at rest: no turn, no tilt.
 */
async function turn(page: Page, from: 'front' | 'back'): Promise<void> {
  await sw2(page, from).click();
  if (from === 'front') await expect(board(page)).toHaveAttribute('data-flipped', '');
  else await expect(board(page)).not.toHaveAttribute('data-flipped', /.*/);
  await page.mouse.move(1, 1);
  await atRest(page);
  await expect(board(page)).not.toHaveAttribute('data-tilting', /.*/);
}

/** Nothing of the tilt is left: no inline style on the board, its body or its edge. */
const noTiltLeft = (page: Page): Promise<boolean> =>
  page.evaluate(() => ['.board', '.board__body', '.board__edge'].every((s) => !document.querySelector(s)?.hasAttribute('style')));

/** Moves the mouse to a point of the board, given as fractions of its box. */
async function pointAt(page: Page, fx: number, fy: number): Promise<void> {
  const box = await board(page).boundingBox();
  if (!box) throw new Error('no box for the board');
  await page.mouse.move(box.x + box.width * fx, box.y + box.height * fy, { steps: 4 });
}

test.describe('the edge', () => {
  for (const viewport of [WIDE, PHONE]) {
    test(`board has a visible edge at rest at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await open(page);
      const edge = page.locator('.board__edge');
      await expect(edge).toBeVisible();
      // The bottom of the board in view: the edge shows under it.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const [e, f] = await Promise.all([edge.boundingBox(), face(page, 'front').boundingBox()]);
      if (!e || !f) throw new Error('no box for the edge or the face');
      // The edge is the side of the board, under its face: it shows below it, as wide as the board.
      expect(e.y + e.height - (f.y + f.height)).toBeGreaterThanOrEqual(4);
      expect(Math.abs(e.x - f.x)).toBeLessThanOrEqual(0.5);
      expect(Math.abs(e.width - f.width)).toBeLessThanOrEqual(0.5);
      // FR4 between two layers of solder mask, and no text.
      const look = await edge.evaluate((el) => ({ shadow: getComputedStyle(el).boxShadow, text: el.textContent }));
      expect(look.shadow).toContain(FR4);
      expect(look.text).toBe('');
      // The face is drawn over the edge.
      const top = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.board__face, .board__edge')?.className, {
        x: f.x + f.width / 2,
        y: f.y + f.height - 2,
      });
      expect(top).toContain('board__face--front');
    });
  }
});

test.describe('the tilt', () => {
  test.use({ reducedMotion: 'no-preference' });

  /** The flowing board at the size Anthony looked at it, taller than the window. */
  const FLOWING = { width: 711, height: 900 };

  /** The angles the body reads (the edge reads the same ones), in degrees. */
  const tiltOf = (page: Page): Promise<number[]> =>
    page.locator('.board__body').evaluate((el) => ['--tilt-x', '--tilt-y'].map((p) => parseFloat(el.style.getPropertyValue(p) || '0')));

  test('desktop tilt follows the pointer', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the tilt needs a mouse');
    await page.setViewportSize(WIDE);
    await open(page);
    const body = page.locator('.board__body');
    expect(await isFlat(body)).toBe(true);
    await pointAt(page, 0.85, 0.2);
    await expect.poll(() => isFlat(body)).toBe(false);
    // A few degrees at most; the edge leans with the face.
    // The angles are on the body and the edge (registered, not inherited), never on the board.
    const tilt = await tiltOf(page);
    expect(await board(page).getAttribute('style')).toBeNull();
    expect(await page.locator('.hero__title').evaluate((el) => getComputedStyle(el).getPropertyValue('--tilt-y'))).toBe('0deg');
    for (const a of tilt) expect(Math.abs(a)).toBeLessThanOrEqual(5);
    expect(tilt[1]).toBeGreaterThan(0);
    expect(tilt[0]).toBeGreaterThan(0);
    const [b, e] = await Promise.all(
      [body, page.locator('.board__edge')].map((l) => l.evaluate((el) => getComputedStyle(el).transform)),
    );
    expect(e).toBe(b);
    // Out of the board, it comes back flat within a second, measured in the page from the pointer
    // leaving the board to the end of data-tilting, and leaves nothing behind.
    await armFlatTiming(page);
    await page.mouse.move(4, 4);
    expect(await flatAfter(page)).toBeLessThan(1000);
    await expect.poll(() => isFlat(body)).toBe(true);
    expect(await noTiltLeft(page)).toBe(true);
    await expect(board(page)).not.toHaveAttribute('data-tilting', /.*/);
  });

  for (const viewport of [FLOWING, WIDE]) {
    test(`board tilts at every width with a mouse (${viewport.width}x${viewport.height})`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'the tilt needs a mouse');
      await page.setViewportSize(viewport);
      await open(page);
      // The top right of the window, over the board: its top and its right edge go away.
      await page.mouse.move(viewport.width * 0.8, viewport.height * 0.3, { steps: 4 });
      await expect(board(page)).toHaveAttribute('data-tilting', '');
      await expect.poll(async () => (await tiltOf(page)).map((a) => a > 0.5)).toEqual([true, true]);
      for (const a of await tiltOf(page)) expect(Math.abs(a)).toBeLessThanOrEqual(5);
      // Written on the body and the edge only.
      expect(await board(page).getAttribute('style')).toBeNull();
      const [onBody, onEdge] = await page.evaluate(() =>
        ['.board__body', '.board__edge'].map((s) => (document.querySelector(s) as HTMLElement).style.getPropertyValue('--tilt-y')),
      );
      expect(onEdge).toBe(onBody);
      if (viewport.width < 1264) {
        // The flowing board, taller than the window, scrolled to its end: the pointer near the top
        // of the window is below the middle of the board, yet the top of what is in view goes away.
        await page.mouse.move(1, 1);
        await expect(board(page)).not.toHaveAttribute('data-tilting', /.*/);
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const middle = await board(page).evaluate((el) => {
          const b = el.getBoundingClientRect();
          return { board: b.top + b.height / 2, view: (Math.max(b.top, 0) + Math.min(b.bottom, innerHeight)) / 2 - b.top };
        });
        expect(viewport.height * 0.15).toBeGreaterThan(middle.board);
        await page.mouse.move(viewport.width / 2, viewport.height * 0.15, { steps: 4 });
        await expect.poll(async () => (await tiltOf(page))[0]).toBeGreaterThan(2);
        // It turns about the middle of the part in view, and is seen from there.
        const origin = () => page.locator('.board__body').evaluate((el) => parseFloat(getComputedStyle(el).transformOrigin.split(' ')[1] ?? '0'));
        await expect.poll(async () => Math.abs((await origin()) - middle.view)).toBeLessThanOrEqual(2);
        expect(await page.locator('.board__body').evaluate((el) => getComputedStyle(el).transform)).toMatch(/^matrix3d/);
      }
      await page.mouse.move(1, 1);
      await expect(board(page)).not.toHaveAttribute('data-tilting', /.*/);
      expect(await noTiltLeft(page)).toBe(true);
    });
  }

  test('the leaning flowing board never makes the page scroll sideways', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the tilt needs a mouse');
    await page.setViewportSize(FLOWING);
    await open(page);
    // Towards each corner of the window in turn: a far corner of the board, out of view, comes forward.
    for (const [fx, fy] of [
      [0.05, 0.05],
      [0.95, 0.05],
      [0.05, 0.95],
      [0.95, 0.95],
    ] as const) {
      await page.mouse.move(FLOWING.width * fx, FLOWING.height * fy, { steps: 4 });
      await expect(board(page)).toHaveAttribute('data-tilting', '');
      // Once the board has come to its angle.
      await tiltStill(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${fx},${fy}`).toBe(0);
    }
  });

  test('a leaning back face takes the pointer on its parts', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the tilt needs a mouse');
    await page.setViewportSize(WIDE);
    await open(page);
    await turn(page, 'front');
    for (const ref of ['U10', 'U12']) {
      const part = page.locator(`button.back-part[data-ref="${ref}"]`);
      const box = await part.boundingBox();
      if (!box) throw new Error(`no box for ${ref}`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
      await expect(board(page)).toHaveAttribute('data-tilting', '');
      await tiltStill(page);
      // A grid of points inside the part, as it is drawn now: each one lands on it, none on the body.
      const misses = await part.evaluate((el) => {
        const b = el.getBoundingClientRect();
        const out: string[] = [];
        for (let fx = 0.2; fx < 0.85; fx += 0.15) {
          for (let fy = 0.2; fy < 0.85; fy += 0.15) {
            const hit = document.elementFromPoint(b.left + b.width * fx, b.top + b.height * fy);
            if (hit?.closest('.back-part') !== el) out.push(`${fx.toFixed(2)},${fy.toFixed(2)} ${hit?.className ?? hit?.tagName}`);
          }
        }
        return out;
      });
      expect(misses, ref).toEqual([]);
    }
  });

  test('the flowing board leans with its back face up too', async ({ page, isMobile }) => {
    test.skip(isMobile, 'the tilt needs a mouse');
    await page.setViewportSize(FLOWING);
    await open(page);
    await turn(page, 'front');
    await page.mouse.move(FLOWING.width * 0.2, FLOWING.height * 0.8, { steps: 4 });
    await expect(board(page)).toHaveAttribute('data-tilting', '');
    // The left and the bottom go away, on the back face as on the front one.
    await expect.poll(async () => (await tiltOf(page)).map((a) => Math.sign(Math.round(a * 10)))).toEqual([-1, -1]);
  });

  test('no tilt on a touch screen', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the touch projects');
    for (const viewport of [WIDE, PHONE]) {
      await page.setViewportSize(viewport);
      await open(page);
      await pointAt(page, 0.9, 0.1);
      await page.touchscreen.tap(viewport.width * 0.9, viewport.height * 0.5);
      await page.waitForTimeout(400);
      expect(await isFlat(page.locator('.board__body'))).toBe(true);
      expect(await noTiltLeft(page)).toBe(true);
    }
  });

  for (const viewport of [WIDE, FLOWING]) {
    test(`no tilt under reduced motion (${viewport.width}px)`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'covered by the touch case');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize(viewport);
      await open(page);
      await pointAt(page, 0.9, 0.1);
      await page.waitForTimeout(400);
      expect(await isFlat(page.locator('.board__body'))).toBe(true);
      expect(await noTiltLeft(page)).toBe(true);
    });
  }

  for (const viewport of [WIDE, FLOWING]) {
    test(`the board stays flat while a sheet is open (${viewport.width}px)`, async ({ page, isMobile }) => {
      test.skip(isMobile, 'the tilt needs a mouse');
      await page.setViewportSize(viewport);
      await open(page);
      await page.locator('.part__trigger[popovertarget="sheet-r1"]').click();
      await expect(page.locator('#sheet-r1')).toBeVisible();
      await page.mouse.move(viewport.width * 0.1, viewport.height * 0.9, { steps: 4 });
      await page.mouse.move(viewport.width * 0.9, viewport.height * 0.1, { steps: 4 });
      await page.waitForTimeout(400);
      expect(await isFlat(page.locator('.board__body'))).toBe(true);
    });
  }

  test('text stays crisp at rest', async ({ page }) => {
    await page.setViewportSize(WIDE);
    await open(page);
    /** Transform and will-change of the parts that move: none of them is in 3D at rest. */
    const rest = () =>
      page.evaluate(() =>
        ['.board__body', '.board__face--front', '.board__face--back', '.board__edge'].map((s) => {
          const st = getComputedStyle(document.querySelector(s) as Element);
          return `${s} ${st.transform} ${st.willChange}`;
        }),
      );
    const expected = ['.board__body', '.board__face--front', '.board__face--back', '.board__edge'].map((s) => `${s} none auto`);
    expect(await rest()).toEqual(expected);
    // Also with the back face up, once the turn is over.
    await turn(page, 'front');
    expect(await rest()).toEqual(expected);
  });
});

test.describe('SW2', () => {
  test('SW2 turns the board to its back face and back, from the keyboard', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no keyboard on touch devices');
    await open(page);
    await sw2(page, 'front').focus();
    await page.keyboard.press('Enter');
    await expect(board(page)).toHaveAttribute('data-flipped', '');
    await expect(face(page, 'front')).toHaveAttribute('inert', '');
    await expect(face(page, 'back')).not.toHaveAttribute('inert', /.*/);
    await expect(page.locator('#back-title')).toBeVisible();
    await expect(page.locator('h1')).toBeHidden();
    await expect(sw2(page, 'back')).toBeFocused();
    for (const side of ['front', 'back'] as const) await expect(sw2(page, side)).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('Enter');
    await expect(board(page)).not.toHaveAttribute('data-flipped', /.*/);
    await expect(face(page, 'back')).toHaveAttribute('inert', '');
    await expect(face(page, 'front')).not.toHaveAttribute('inert', /.*/);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('#back-title')).toBeHidden();
    await expect(sw2(page, 'front')).toBeFocused();
    for (const side of ['front', 'back'] as const) await expect(sw2(page, side)).toHaveAttribute('aria-pressed', 'false');
  });

  test('SW2 turns the board to its back face on a tap or a click', async ({ page }) => {
    await open(page);
    await turn(page, 'front');
    await expect(page.locator('#back-title')).toBeVisible();
    await turn(page, 'back');
    await expect(page.locator('h1')).toBeVisible();
  });

  test('under reduced motion the board turns to its back face at once', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await sw2(page, 'front').click();
    const now = await page.evaluate(() => ({
      flipped: document.querySelector('.board')?.hasAttribute('data-flipped'),
      turning: document.querySelector('.board')?.hasAttribute('data-turning'),
      animations: document.getAnimations().length,
    }));
    expect(now).toEqual({ flipped: true, turning: false, animations: 0 });
    await expect(page.locator('#back-title')).toBeVisible();
    await expect(sw2(page, 'back')).toBeFocused();
  });

  for (const viewport of [WIDE, PHONE]) {
    test(`the SW2 of the back face sits where the front one was at ${viewport.width}px`, async ({ page, isMobile }) => {
      if (!isMobile) await page.setViewportSize(viewport);
      await open(page);
      const before = await sw2(page, 'front').boundingBox();
      await turn(page, 'front');
      const after = await sw2(page, 'back').boundingBox();
      if (!before || !after) throw new Error('no box for SW2');
      for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(after[k] - before[k]), k).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const copy of [FR, EN] as Copy[]) {
    for (const viewport of [WIDE, PHONE]) {
      test(`no JS: back face readable after the front (${copy.path}, ${viewport.width}px)`, async ({ page, isMobile }) => {
        if (!isMobile) await page.setViewportSize(viewport);
        await page.goto(copy.path);
        await expect(board(page)).not.toHaveAttribute('data-flip-ready', /.*/);
        // Flat, one face after the other: the back face starts below the front one.
        const [f, b] = await Promise.all([face(page, 'front').boundingBox(), face(page, 'back').boundingBox()]);
        if (!f || !b) throw new Error('no box for a face');
        expect(b.y).toBeGreaterThanOrEqual(f.y + f.height);
        expect(await page.locator('.board__body').evaluate((el) => getComputedStyle(el).transform)).toBe('none');
        // SW2 would do nothing: it is not shown, its slots are kept.
        await expect(page.locator('button.sw2')).toHaveCount(2);
        for (const side of ['front', 'back'] as const) await expect(sw2(page, side)).toBeHidden();
        await expect(page.locator('.board__sw2')).toHaveCount(2);
        const title = page.locator('#back-title');
        await title.scrollIntoViewIfNeeded();
        await expect(title).toBeVisible();
        expect(await title.evaluate((el) => el.textContent?.trim())).toBe(copy.back.title);
        const table = face(page, 'back').locator('table.bom');
        await table.scrollIntoViewIfNeeded();
        await expect(table).toBeVisible();
        expect(await table.locator('caption').evaluate((el) => el.textContent?.trim())).toBe(copy.back.caption);
        // Each row: the reference, the skill, its value and the parts it is linked to (the value cell
        // also prints those links, for a narrow face: read without them).
        const rows = await table.locator('tbody tr').evaluateAll((trs) =>
          trs.map((tr) =>
            [...tr.children].map((c) => {
              const cell = c.cloneNode(true) as Element;
              cell.querySelector('.bom__links')?.remove();
              return cell.textContent?.trim();
            }),
          ),
        );
        expect(rows).toEqual(copy.back.rows);
      });
    }
  }
});

test.describe('no layout shift', () => {
  test('no layout shift when SW2 appears or the board turns', async ({ page, browser, browserName }) => {
    // The prerender, as painted before the app mounts, against the mounted page (as for JP1).
    const boxes = (p: Page) =>
      p.evaluate(() =>
        ['.board__face--front', '.board__header', '.board__jp1', '.board__face--front .board__sw2', '.hero__title', '.disp'].map((s) => {
          const r = (document.querySelector(s) as Element).getBoundingClientRect();
          return `${s} ${r.x.toFixed(1)} ${r.y.toFixed(1)} ${r.width.toFixed(1)} ${r.height.toFixed(1)}`;
        }),
      );
    const viewport = page.viewportSize() ?? { width: 1280, height: 720 };
    const still = await browser.newContext({ javaScriptEnabled: false, viewport, locale: 'fr-FR' });
    const before = await still.newPage();
    await before.goto('/');
    const prerendered = await boxes(before);
    await still.close();

    // Every layout shift of the visit, from the first paint (Chromium reports them).
    await page.addInitScript(() => {
      const w = window as unknown as { shifts: number[] };
      w.shifts = [];
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) w.shifts.push((e as PerformanceEntry & { value: number }).value);
        }).observe({ type: 'layout-shift', buffered: true });
      } catch {
        // No Layout Instability API: the boxes below are the check.
      }
    });
    await open(page);
    expect(await boxes(page)).toEqual(prerendered);
    const [slot, button] = await Promise.all([page.locator('.board__face--front .board__sw2').boundingBox(), sw2(page, 'front').boundingBox()]);
    if (!slot || !button) throw new Error('no box for SW2 or its slot');
    expect(button.x).toBeGreaterThanOrEqual(slot.x - 0.5);
    expect(button.x + button.width).toBeLessThanOrEqual(slot.x + slot.width + 0.5);

    // A turn moves nothing: the board keeps its place and its width, the face that is up starts where
    // the board does, and the edge stays under it. The board is as tall as the face that is up: on the
    // wide board both faces are 16:9; on the flowing board the back face is as tall as its content.
    const faces = () =>
      page.evaluate(() => {
        const board = document.querySelector('.board') as HTMLElement;
        const up = document.querySelector(board.hasAttribute('data-flipped') ? '.board__face--back' : '.board__face--front') as HTMLElement;
        const edge = document.querySelector('.board__edge') as HTMLElement;
        return {
          board: [board.offsetLeft, board.offsetTop, board.offsetWidth],
          face: [up.offsetLeft, up.offsetTop, up.offsetWidth],
          tall: board.offsetHeight - up.offsetHeight,
          edge: [edge.offsetLeft, edge.offsetTop, edge.offsetWidth, edge.offsetHeight - board.offsetHeight],
          height: board.offsetHeight,
        };
      });
    const rest = await faces();
    expect(rest.tall).toBe(0);
    await turn(page, 'front');
    const back = await faces();
    expect({ ...back, height: 0 }).toEqual({ ...rest, height: 0 });
    if (viewport.width >= 1264) expect(back.height).toBe(rest.height);
    await turn(page, 'back');
    expect(await faces()).toEqual(rest);
    await page.waitForTimeout(100);
    if (browserName === 'chromium') {
      expect(await page.evaluate(() => (window as unknown as { shifts: number[] }).shifts)).toEqual([]);
    }
  });
});

test.describe('the back face', () => {
  test('the back face holds its circuit, a part for each skill, and the bill of materials, no image', async ({ page }) => {
    await open(page);
    const back = face(page, 'back');
    await expect(back.locator('.back__circuit > svg.back__copper')).toHaveCount(1);
    await expect(back.locator('.back__circuit button.back-part')).toHaveCount(11);
    await expect(back.locator('path.back-net')).toHaveCount(11);
    await expect(back.locator('table.bom')).toHaveCount(1);
    await expect(back.locator('img')).toHaveCount(0);
  });

  for (const viewport of [{ width: 1264, height: 800 }, WIDE, PHONE, { width: 320, height: 720 }]) {
    test(`back face layout holds at ${viewport.width}x${viewport.height}`, async ({ page, isMobile }) => {
      test.skip(isMobile && viewport.width > PHONE.width, 'the phone sizes only');
      if (!isMobile) await page.setViewportSize(viewport);
      for (const path of [FR.path, EN.path]) {
        await open(page, path);
        await turn(page, 'front');
        expect(await backFaceProblems(page), path).toEqual([]);
        await expect(face(page, 'back').locator('table.bom tbody tr')).toHaveCount(11);
      }
    });
  }

  test('with the back face up, the skip link is gone: it would lead into the inert front face', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no keyboard on touch devices');
    await open(page);
    await expect(page.locator('.skip-link')).toHaveCount(1);
    await sw2(page, 'front').focus();
    await page.keyboard.press('Enter');
    await expect(sw2(page, 'back')).toBeFocused();
    await expect(page.locator('.skip-link')).toBeHidden();
    expect(await page.locator('.skip-link').evaluate((el) => getComputedStyle(el).display)).toBe('none');
    // Backwards from the back SW2, the focus never lands on the link.
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => document.activeElement?.matches('.skip-link') ?? false)).toBe(false);
    // Back on the front face, the link is there again, first in the tab order.
    await sw2(page, 'back').focus();
    await page.keyboard.press('Enter');
    await expect(sw2(page, 'front')).toBeFocused();
    expect(await page.locator('.skip-link').evaluate((el) => getComputedStyle(el).display)).not.toBe('none');
  });
});

/*
 * The back face with the user's text settings: the root font at 125 % and WCAG 1.4.12 text spacing,
 * on the wide board and on a phone, in both languages. These tests inject a stylesheet: the CSP of
 * the page is bypassed for them only.
 */
test.describe('the back face with user text settings', () => {
  test.use({ bypassCSP: true, reducedMotion: 'reduce' });

  const ROOT_125 = 'html { font-size: 125% !important; }';
  const SPACING = `
    * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
    p { margin-bottom: 2em !important; }
  `;
  for (const { label, viewport, css } of [
    { label: 'the root font at 125%', viewport: WIDE, css: ROOT_125 },
    { label: 'text spacing', viewport: { width: 1264, height: 800 }, css: SPACING },
    { label: 'the root font at 125%', viewport: PHONE, css: ROOT_125 },
    { label: 'text spacing', viewport: { width: 375, height: 812 }, css: SPACING },
  ]) {
    test(`back face holds at ${viewport.width}x${viewport.height} with ${label}`, async ({ page, isMobile }) => {
      test.skip(isMobile && viewport.width > PHONE.width, 'the phone sizes only');
      if (!isMobile) await page.setViewportSize(viewport);
      for (const path of [FR.path, EN.path]) {
        await open(page, path);
        await page.addStyleTag({ content: css });
        await turn(page, 'front');
        expect(await backFaceProblems(page), `${path} ${label}`).toEqual([]);
      }
    });
  }
});

/**
 * Problems of the back face: blocks or lines of text out of the face, a block overflowing, the
 * heading running into SW2, the table beside SW2 or out of the width of the header (flowing board)
 * or into the keep-out of the mounting holes (wide board); a part or its reference out of its
 * circuit, under the table, or on another part or reference; horizontal scroll. Empty when it holds.
 */
function backFaceProblems(page: Page): Promise<string[]> {
  return face(page, 'back').evaluate((faceEl) => {
    const out: string[] = [];
    const f = faceEl.getBoundingClientRect();
    const inside = (r: DOMRect) => r.left >= f.left - 0.5 && r.right <= f.right + 0.5 && r.top >= f.top - 0.5 && r.bottom <= f.bottom + 0.5;
    const blocks = [...faceEl.querySelectorAll<HTMLElement>('#back-title, .board__sw2, .back__circuit, table.bom')];
    for (const b of blocks) {
      if (!inside(b.getBoundingClientRect())) out.push(`${b.className || b.id} leaves the face`);
      // The circuit is a window onto the copper of the face: it clips it on purpose.
      if (!b.matches('.back__circuit') && b.scrollWidth > b.clientWidth + 1) out.push(`${b.className || b.id} overflows`);
    }
    // The heading and SW2 never meet; the table starts under them.
    const [title, slot, table] = ['#back-title', '.board__sw2', 'table.bom'].map((s) => faceEl.querySelector(s)?.getBoundingClientRect());
    if (title && slot && title.right > slot.left && title.bottom > slot.top && title.top < slot.bottom) out.push('the heading runs into SW2');
    if (table && slot && table.top < slot.bottom - 0.5) out.push('the table starts beside SW2');
    const header = faceEl.querySelector('.back__header')?.getBoundingClientRect();
    if (table && header && window.innerWidth < 1264) {
      // On the flowing board the table keeps to the width of the header (the content of the face).
      if (table.left < header.left - 0.5 || table.right > header.right + 0.5) out.push('the table leaves the width of the header');
    } else if (table) {
      // On the wide board it stays clear of the mounting holes, in the corners of the face (art 56, 52
      // from each corner): their ring (radius 15) and 0.75rem.
      const u = f.width / 1600;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      for (const [x, y] of [
        [f.left + 56 * u, f.top + 52 * u],
        [f.right - 56 * u, f.top + 52 * u],
        [f.left + 56 * u, f.bottom - 52 * u],
        [f.right - 56 * u, f.bottom - 52 * u],
      ] as const) {
        const dx = Math.max(table.left - x, 0, x - table.right);
        const dy = Math.max(table.top - y, 0, y - table.bottom);
        if (Math.hypot(dx, dy) < 15 * u + 0.75 * rem) out.push(`the table runs into the keep-out of the hole at ${Math.round(x)}, ${Math.round(y)}`);
      }
    }
    // The parts: in their circuit, apart from each other, their references too, none under the table.
    const circuit = faceEl.querySelector('.back__circuit')?.getBoundingClientRect();
    const drawn = [...faceEl.querySelectorAll<HTMLElement>('.back-part')].flatMap((p) => [
      { name: `${p.dataset.ref}`, r: (p.querySelector('svg') as Element).getBoundingClientRect() },
      { name: `${p.dataset.ref} ref`, r: (p.querySelector('.part__ref') as Element).getBoundingClientRect() },
    ]);
    const meet = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
    for (const [i, a] of drawn.entries()) {
      if (circuit && !(a.r.left >= circuit.left - 0.5 && a.r.right <= circuit.right + 0.5 && a.r.top >= circuit.top - 0.5 && a.r.bottom <= circuit.bottom + 0.5)) out.push(`${a.name} leaves the circuit`);
      if (table && meet(a.r, table)) out.push(`${a.name} is under the table`);
      for (const b of drawn.slice(i + 1)) if (meet(a.r, b.r)) out.push(`${a.name} meets ${b.name}`);
    }
    const walker = document.createTreeWalker(faceEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.nodeValue?.trim() || el.closest('.vh') || !el.checkVisibility()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const line of range.getClientRects()) if (!inside(line)) out.push(`"${n.nodeValue.trim().slice(0, 20)}" leaves the face`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth) out.push('horizontal scroll');
    return out;
  });
}

/*
 * Classic scrollbars (Chrome on Windows): headless Chromium hides them, so this test launches its
 * own Chromium that shows them. With JavaScript the faces are stacked from the first paint (the
 * head script sets data-js), so the page never grows a scrollbar before the app mounts: the board
 * lies at the same place before and after. Measured before the app mounts by blocking its script,
 * which also shows that the front face works if the app never mounts.
 */
test.describe('with classic scrollbars', () => {
  test('the wide board does not move when the app mounts, and the page has no vertical scrollbar', async ({ browserName, isMobile }, testInfo) => {
    test.skip(browserName !== 'chromium' || isMobile, 'a desktop Chromium that shows its scrollbars');
    const baseURL = String(testInfo.project.use.baseURL);
    const browser = await chromium.launch({ channel: testInfo.project.use.channel, ignoreDefaultArgs: ['--hide-scrollbars'] });
    try {
      /** The box of the board, the width of a vertical scrollbar, and the state of the page. */
      const measure = (p: Page) =>
        p.evaluate(() => {
          const r = (document.querySelector('.board') as Element).getBoundingClientRect();
          return {
            box: [r.x, r.y, r.width, r.height].map((v) => v.toFixed(1)).join(' '),
            scrollbar: window.innerWidth - document.documentElement.clientWidth,
            js: document.documentElement.hasAttribute('data-js'),
            mounted: (document.querySelector('.board') as Element).hasAttribute('data-flip-ready'),
          };
        });
      for (const viewport of [WIDE, { width: 1440, height: 900 }]) {
        const before = await browser.newContext({ viewport, baseURL, locale: 'fr-FR' });
        // The app script never arrives: the page is the prerender, with the head script run.
        await before.route(/\/assets\/app-[\w-]+\.js$/, (route) => route.abort());
        const still = await before.newPage();
        await still.goto('/');
        const prerendered = await measure(still);
        expect(prerendered.js).toBe(true);
        expect(prerendered.mounted).toBe(false);
        // Without the app the front face is all there is, and its sheets still open (native popovers).
        await expect(still.locator('.board__face--back')).toBeHidden();
        await still.locator('.part__trigger[popovertarget="sheet-r1"]').click();
        await expect(still.locator('#sheet-r1')).toBeVisible();
        await before.close();

        const after = await browser.newContext({ viewport, baseURL, locale: 'fr-FR' });
        const live = await after.newPage();
        await live.goto('/');
        await expect(live.locator('.board__face--front button.sw2')).toBeVisible();
        const mounted = await measure(live);
        await after.close();

        expect(mounted.mounted).toBe(true);
        expect(mounted.box, `${viewport.width}x${viewport.height}`).toBe(prerendered.box);
        expect(prerendered.scrollbar, `${viewport.width}x${viewport.height} before the app`).toBe(0);
        expect(mounted.scrollbar, `${viewport.width}x${viewport.height} mounted`).toBe(0);
      }
    } finally {
      await browser.close();
    }
  });
});
