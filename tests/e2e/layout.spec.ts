import { expect, test, type Locator, type Page } from '@playwright/test';
import { FR } from '../helpers/copy';

// The flowing board (portrait), below 79rem. The wide board has its own tests.

const IDS = [...FR.principles, ...FR.connectors].map((p) => p.id);
const GOLD = 'rgb(201, 164, 92)';
const SILK_DIM = 'rgb(162, 158, 149)';

/** WCAG 1.4.12: line height 1.5, paragraph spacing 2em, letter spacing 0.12em, word spacing 0.16em. */
const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

const trigger = (page: Page, id: string): Locator => page.locator(`.part__trigger[popovertarget="sheet-${id}"]`);

/** Resolves once the element's own transitions and animations are over (none under reduced motion). */
const settled = (locator: Locator): Promise<unknown> =>
  locator.evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));

/**
 * Overlaps between the main blocks, labels cut or out of their trigger, blocks out of the board,
 * blocks whose text overflows them, and horizontal scroll. Empty when the layout holds.
 */
function layoutProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const selectors = ['.board__header', '.hero__title', '.hero__sub', '.disp', '.sw1', '.part__trigger', '.board__footer'];
    const blocks = selectors.flatMap((s) =>
      [...document.querySelectorAll<HTMLElement>(s)].map((el, i) => ({ name: `${s}[${i}]`, el, r: el.getBoundingClientRect() })),
    );
    for (const [i, a] of blocks.entries()) {
      for (const b of blocks.slice(i + 1)) {
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 0.5 && y > 0.5) problems.push(`${a.name} overlaps ${b.name}`);
      }
    }
    const board = document.querySelector('.board')?.getBoundingClientRect();
    if (!board) return ['no board'];
    const inside = (r: DOMRect, box: DOMRect): boolean =>
      r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
    for (const b of blocks) {
      if (!inside(b.r, board)) problems.push(`${b.name} is out of the board`);
      if (b.el.scrollWidth > b.el.clientWidth + 1) problems.push(`${b.name} overflows horizontally`);
    }
    for (const [i, label] of [...document.querySelectorAll<HTMLElement>('.part__label')].entries()) {
      const owner = label.closest('.part__trigger')?.getBoundingClientRect();
      if (label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1) {
        problems.push(`label ${i} is cut`);
      }
      if (!owner || !inside(label.getBoundingClientRect(), owner)) problems.push(`label ${i} leaves its trigger`);
    }
    if (document.documentElement.scrollWidth > window.innerWidth) problems.push('horizontal scroll');
    return problems;
  });
}

