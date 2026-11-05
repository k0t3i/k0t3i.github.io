import { expect, test, type Locator, type Page } from '@playwright/test';
import { EN, FR } from '../helpers/copy';
import { boxStill, tiltStill } from '../helpers/still';
import { FRONT_PADS } from '../../src/circuit/layout';

// The flowing board (portrait), below 79rem, then the wide board (79rem and up).

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

/**
 * WebKit with the settings of a phone: Playwright's WebKit then stops responding after several
 * sheets opened in a row on the wide board, with motion on (the fixme « ten sheets in a row »). The
 * tests that open many sheets give it a fresh page for each; the other engines open them in a row.
 */
const phoneWebKit = ({ browserName, isMobile }: { browserName: string; isMobile: boolean }): boolean => browserName === 'webkit' && isMobile;

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
    for (let i = 0; i < 20 && Object.keys(rings).length < IDS.length + 1; i++) {
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
    // The outline of the board is drawn by its face (the side of the board that is up).
    const outline = await page.locator('.board__face--front').evaluate((el) => `${getComputedStyle(el).outlineStyle} ${getComputedStyle(el).outlineWidth}`);
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
        // Only the verified marks (a11y AA, LH 100) keep a frame; the others are bare silkscreen, like a lot number.
        expect(marks.map((m) => m.frame)).toEqual(FR.marks.map((m) => (m.framed ? '1px solid' : '0px none')));
      }
      // The footer is the only container of the marks.
      const elsewhere = await page.evaluate((texts) => {
        const out: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          // As words: « IA » is in « ARIA ».
          const has = (t: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${t}($|[^\\p{L}\\p{N}])`, 'u').test(n.nodeValue ?? '');
          if (texts.some(has) && !n.parentElement?.closest('.board__footer .pcb-marks')) out.push(n.nodeValue ?? '');
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

  test('from 46rem the principles run down one bus beside DISP1, the connectors down two, in DOM order', async ({ page }) => {
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
        perColumn: [5],
      },
      {
        dom: ['part-j1', 'part-j2', 'part-j3', 'part-j4', 'part-j5'],
        read: ['part-j1', 'part-j2', 'part-j3', 'part-j4', 'part-j5'],
        perColumn: [3, 2],
      },
    ]);
  });

  // Anthony's decision of 04/11/2026 (spec 4.10, « Bus de la carte en flux »): no common line links the
  // parts any more; each has its own short trace to its own via, and the ambient glints run on them.
  for (const width of [390, 768]) {
    test(`on the flowing board each part has its own via and trace, and a glint runs on each, down the column in turn, at ${width}px`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      // The ambient glints, at rest: the power-on has already played in this session.
      await page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));
      await page.setViewportSize({ width, height: 1024 });
      await page.goto('/');
      const lists = await page.evaluate(() =>
        [...document.querySelectorAll('.parts__list')].map((list) => ({
          line: getComputedStyle(list).backgroundImage,
          listGlints: ['::before', '::after'].map((p) => getComputedStyle(list, p)).map((g) => (g.display === 'none' || g.content === 'none' ? 'none' : 'drawn')),
          parts: [...list.querySelectorAll<HTMLElement>(':scope > .part')].map((p) => {
            const via = getComputedStyle(p, '::before');
            const glint = getComputedStyle(p, '::after');
            const r = (p.querySelector('.part__ref') as Element).getBoundingClientRect();
            return {
              id: p.id,
              via: via.display !== 'none' && via.backgroundImage.includes('radial-gradient'),
              trace: getComputedStyle(p.querySelector('.part__body') as Element).backgroundImage.includes('linear-gradient'),
              glint: glint.display === 'none' ? 'none' : glint.animationName,
              delay: Number.parseFloat(glint.animationDelay),
              x: Math.round(r.left),
              y: r.top,
            };
          }),
        })),
      );
      for (const l of lists) {
        expect(l.line).toBe('none');
        expect(l.listGlints).toEqual(['none', 'none']);
        for (const p of l.parts) expect([p.id, p.via, p.trace, p.glint]).toEqual([p.id, true, true, 'trace-glint']);
        // Down each column, in reading order, each glint a little after the one above it.
        for (const x of new Set(l.parts.map((p) => p.x))) {
          const column = l.parts.filter((p) => p.x === x).sort((a, b) => a.y - b.y);
          for (const [k, p] of column.entries()) if (k) expect(p.delay, p.id).toBeGreaterThan(column[k - 1]?.delay ?? 0);
        }
      }
      // The connectors after the principles, as their bus followed it.
      expect(Math.min(...(lists[1]?.parts ?? []).map((p) => p.delay))).toBeGreaterThan(Math.min(...(lists[0]?.parts ?? []).map((p) => p.delay)));
    });
  }

  for (const scheme of ['light', 'dark'] as const) {
    for (const width of [768, 1024]) {
      test(`at ${width}px DISP1 sits beside the principles, and no trace leaves its header: it is wired from the back (${scheme})`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme });
        await page.setViewportSize({ width, height: 1024 });
        await page.goto('/');
        const geometry = await page.evaluate(() => {
          const disp = document.querySelector('.disp') as Element;
          return {
            trace: getComputedStyle(disp, '::after').content,
            // DISP1 and the principles share the top of their row: no void between the subtitle and them.
            sameTop: Math.abs(disp.getBoundingClientRect().top - (document.querySelector('.disp + .parts') as Element).getBoundingClientRect().top),
          };
        });
        expect(geometry.trace).toBe('none');
        expect(geometry.sameTop).toBeLessThanOrEqual(0.5);
        expect(await layoutProblems(page)).toEqual([]);
      });
    }
  }

  test('at 768px the principles fill the side of DISP1: no large void', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    const sizes = await page.evaluate(() => {
      const box = (s: string) => (document.querySelector(s) as Element).getBoundingClientRect();
      const [sub, disp, principles] = [box('.hero__sub'), box('.disp'), box('.disp + .parts')];
      return {
        // Empty height left under the shorter of the two, beside the taller one.
        beside: Math.abs(disp.bottom - principles.bottom),
        principlesBesideDisp: principles.left > disp.right && Math.abs(principles.top - disp.top) < 1,
        subAbove: sub.bottom <= disp.top,
      };
    });
    expect(sizes.principlesBesideDisp).toBe(true);
    expect(sizes.subAbove).toBe(true);
    // DISP1 and the principles differ by less than the height of two parts.
    expect(sizes.beside).toBeLessThanOrEqual(160);
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

/*
 * The wide board, 79rem and up: a 16:9 board whose blocks are placed in the 1600 x 900 units of its
 * art (board-wide.svg), so the copper of the art lands on the pads drawn by the page.
 */

/** Mounting holes of the art: centres in art units, and the radius of their plated ring. */
const HOLES = [
  [56, 52],
  [1544, 52],
  [56, 848],
  [1544, 848],
] as const;
const HOLE_RING = 15;

/**
 * Problems of the wide board: blocks that overlap, leave the board, overflow sideways or enter the
 * keep-out of a mounting hole (its ring plus 0.75rem); labels cut or out of their part; a line of
 * text that leaves the board, runs into another block or is printed over a trace of the art;
 * horizontal scroll. Empty when the layout holds.
 */
function wideProblems(page: Page): Promise<string[]> {
  return page.evaluate(
    async ({ holes, ring }) => {
      const problems: string[] = [];
      const boardEl = document.querySelector('.board') as HTMLElement;
      const board = boardEl.getBoundingClientRect();
      // The front face holds the blocks and the art; the back face is checked by depth.spec.ts.
      const front = boardEl.querySelector('.board__face--front') as HTMLElement;
      const u = board.width / 1600;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const selectors = [
        '.board__header',
        '.hero__title',
        '.hero__sub',
        '.disp',
        '.sw1',
        '.silk-heading',
        '.part__trigger',
        '.uptime',
        '.pcb-marks',
        // The test keypad (spec 4.11): its box is its slot right of the title, so the title never meets it.
        '.keypad',
      ];
      const blocks = selectors.flatMap((s) =>
        [...front.querySelectorAll<HTMLElement>(s)].map((el, i) => ({ name: `${s}[${i}]`, el, r: el.getBoundingClientRect() })),
      );
      for (const [i, a] of blocks.entries()) {
        for (const b of blocks.slice(i + 1)) {
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (x > 0.5 && y > 0.5) problems.push(`${a.name} overlaps ${b.name}`);
        }
      }
      const inside = (r: DOMRect, box: DOMRect): boolean =>
        r.left >= box.left - 0.5 && r.right <= box.right + 0.5 && r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
      for (const b of blocks) {
        if (!inside(b.r, board)) problems.push(`${b.name} is out of the board`);
        if (b.el.scrollWidth > b.el.clientWidth + 1) problems.push(`${b.name} overflows horizontally`);
        for (const [hx, hy] of holes) {
          const cx = board.left + hx * u;
          const cy = board.top + hy * u;
          const gap = Math.hypot(Math.max(b.r.left - cx, 0, cx - b.r.right), Math.max(b.r.top - cy, 0, cy - b.r.bottom)) - ring * u;
          if (gap < 0.75 * rem) problems.push(`${b.name} is in the keep-out of the hole at ${hx},${hy}`);
        }
      }
      for (const [i, label] of [...document.querySelectorAll<HTMLElement>('.part__label')].entries()) {
        const owner = label.closest('.part__trigger')?.getBoundingClientRect();
        if (label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1) problems.push(`label ${i} is cut`);
        if (!owner || !inside(label.getBoundingClientRect(), owner)) problems.push(`label ${i} leaves its trigger`);
      }

      // The copper of the art: every trace, as segments in page pixels, widened by half its stroke and 1px.
      const url = getComputedStyle(front).backgroundImage.match(/url\("?([^")]*board-wide[^")]*)"?\)/)?.[1];
      if (!url) return [...problems, 'the board has no art'];
      const art = new DOMParser().parseFromString(await (await fetch(url)).text(), 'image/svg+xml');
      const segments: { a: number[]; b: number[]; half: number }[] = [];
      for (const path of art.querySelectorAll('g[stroke] path')) {
        const half = (parseFloat(path.getAttribute('stroke-width') ?? '1') / 2) * u + 1;
        let at = [0, 0];
        let user = [0, 0];
        for (const [, cmd = '', args = ''] of (path.getAttribute('d') ?? '').matchAll(/([MHVL])([^MHVL]*)/g)) {
          const n = args.trim().split(/[\s,]+/).map(Number);
          user = cmd === 'H' ? [n[0] ?? 0, user[1] ?? 0] : cmd === 'V' ? [user[0] ?? 0, n[0] ?? 0] : [n[0] ?? 0, n[1] ?? 0];
          const px = [board.left + (user[0] ?? 0) * u, board.top + (user[1] ?? 0) * u];
          if (cmd !== 'M') segments.push({ a: at, b: px, half });
          at = px;
        }
      }
      if (segments.length < 20) problems.push(`only ${segments.length} segments of copper in the art`);
      // Lines of text printed on the board itself (DISP1 covers the art under its own labels).
      const walker = document.createTreeWalker(front, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !n.nodeValue?.trim() || el.closest('.vh, .sheet, .disp__pins, .disp__screen') || !el.checkVisibility()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const line of range.getClientRects()) {
          // A line of text stays on the board, and clear of every block it does not belong to.
          if (!inside(line, board)) problems.push(`"${n.nodeValue.trim().slice(0, 24)}" leaves the board`);
          for (const b of blocks) {
            if (b.el.contains(el)) continue;
            const x = Math.min(line.right, b.r.right) - Math.max(line.left, b.r.left);
            const y = Math.min(line.bottom, b.r.bottom) - Math.max(line.top, b.r.top);
            if (x > 0.5 && y > 0.5) problems.push(`"${n.nodeValue.trim().slice(0, 24)}" runs into ${b.name}`);
          }
          const hit = segments.some(({ a, b, half }) => {
            const [ax = 0, ay = 0] = a;
            const [bx = 0, by = 0] = b;
            const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
            for (let s = 0; s <= steps; s++) {
              const x = ax + ((bx - ax) * s) / steps;
              const y = ay + ((by - ay) * s) / steps;
              if (x > line.left - half && x < line.right + half && y > line.top - half && y < line.bottom + half) return true;
            }
            return false;
          });
          if (hit) problems.push(`"${n.nodeValue.trim().slice(0, 24)}" is printed over a trace`);
        }
      }
      if (document.documentElement.scrollWidth > window.innerWidth) problems.push('horizontal scroll');
      return problems;
    },
    { holes: HOLES, ring: HOLE_RING },
  );
}

/**
 * Where each live trace of the wide board starts and ends: `<part> <from a via of the art, or from
 * another part, or from a part drawn by the art> <into the drawing of its part>`. A route runs the way its current flows: from the via
 * where its signal comes up from the back (from R1 for LED1) to the part, and out of J5 for its power.
 */
/** The pads of the parts the art draws, where a route may start (FB1, which takes the 5 V out of J5, spec 4.11). */
const ART_PADS = FRONT_PADS.filter((p) => p.ref === 'FB1').map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h }));

function traceEnds(page: Page): Promise<string[]> {
  return page.evaluate(async (artPads) => {
    type Box = { left: number; right: number; top: number; bottom: number };
    const boardEl = document.querySelector('.board') as HTMLElement;
    const board = boardEl.getBoundingClientRect();
    const u = board.width / 1600;
    // The drawing of a part, give or take half a pad (3 units): the contacts of J3 and J5 are under their shell.
    const drawn = (id: string): Box => {
      const r = (document.querySelector(`#part-${id} .part__body`) as Element).getBoundingClientRect();
      return { left: r.left - 3 * u, right: r.right + 3 * u, top: r.top - 3 * u, bottom: r.bottom + 3 * u };
    };
    const within = (p: DOMPoint, b: Box) => p.x >= b.left && p.x <= b.right && p.y >= b.top && p.y <= b.bottom;
    // The vias of the art (board-wide.svg), in page pixels, with their radius.
    const url = getComputedStyle(boardEl.querySelector('.board__face--front') as Element).backgroundImage.match(/url\("?([^")]*board-wide[^")]*)"?\)/)?.[1] ?? '';
    const art = new DOMParser().parseFromString(await (await fetch(url)).text(), 'image/svg+xml');
    const radius = (id: string) => parseFloat(art.querySelector(`${id} circle`)?.getAttribute('r') ?? '0');
    const vias = [...art.querySelectorAll('use[href="#v"], use[href="#b"]')].map((v) => ({
      x: board.left + parseFloat(v.getAttribute('x') ?? '0') * u,
      y: board.top + parseFloat(v.getAttribute('y') ?? '0') * u,
      r: radius(v.getAttribute('href') ?? '') * u + 0.5,
    }));
    const ids = [...document.querySelectorAll<SVGPathElement>('path.trace-live')].map((p) => p.dataset.part ?? '');
    return [...document.querySelectorAll<SVGPathElement>('path.trace-live')].map((path) => {
      const points: number[][] = [];
      for (const [, cmd, args = ''] of (path.getAttribute('d') ?? '').matchAll(/([MHVL])([^MHVL]*)/g)) {
        const n = args.trim().split(/\s+/).map(Number);
        const [lx = 0, ly = 0] = points.at(-1) ?? [];
        points.push(cmd === 'H' ? [n[0] ?? 0, ly] : cmd === 'V' ? [lx, n[0] ?? 0] : [n[0] ?? 0, n[1] ?? 0]);
      }
      const m = path.getScreenCTM() as DOMMatrix;
      const [start, end] = [points[0], points.at(-1)].map((p) => new DOMPoint(p?.[0], p?.[1]).matrixTransform(m)) as [DOMPoint, DOMPoint];
      const id = path.dataset.part ?? '';
      // J5 is the source of its route: the power flows out of it.
      const [source, part] = id === 'j5' ? [end, start] : [start, end];
      const fromVia = vias.some((v) => Math.hypot(source.x - v.x, source.y - v.y) <= v.r);
      const fromPart = ids.some((other) => other !== id && within(source, drawn(other)));
      const fromArt = artPads.some((q) => within(source, { left: board.left + (q.x - q.w / 2) * u, right: board.left + (q.x + q.w / 2) * u, top: board.top + (q.y - q.h / 2) * u, bottom: board.top + (q.y + q.h / 2) * u }));
      return `${id} ${fromVia || fromPart || fromArt} ${within(part, drawn(id))}`;
    });
  }, ART_PADS);
}

