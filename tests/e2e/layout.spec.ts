import { expect, test, type Locator, type Page } from '@playwright/test';
import { FR } from '../helpers/copy';

// The flowing board (portrait), below 79rem. The wide board has its own tests.

const IDS = [...FR.principles, ...FR.connectors].map((p) => p.id);
const GOLD = 'rgb(201, 164, 92)';
/** The dim silkscreen of each board: green (light scheme, the default) and black (dark scheme). */
const SILK_DIM = { light: 'rgb(179, 184, 166)', dark: 'rgb(162, 158, 149)' } as const;

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

  test('forced colors keep the board outline, a lit SW1 and no dangling trace', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium', 'forced colors are emulated in Chromium only');
    test.skip(isMobile, 'hover needs a mouse');
    await page.emulateMedia({ forcedColors: 'active' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const outline = await page.locator('.board').evaluate((el) => `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).outlineWidth}`);
    expect(outline).toBe('solid 1px');
    // The buses are not drawn in forced colours: the fan-out of U2 is not drawn either.
    expect(await page.locator('#part-chip .pcb-wire').evaluate((el) => getComputedStyle(el).stroke)).toBe('none');
    await page.locator('.sw1').hover();
    expect(await page.locator('.sw1').evaluate((el) => getComputedStyle(el).getPropertyValue('--pad').trim())).toBe('Highlight');
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

  for (const scheme of ['light', 'dark'] as const) {
    test(`pcb marks are readable but discreet (${scheme} scheme)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      for (const width of [390, 768]) {
        await page.setViewportSize({ width, height: 844 });
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
          const boardEl = document.querySelector('.board') as HTMLElement;
          const board = boardEl.getBoundingClientRect();
          // The mounting holes: centred --hole-at from the corner, a plated ring of radius --ring (in rem).
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
          const length = (name: string) => parseFloat(getComputedStyle(boardEl).getPropertyValue(name)) * rem;
          const [at, ring] = [length('--hole-at'), length('--ring')];
          const holes = [
            { x: board.left + at, y: board.bottom - at },
            { x: board.right - at, y: board.bottom - at },
          ];
          return [...document.querySelectorAll('.pcb-marks > li > [aria-hidden="true"]')].map((el) => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            const [hi, lo] = [luminance(rgb(s.color)), luminance(backdrop(el))].sort((a, b) => b - a);
            // Distance from the edge of the nearest ring to the nearest point of the mark.
            const clearance = Math.min(
              ...holes.map((h) => Math.hypot(Math.max(r.left - h.x, 0, h.x - r.right), Math.max(r.top - h.y, 0, h.y - r.bottom)) - ring),
            );
            return {
              text: el.textContent,
              contrast: ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05),
              size: parseFloat(s.fontSize),
              color: s.color,
              frame: `${s.borderTopWidth} ${s.borderTopStyle}`,
              inFooter: !!el.closest('footer.board__footer'),
              fromBottom: board.bottom - r.bottom,
              clearance: clearance / rem,
            };
          });
        });
        expect(marks.map((m) => m.text)).toEqual(FR.marks.map((m) => m.visible));
        for (const m of marks) {
          const what = `${m.text} at ${width}px`;
          expect(m.contrast, what).toBeGreaterThanOrEqual(4.5);
          // Readable, but the smallest silkscreen of the board, in the dim silkscreen colour, near the edge.
          expect(m.size, what).toBeGreaterThanOrEqual(12);
          expect(m.size, what).toBeLessThanOrEqual(13);
          expect(m.color, what).toBe(SILK_DIM[scheme]);
          expect(m.inFooter, what).toBe(true);
          expect(m.fromBottom, what).toBeLessThanOrEqual(48);
          // A keep-out of at least 0.75rem around the mounting holes, as on a real board.
          expect(m.clearance, what).toBeGreaterThanOrEqual(0.75);
        }
        // Only the conformity mark keeps a frame; the other two are bare silkscreen, like a lot number.
        expect(marks.map((m) => m.frame)).toEqual(['1px solid', '0px none', '0px none']);
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
  }

  for (const width of [390, 768]) {
    test(`every part on one text column at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      // Offset of the reference and of the label from the left edge of their own trigger.
      const offsets = await page.evaluate(() =>
        [...document.querySelectorAll('.part__trigger')].map((t) => {
          const left = t.getBoundingClientRect().left;
          const at = (s: string) => ((t.querySelector(s) as Element).getBoundingClientRect().left - left).toFixed(2);
          return `${at('.part__ref')} ${at('.part__label')}`;
        }),
      );
      expect(new Set(offsets).size, offsets.join(' | ')).toBe(1);
    });
  }

  test('from 46rem each bus carries its parts in DOM order, top to bottom', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    const lists = await page.evaluate(() =>
      [...document.querySelectorAll('.parts__list')].map((list) => {
        const parts = [...list.querySelectorAll(':scope > .part')].map((p) => {
          const r = (p.querySelector('.part__ref') as Element).getBoundingClientRect();
          return { id: p.id, x: Math.round(r.left), y: r.top };
        });
        const columns = [...new Set(parts.map((p) => p.x))].sort((a, b) => a - b);
        // Reading down the first bus, then down the second one.
        const read = [...parts].sort((a, b) => columns.indexOf(a.x) - columns.indexOf(b.x) || a.y - b.y).map((p) => p.id);
        return { dom: parts.map((p) => p.id), read, perColumn: columns.map((x) => parts.filter((p) => p.x === x).length) };
      }),
    );
    expect(lists).toEqual([
      {
        dom: ['part-r1', 'part-c1', 'part-led1', 'part-d1', 'part-u2'],
        read: ['part-r1', 'part-c1', 'part-led1', 'part-d1', 'part-u2'],
        perColumn: [3, 2],
      },
      { dom: ['part-j1', 'part-j2', 'part-j3'], read: ['part-j1', 'part-j2', 'part-j3'], perColumn: [2, 1] },
    ]);
  });

  test('from 46rem a glint runs down both buses', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    const glints = await page.evaluate(() =>
      [...document.querySelectorAll('.parts__list')].map((list) =>
        ['::after', '::before'].map((p) => getComputedStyle(list, p).animationName).join(' '),
      ),
    );
    expect(glints).toEqual(['bus-glint bus-glint', 'bus-glint bus-glint']);
  });

  test('at 768px a trace runs from DISP1 into the top via of the principles bus', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    const geometry = await page.evaluate(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const heading = document.querySelector('.disp + .parts .silk-heading') as Element;
      const h = heading.getBoundingClientRect();
      const s = getComputedStyle(heading, '::before');
      const trace = { left: h.left + parseFloat(s.left), top: h.top + parseFloat(s.top), width: parseFloat(s.width), height: parseFloat(s.height) };
      const disp = (document.querySelector('.disp') as Element).getBoundingClientRect();
      const list = (document.querySelector('.disp + .parts .parts__list') as Element).getBoundingClientRect();
      // The second bus and its top via are centred at 50% + (bus + gap) / 2 - 1px of the list.
      const bus = { x: list.left + list.width / 2 + 1.5 * rem - 1, y: list.top + 0.25 * rem + 1 };
      return {
        content: s.content,
        lineOnBus: Math.abs(trace.left + 1 - bus.x),
        endsInVia: Math.abs(trace.top + trace.height - bus.y),
        // It comes from under the module: its end is hidden by DISP1, at most 1rem in.
        underModule: trace.left + trace.width - disp.left,
        // It leaves the module below its top and above its caption row.
        fromModule: trace.top > disp.top && trace.top < disp.bottom - 3.5 * rem,
      };
    });
    expect(geometry.content).toBe('""');
    expect(geometry.lineOnBus).toBeLessThanOrEqual(1);
    expect(geometry.endsInVia).toBeLessThanOrEqual(1);
    expect(geometry.underModule).toBeGreaterThan(0);
    expect(geometry.underModule).toBeLessThanOrEqual(16.5);
    expect(geometry.fromModule).toBe(true);
    expect(await layoutProblems(page)).toEqual([]);
  });

  test('a pressed part or switch shows it at once', async ({ page, isMobile }) => {
    test.skip(isMobile, 'pointer presses are checked with a mouse');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const pressed = async (selector: string, read: (el: Element) => string) => {
      const target = page.locator(selector).first();
      await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox();
      if (!box) throw new Error(`no box for ${selector}`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      const up = await target.evaluate(read);
      await page.mouse.down();
      const down = await target.evaluate(read);
      await page.mouse.up();
      return { up, down };
    };
    const sw1 = await pressed('.sw1', (el) => getComputedStyle(el.querySelector('svg') as Element).scale);
    expect(sw1.down).not.toBe(sw1.up);
    const r1 = await pressed('#part-r1 .part__trigger', (el) => getComputedStyle(el.querySelector('.part__body') as Element).scale);
    expect(r1.down).not.toBe(r1.up);
  });

  test('Close is a silkscreen button zone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await trigger(page, 'r1').click();
    const zone = page.locator('#sheet-r1 .sheet__close .sheet__close-zone');
    await expect(zone).toHaveText(FR.close);
    // The same frame as the FR / EN zones.
    const frame = await zone.evaluate((el) => {
      const s = getComputedStyle(el);
      return `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderRadius}`;
    });
    const langFrame = await page.locator('.lang__link').first().evaluate((el) => {
      const s = getComputedStyle(el, '::before');
      return `${s.borderTopWidth} ${s.borderTopStyle} ${s.borderRadius}`;
    });
    expect(frame).toBe(langFrame);
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
    // The LED glow stays centred on the lens: the sprite scales with the root font, and so does the glow.
    const drift = await page.locator('#part-led1 .part__trigger').evaluate((el) => {
      const body = el.querySelector('.part__body') as Element;
      const b = body.getBoundingClientRect();
      const pad = parseFloat(getComputedStyle(body).paddingLeft);
      // The lens spans x = 12 to 34 of the 64-unit symbol, drawn over the content box of the svg.
      const lens = b.left + pad + (23 / 64) * (b.width - pad);
      const glow = getComputedStyle(el, '::after');
      return Math.abs(el.getBoundingClientRect().left + parseFloat(glow.left) + parseFloat(glow.width) / 2 - lens);
    });
    expect(drift).toBeLessThanOrEqual(0.5);
  });
});