test.describe('flowing board', () => {
  test('no horizontal scroll at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    expect(await layoutProblems(page)).toEqual([]);
  });

  test('min text size 12px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const tooSmall = () =>
      page.evaluate(() => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          if (!el || !n.nodeValue?.trim() || el.closest('.vh') || !el.checkVisibility()) continue;
          const size = parseFloat(getComputedStyle(el).fontSize);
          if (size < 12) out.push(`${size}px: ${n.nodeValue.trim()}`);
        }
        return out;
      });
    expect(await tooSmall()).toEqual([]);
    for (const id of IDS) {
      await trigger(page, id).click();
      await expect(page.locator(`#sheet-${id}`)).toBeVisible();
      expect(await tooSmall(), id).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(page.locator(`#sheet-${id}`)).toBeHidden();
    }
  });

  test('avatar renders at 192 css px, pixelated', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const avatar = page.locator('.disp__avatar');
    await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    // Firefox lays out in 1/60 px: 192.00003 is 192.
    expect(await avatar.evaluate((el) => [getComputedStyle(el).width, getComputedStyle(el).height])).toEqual(['192px', '192px']);
    const box = await avatar.boundingBox();
    expect(box?.width).toBeCloseTo(192, 2);
    expect(box?.height).toBeCloseTo(192, 2);
    expect(await avatar.evaluate((el) => getComputedStyle(el).imageRendering)).toBe('pixelated');
    expect(await avatar.evaluate((el) => getComputedStyle(el).filter)).toBe('none');
  });

  test('focus ring visible on every trigger and SW1', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no keyboard on touch devices');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const rings: Record<string, string> = {};
    // Tab through the page; WebKit skips the links, so the loop goes by count, not by position.
    for (let i = 0; i < 16 && Object.keys(rings).length < IDS.length + 1; i++) {
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el?.matches('.part__trigger, .sw1')) return null;
        const s = getComputedStyle(el);
        const offset = parseFloat(s.outlineOffset) + parseFloat(s.outlineWidth);
        const r = el.getBoundingClientRect();
        const ring = { left: r.left - offset, right: r.right + offset, top: r.top - offset, bottom: r.bottom + offset };
        // Nothing may clip the ring: the viewport (horizontally) and any ancestor that clips its overflow.
        let clipped = ring.left < 0 || ring.right > window.innerWidth;
        for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
          const o = getComputedStyle(a);
          if (o.overflowX === 'visible' && o.overflowY === 'visible') continue;
          const box = a.getBoundingClientRect();
          if (ring.left < box.left || ring.right > box.right || ring.top < box.top || ring.bottom > box.bottom) clipped = true;
        }
        const key = el.matches('.sw1') ? 'sw1' : (el.getAttribute('popovertarget') ?? '?');
        const value = [el.matches(':focus-visible'), s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset, clipped].join(' ');
        return { key, value };
      });
      if (ring) rings[ring.key] = ring.value;
    }
    const expected = `true solid 2px ${GOLD} 6px false`;
    expect(rings).toEqual(Object.fromEntries(['sw1', ...IDS.map((id) => `sheet-${id}`)].map((k) => [k, expected])));
  });

  test('forced colors keep parts and focus visible', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium', 'forced colors are emulated in Chromium only');
    test.skip(isMobile, 'no keyboard on touch devices');
    await page.emulateMedia({ forcedColors: 'active' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    // A drawing is visible when hiding it changes the pixels.
    const drawings = [...IDS.map((id) => `#part-${id} .part__body`), '.sw1 svg'];
    for (const selector of drawings) {
      const drawing = page.locator(selector);
      await drawing.scrollIntoViewIfNeeded();
      const box = await drawing.boundingBox();
      if (!box) throw new Error(`no box for ${selector}`);
      // A page clip, not an element screenshot: the latter waits for the element to be visible.
      const shown = await page.screenshot({ clip: box });
      await drawing.evaluate((el) => (el as SVGElement).style.setProperty('visibility', 'hidden'));
      const hidden = await page.screenshot({ clip: box });
      await drawing.evaluate((el) => (el as SVGElement).style.removeProperty('visibility'));
      expect(shown.equals(hidden), `${selector} is invisible in forced colors`).toBe(false);
    }
    // The focus ring is drawn: the pixels around a focused trigger differ from the blurred ones.
    const r1 = trigger(page, 'r1');
    await r1.scrollIntoViewIfNeeded();
    const box = await r1.boundingBox();
    if (!box) throw new Error('no box for r1');
    const clip = { x: Math.max(0, box.x - 10), y: box.y - 10, width: box.width + 20, height: box.height + 20 };
    const blurred = await page.screenshot({ clip });
    await r1.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(r1).toBeFocused();
    expect(await r1.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('solid');
    expect((await page.screenshot({ clip })).equals(blurred)).toBe(false);
  });

  test('long sheet usable at 667x375', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto('/');
    const sheet = page.locator('#sheet-j1');
    await trigger(page, 'j1').click();
    await expect(sheet).toBeVisible();
    await settled(sheet);
    const sheetBox = await sheet.boundingBox();
    expect(sheetBox?.height ?? 999).toBeLessThanOrEqual(375 * 0.8 + 1);
    // Topmost element at the centre of a locator: the locator itself, or one of its children.
    const reachable = (l: Locator) =>
      l.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const inView = r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return inView && !!hit && el.contains(hit);
      });
    const close = sheet.locator('.sheet__close');
    expect(await reachable(close)).toBe(true);
    const link = sheet.locator('.sheet__link');
    await link.scrollIntoViewIfNeeded();
    expect(await reachable(link)).toBe(true);
    // Fermer stays in view once the sheet is scrolled.
    expect(await sheet.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    expect(await reachable(close)).toBe(true);
  });

  test('pcb marks are readable but discreet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const marks = await page.evaluate(() => {
      const channel = (c: number) => {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      const rgb = (css: string) => (css.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = ([r = 0, g = 0, b = 0]: number[]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      /** The first opaque background colour behind an element. */
      const backdrop = (el: Element | null): number[] => {
        for (let a = el; a; a = a.parentElement) {
          const c = rgb(getComputedStyle(a).backgroundColor);
          if (c.length === 3 || c[3] === 1) return c.slice(0, 3);
        }
        return [255, 255, 255];
      };
      const board = document.querySelector('.board')?.getBoundingClientRect();
      return [...document.querySelectorAll('.pcb-marks > li > [aria-hidden="true"]')].map((el) => {
        const s = getComputedStyle(el);
        const [hi, lo] = [luminance(rgb(s.color)), luminance(backdrop(el))].sort((a, b) => b - a);
        return {
          text: el.textContent,
          contrast: ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05),
          size: parseFloat(s.fontSize),
          color: s.color,
          inFooter: !!el.closest('footer.board__footer'),
          fromBottom: (board?.bottom ?? 0) - el.getBoundingClientRect().bottom,
        };
      });
    });
    expect(marks.map((m) => m.text)).toEqual(FR.marks.map((m) => m.visible));
    for (const m of marks) {
      expect(m.contrast, m.text ?? '').toBeGreaterThanOrEqual(4.5);
      // Readable, but the smallest silkscreen of the board, in the dim silkscreen colour, near the edge.
      expect(m.size).toBeGreaterThanOrEqual(12);
      expect(m.size).toBeLessThanOrEqual(13);
      expect(m.color).toBe(SILK_DIM);
      expect(m.inFooter).toBe(true);
      expect(m.fromBottom).toBeLessThanOrEqual(48);
    }
    // The footer is the only container of the marks.
    const elsewhere = await page.evaluate((texts) => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (texts.some((t) => n.nodeValue?.includes(t)) && !n.parentElement?.closest('.board__footer .pcb-marks')) out.push(n.nodeValue ?? '');
      }
      return out;
    }, FR.marks.map((m) => m.visible));
    expect(elsewhere).toEqual([]);
    await expect(page.locator('.pcb-marks')).toHaveCount(1);
  });
});

test.describe('flowing board with user text settings', () => {
  // These tests inject a stylesheet: the CSP of the page is bypassed for them only.
  test.use({ bypassCSP: true });

  test('no overlap or clipping with text spacing', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.addStyleTag({ content: TEXT_SPACING });
    expect(await layoutProblems(page)).toEqual([]);
  });

  test('root font 125%', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.addStyleTag({ content: 'html { font-size: 125% !important; }' });
    expect(await layoutProblems(page)).toEqual([]);
    // The avatar keeps its exact size: it is drawn in CSS pixels, not in rem.
    expect((await page.locator('.disp__avatar').boundingBox())?.width).toBeCloseTo(192, 2);
  });
});