/**
 * Problems of the right column of the wide board: the connectors, under their heading, in DOM order,
 * each on one row (its reference, then its name on the same line), within the width of DISP1 above
 * them, one row clear of the next, each a target of 24 x 24 px at least (WCAG 2.5.8: a row is
 * exactly 24px high at 1264px), and all of them above the footer. Empty when it holds.
 */
function connectorColumn(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const problems: string[] = [];
    const box = (el: Element | null): DOMRect => (el as Element).getBoundingClientRect();
    const disp = box(document.querySelector('.disp'));
    const section = document.querySelector('.parts + .parts') as Element;
    const heading = box(section.querySelector('.silk-heading'));
    const footer = box(document.querySelector('.board__footer'));
    const parts = [...section.querySelectorAll('.part')];
    if (parts.length !== 5) problems.push(`${parts.length} connectors`);
    let above = heading.bottom;
    for (const part of parts) {
      const t = box(part.querySelector('.part__trigger'));
      const ref = box(part.querySelector('.part__ref'));
      const label = part.querySelector('.part__label') as Element;
      const name = box(label);
      if (t.left < disp.left - 0.5 || t.right > disp.right + 0.5) problems.push(`${part.id} leaves the column of DISP1`);
      if (t.width < 24 || t.height < 24) problems.push(`${part.id}: a target of ${t.width} x ${t.height} px, under 24 x 24`);
      if (t.top < above - 0.5) problems.push(`${part.id} runs into what is above it (${t.top} < ${above})`);
      above = t.bottom;
      const range = document.createRange();
      range.selectNodeContents(label);
      // Its lines, by their top (WebKit splits a line at a word space when the word spacing is set).
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      if (lines !== 1) problems.push(`${part.id}: its name takes ${lines} lines`);
      if (name.left < ref.right || Math.abs(ref.top + ref.bottom - name.top - name.bottom) / 2 > 2) {
        problems.push(`${part.id}: its reference and its name are not on one line`);
      }
    }
    if (above > footer.top + 0.5) problems.push(`the connectors run into the footer (${above} > ${footer.top})`);
    return problems;
  });
}

test.describe('wide board', () => {
  for (const viewport of [
    { width: 1264, height: 800 },
    { width: 1600, height: 900 },
  ]) {
    test(`no overlap or clipping on the wide board at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const path of [FR.path, EN.path]) {
        await page.goto(path);
        await expect(page.locator('.board__signal')).toBeVisible();
        expect(await wideProblems(page), path).toEqual([]);
      }
    });
  }

  for (const width of [1264, 1440, 1600, 1920]) {
    test(`wide board keeps 16:9 and fits the viewport width at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      const box = await page.evaluate(() => {
        const r = (document.querySelector('.board') as Element).getBoundingClientRect();
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return {
          width: r.width,
          height: r.height,
          expected: Math.min(window.innerWidth - 4 * rem, 96 * rem),
          left: r.left,
          right: document.documentElement.clientWidth - r.right,
          scroll: document.documentElement.scrollWidth - window.innerWidth,
        };
      });
      expect(box.width).toBeCloseTo(box.expected, 0);
      expect(box.height).toBeCloseTo((box.width * 9) / 16, 0);
      // Centred, inside the viewport, no horizontal scroll.
      expect(Math.abs(box.left - box.right)).toBeLessThanOrEqual(1);
      expect(box.left).toBeGreaterThan(0);
      expect(box.scroll).toBeLessThanOrEqual(0);
    });
  }

  test('the traces and vias of the flowing board, their glints and the stubs are off', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');
    const drawn = await page.evaluate(() => {
      const lists = [...document.querySelectorAll('.parts__list')];
      return {
        buses: lists.map((l) => getComputedStyle(l).backgroundImage),
        // A pseudo-element is drawn when it has content and is displayed.
        glints: [...lists, ...document.querySelectorAll('.part')].flatMap((l) =>
          ['::before', '::after'].map((p) => getComputedStyle(l, p)).map((g) => (g.display === 'none' || g.content === 'none' ? 'none' : 'drawn')),
        ),
        stubs: [...new Set([...document.querySelectorAll('.part__body')].map((b) => getComputedStyle(b).backgroundImage))],
        layer: getComputedStyle(document.querySelector('.board__signal') as Element).display,
      };
    });
    expect(drawn).toEqual({ buses: ['none', 'none'], glints: Array.from({ length: 24 }, () => 'none'), stubs: ['none'], layer: 'block' });
  });

  for (const width of [1264, 1600]) {
    test(`every live trace runs from its via to its part at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      expect(await traceEnds(page)).toEqual(IDS.map((id) => `${id} true true`));
    });
  }

  for (const viewport of [
    { width: 1264, height: 800 },
    { width: 1600, height: 900 },
  ]) {
    test(`the five connectors stand in the right column, one a row, above the footer, at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      for (const path of [FR.path, EN.path]) {
        await page.goto(path);
        expect(await connectorColumn(page), path).toEqual([]);
      }
    });
  }

  test('the pads of DISP1 in the art sit under the pads drawn by the module', async ({ page }) => {
    for (const width of [1264, 1920]) {
      await page.setViewportSize({ width, height: 1080 });
      await page.goto('/');
      const offsets = await page.evaluate(async () => {
        const boardEl = document.querySelector('.board') as HTMLElement;
        const board = boardEl.getBoundingClientRect();
        const u = board.width / 1600;
        const url = getComputedStyle(boardEl.querySelector('.board__face--front') as Element).backgroundImage.match(/url\("?([^")]*board-wide[^")]*)"?\)/)?.[1] ?? '';
        const art = new DOMParser().parseFromString(await (await fetch(url)).text(), 'image/svg+xml');
        // The drills of the header footprint, left to right.
        const drills = [...art.querySelectorAll('#disp1-pads circle[r="3"]')].map((c) => [
          board.left + parseFloat(c.getAttribute('cx') ?? '0') * u,
          board.top + parseFloat(c.getAttribute('cy') ?? '0') * u,
        ]);
        const pads = [...document.querySelectorAll('.disp__pin')].map((pin) => {
          const r = pin.getBoundingClientRect();
          const h = parseFloat(getComputedStyle(pin, '::before').height);
          return [r.left + r.width / 2, r.top + h / 2];
        });
        const worst = Math.max(...pads.map(([x = 0, y = 0], i) => Math.hypot(x - (drills[i]?.[0] ?? 0), y - (drills[i]?.[1] ?? 0))));
        return { count: [drills.length, pads.length], worst };
      });
      expect(offsets.count).toEqual([6, 6]);
      expect(offsets.worst, `at ${width}px`).toBeLessThanOrEqual(0.75);
    }
  });

  test('a sheet opens next to its part, inside the viewport', async ({ page, browserName, isMobile }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/');
    const anchored = await page.evaluate(() => CSS.supports('position-area: center'));
    const rem = 16;
    const fresh = phoneWebKit({ browserName, isMobile });
    for (const id of ['r1', 'u2', ...FR.connectors.map((p) => p.id)]) {
      if (fresh) await page.goto('/');
      await trigger(page, id).click();
      const sheet = page.locator(`#sheet-${id}`);
      await expect(sheet).toBeVisible();
      await settled(sheet);
      const [s, p] = await Promise.all([sheet.boundingBox(), page.locator(`#part-${id}`).boundingBox()]);
      if (!s || !p) throw new Error(`no box for ${id}`);
      expect(s.width, id).toBeCloseTo(22 * rem, 0);
      expect(s.x, id).toBeGreaterThanOrEqual(0);
      expect(s.y, id).toBeGreaterThanOrEqual(0);
      expect(s.x + s.width, id).toBeLessThanOrEqual(1600);
      expect(s.y + s.height, id).toBeLessThanOrEqual(900);
      if (anchored) {
        // Above its part (below when there is no room), 0.75rem away, over the column of the part.
        const gap = Math.min(Math.abs(p.y - (s.y + s.height)), Math.abs(s.y - (p.y + p.height)));
        expect(gap, id).toBeCloseTo(0.75 * rem, 0);
        expect(Math.min(s.x + s.width, p.x + p.width) - Math.max(s.x, p.x), id).toBeGreaterThan(0);
      } else {
        // Without anchor positioning: in the bottom right corner.
        expect(1600 - (s.x + s.width), id).toBeCloseTo(2 * rem, 0);
        expect(900 - (s.y + s.height), id).toBeCloseTo(2 * rem, 0);
      }
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    }
  });

  test('the 404 page keeps the page of the flowing board at 79rem and up', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const pageOf = () =>
      page.evaluate(() => {
        const s = getComputedStyle(document.body);
        return `${s.display} ${s.padding} ${s.alignContent}`;
      });
    await page.goto('/');
    // The home board lies centred on the page.
    expect(await pageOf()).toBe('grid 16px safe center');
    await page.goto('/nope');
    await expect(page.locator('h1')).toBeVisible();
    // The 404 board is the flowing one: the page around it is the base page (base.css).
    expect(await pageOf()).toBe('block 24px 16px normal');
    expect((await page.locator('.board').boundingBox())?.width).toBeCloseTo(44 * 16, 0);
  });

  test('a sheet with no room above its part opens below it', async ({ page }) => {
    // A short window scrolled to the principles: above R1 there is no room for its sheet.
    await page.setViewportSize({ width: 1600, height: 330 });
    await page.goto('/');
    const supported = await page.evaluate(() => CSS.supports('position-area: center') && CSS.supports('position-try-order: most-height'));
    test.skip(!supported, 'no anchor positioning with try order');
    expect(await page.locator('#sheet-r1').evaluate((el) => getComputedStyle(el).getPropertyValue('position-try-order'))).toBe('most-height');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await trigger(page, 'r1').click();
    const sheet = page.locator('#sheet-r1');
    await expect(sheet).toBeVisible();
    await settled(sheet);
    const [s, p] = await Promise.all([sheet.boundingBox(), page.locator('#part-r1').boundingBox()]);
    if (!s || !p) throw new Error('no box for r1');
    expect(p.y).toBeLessThan(80);
    // Flipped below the part, with the room there: not squeezed into the strip above it.
    expect(s.y).toBeGreaterThanOrEqual(p.y + p.height);
    expect(s.height).toBeGreaterThan(120);
    expect(s.y + s.height).toBeLessThanOrEqual(330);
  });

  test('a sheet with no room above its part opens below it, after the pointer has rested on the part', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse: the board leans under it');
    // As a visitor does it: the pointer rests on R1 (the board leans, its trace is lit), then clicks.
    await page.setViewportSize({ width: 1600, height: 330 });
    await page.goto('/');
    const supported = await page.evaluate(() => CSS.supports('position-area: center') && CSS.supports('position-try-order: most-height'));
    test.skip(!supported, 'no anchor positioning with try order');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const box = await trigger(page, 'r1').boundingBox();
    if (!box) throw new Error('no box for R1');
    await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2, { steps: 4 });
    await expect(page.locator('.board')).toHaveAttribute('data-tilting', '');
    await tiltStill(page);
    // Pressed where the pointer is (a click() would first scroll the leaning part into view).
    await page.mouse.down();
    await page.mouse.up();
    const sheet = page.locator('#sheet-r1');
    await expect(sheet).toBeVisible();
    await settled(sheet);
    // The sheet open, the board is flat at once: the sheet has found its place by its part as laid out.
    await expect(page.locator('.board')).not.toHaveAttribute('data-tilting', /.*/);
    await boxStill(page, '#sheet-r1');
    const [s, p] = await Promise.all([sheet.boundingBox(), page.locator('#part-r1').boundingBox()]);
    if (!s || !p) throw new Error('no box for r1');
    expect(s.y).toBeGreaterThanOrEqual(p.y + p.height);
    expect(s.height).toBeGreaterThan(120);
    expect(s.y + s.height).toBeLessThanOrEqual(330);
  });

  test('on a short window every link of a sheet is in view when it opens, clear of the Close bar', async ({ page, browserName, isMobile }) => {
    await page.setViewportSize({ width: 1264, height: 800 });
    const fresh = phoneWebKit({ browserName, isMobile });
    await page.goto('/');
    for (const id of IDS) {
      if (fresh) await page.goto('/');
      await trigger(page, id).click();
      const sheet = page.locator(`#sheet-${id}`);
      await expect(sheet).toBeVisible();
      await settled(sheet);
      // The link is what is drawn at its own centre and at both ends of its box: nothing covers it.
      const hidden = await sheet.locator('a[href]').evaluateAll((links) =>
        links.filter((a) => {
          const r = a.getBoundingClientRect();
          return [r.left + 2, r.left + r.width / 2, r.right - 2].some((x) => {
            const hit = document.elementFromPoint(x, r.top + r.height / 2);
            return !hit || !a.contains(hit);
          });
        }).map((a) => a.textContent),
      );
      expect(hidden, id).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    }
  });

  /*
   * Playwright's WebKit with the settings of a phone stops responding after about nine sheets opened
   * in a row on the wide board, with motion on: seen on the build before J4 and J5 too, never with
   * reduced motion, never in the other engines. To check on a real iPad in landscape (Safari, 1264px
   * wide or more): open ten sheets in a row. If it holds there, this is Playwright's WebKit only.
   */
  test('ten sheets in a row on the wide board, motion on, with WebKit on a phone', async ({ page, browserName, isMobile }) => {
    const phone = phoneWebKit({ browserName, isMobile });
    test.skip(!phone, 'the test above opens the sheets in a row on one page in the other projects');
    test.fixme(phone, 'Playwright WebKit with the settings of a phone hangs after about nine sheets: check on a real iPad');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 1264, height: 800 });
    await page.goto('/');
    for (const id of IDS) {
      await trigger(page, id).click();
      const sheet = page.locator(`#sheet-${id}`);
      await expect(sheet).toBeVisible();
      await settled(sheet);
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();
    }
  });
});

test.describe('wide board with user text settings', () => {
  // These tests inject a stylesheet: the CSP of the page is bypassed for them only.
  test.use({ bypassCSP: true });

  /*
   * Either setting at both sizes: the right column holds its five connectors, their parts on their
   * copper, and the whole board has no overlap or clipping, once for each case a visitor can see: a
   * root font at 125 % moves the wide board to 1580px (79rem), so at 1264px that one is a stress case
   * of the column only.
   */
  for (const viewport of [
    { width: 1264, height: 800 },
    { width: 1600, height: 900 },
  ]) {
    for (const [setting, css] of [
      ['the root font at 125%', 'html { font-size: 125% !important; }'],
      ['text spacing', TEXT_SPACING],
    ] as const) {
      const whole = viewport.width >= 1580 || css === TEXT_SPACING;
      test(`the wide board at ${viewport.width}x${viewport.height} with ${setting}: the right column holds${whole ? ', no overlap or clipping' : ''}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        for (const path of [FR.path, EN.path]) {
          await page.goto(path);
          await page.addStyleTag({ content: css });
          await expect(page.locator('.board__signal')).toBeVisible();
          expect(await connectorColumn(page), path).toEqual([]);
          if (whole) expect(await wideProblems(page), path).toEqual([]);
          expect(await traceEnds(page), path).toEqual(IDS.map((id) => `${id} true true`));
        }
      });
    }
  }
});
