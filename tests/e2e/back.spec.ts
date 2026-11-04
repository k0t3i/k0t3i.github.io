import { expect, test, type Locator, type Page } from '@playwright/test';
import { BACK_NETS, EN, FR, type Copy } from '../helpers/copy';

/*
 * The back face (spec rev. 5): every part drawn on it is a skill of the bill of materials, and every
 * trace links two skills that work together. A part under the pointer, the keyboard focus or a tap
 * lights its row of the table, its traces and, more softly, its neighbours; a row under the pointer
 * lights its part. A gold signal runs once along each of its traces, from it to its neighbour.
 */

const GOLD = 'rgb(201, 164, 92)';
const SILK = 'rgb(232, 228, 218)';
const WIDE = { width: 1600, height: 900 };
const REFS = FR.back.rows.map((r) => r[0]);
const NEIGHBOURS = Object.fromEntries(FR.back.rows.map((r) => [r[0], r[3].split(' · ')]));

const face = (page: Page): Locator => page.locator('section.board__face--back');
const part = (page: Page, ref: string): Locator => page.locator(`button.back-part[data-ref="${ref}"]`);
const row = (page: Page, ref: string): Locator => page.locator(`table.bom tr#row-${ref}`);

/** This session has already powered the board on: the page opens at rest. */
const booted = (page: Page): Promise<unknown> => page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));

/** Opens the page and turns the board to its back face; the mouse rests off the board. */
async function showBack(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  const sw2 = page.locator('.board__face--front button.sw2');
  await expect(sw2).toBeVisible();
  await sw2.click();
  await expect(page.locator('div.board')).toHaveAttribute('data-flipped', '');
  await page.mouse.move(1, 1);
  await expect(page.locator('div.board')).not.toHaveAttribute('data-turning', /.*/);
  await expect(page.locator('div.board')).not.toHaveAttribute('data-tilting', /.*/);
  await expect(page.locator('#back-title')).toBeVisible();
}

/**
 * What is lit on the back face: the part of the state, the parts by the colour of their reference
 * (gold: active, silk: a neighbour), the traces drawn (opacity 1), the rows marked by their gold rule.
 */
const lighting = (page: Page) =>
  face(page).evaluate((el, gold) => {
    const refs = [...el.querySelectorAll<HTMLElement>('.back-part')];
    return {
      active: el.getAttribute('data-active'),
      parts: Object.fromEntries(refs.map((p) => [p.dataset.ref, getComputedStyle(p.querySelector('.part__ref') as Element).color])),
      nets: [...el.querySelectorAll<SVGPathElement>('path.back-net')].filter((n) => getComputedStyle(n).opacity === '1').map((n) => n.dataset.net),
      rows: [...el.querySelectorAll<HTMLTableRowElement>('tbody tr')]
        .filter((tr) => getComputedStyle(tr.cells[0] as Element).boxShadow.includes(gold))
        .map((tr) => tr.dataset.ref),
    };
  }, GOLD);

/** The nets of a part, from the annex. */
const netsOf = (ref: string): string[] => BACK_NETS.filter(([, a, b]) => a === ref || b === ref).map(([id]) => id);

/** Checks that `ref` is lit, with its row, its nets and its neighbours. */
async function expectLit(page: Page, ref: string): Promise<void> {
  await expect.poll(async () => (await lighting(page)).nets.sort()).toEqual(netsOf(ref).sort());
  const now = await lighting(page);
  expect(now.active).toBe(ref);
  expect(now.rows).toEqual([ref]);
  expect(now.parts[ref]).toBe(GOLD);
  const dim = now.parts[REFS.find((r) => r !== ref && !NEIGHBOURS[ref]?.includes(r)) ?? ''];
  for (const other of REFS) {
    if (other === ref) continue;
    if (NEIGHBOURS[ref]?.includes(other)) expect(now.parts[other], `${other}, a neighbour of ${ref}`).toBe(SILK);
    else expect(now.parts[other], other).toBe(dim);
  }
  expect(dim).not.toBe(SILK);
}

/** The running animations of the page: their name, and the net or element they run on. */
const running = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().map((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const name = 'animationName' in a ? (a as CSSAnimation).animationName : `transition:${(a as CSSTransition).transitionProperty}`;
      const what = target?.matches('path.signal') ? 'signal' : (target?.getAttribute('data-net') ?? target?.closest('[id]')?.id ?? target?.tagName ?? '?');
      return `${name} ${what}${(a.effect as KeyframeEffect | null)?.pseudoElement ?? ''}`;
    }),
  );

test.describe('the back face lights up', () => {
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'a mouse and a keyboard: the touch projects tap');
  });

  test('hover a part lights its row and nets', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await showBack(page);
    expect((await lighting(page)).active).toBeNull();
    await part(page, 'U14').hover();
    await expectLit(page, 'U14');
    expect((await lighting(page)).nets.sort()).toEqual(['N10', 'N5', 'N7']);
    // Away from it, everything goes dark again.
    await page.mouse.move(1, 1);
    await expect.poll(async () => (await lighting(page)).nets).toEqual([]);
    expect((await lighting(page)).active).toBeNull();
  });

  test('hover a row lights its part', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await showBack(page);
    await row(page, 'U10').hover();
    await expectLit(page, 'U10');
    expect((await lighting(page)).nets.sort()).toEqual(['N1', 'N2']);
    // The same on the flowing board, the circuit above the table.
    await page.setViewportSize({ width: 768, height: 1024 });
    await row(page, 'U20').hover();
    await expectLit(page, 'U20');
  });

  test('keyboard: one tab stop, arrows, Enter pins', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await showBack(page);
    await page.locator('.board__face--back button.sw2').focus();
    // From SW2, Tab enters the group on its tab stop, and Shift+Tab goes straight back to SW2: the
    // group is one stop (nothing follows it on the back face, so a second Tab leaves the page).
    await page.keyboard.press('Tab');
    await expect(part(page, 'U10')).toBeFocused();
    await expectLit(page, 'U10');
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.board__face--back button.sw2')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(part(page, 'U10')).toBeFocused();
    // The arrows go from part to part, in the order of the table; Home and End to the ends.
    await page.keyboard.press('ArrowRight');
    await expect(part(page, 'U11')).toBeFocused();
    await expectLit(page, 'U11');
    await page.keyboard.press('ArrowDown');
    await expect(part(page, 'U12')).toBeFocused();
    await page.keyboard.press('End');
    await expect(part(page, 'U20')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(part(page, 'U10')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(part(page, 'U20')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(part(page, 'U10')).toBeFocused();
    expect(await page.locator('button.back-part[tabindex="0"]').count()).toBe(1);
    // Enter pins: the part stays lit when the focus leaves; Escape unpins it.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(part(page, 'U14')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(part(page, 'U14')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.board__face--back button.sw2').focus();
    await expectLit(page, 'U14');
    await part(page, 'U14').focus();
    await page.keyboard.press('Space');
    await expect(part(page, 'U14')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Enter');
    await expect(part(page, 'U14')).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    await expect(part(page, 'U14')).toHaveAttribute('aria-pressed', 'false');
    // Its focus still lights it: the focus is on it.
    await expectLit(page, 'U14');
    // The focus is drawn, in the gold of the other triggers.
    expect(await part(page, 'U14').evaluate((el) => getComputedStyle(el).outlineColor)).toBe(GOLD);
  });

  test('a click pins a part, a second click unpins it', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await showBack(page);
    await part(page, 'U18').click();
    await expect(part(page, 'U18')).toHaveAttribute('aria-pressed', 'true');
    await page.mouse.move(1, 1);
    await expectLit(page, 'U18');
    // Another part moves the pin.
    await part(page, 'U12').click();
    await expect(part(page, 'U18')).toHaveAttribute('aria-pressed', 'false');
    await expect(part(page, 'U12')).toHaveAttribute('aria-pressed', 'true');
    await part(page, 'U12').click();
    await page.mouse.move(1, 1);
    await expect.poll(async () => (await lighting(page)).active).toBeNull();
  });
});

test.describe('the back face on a touch screen', () => {
  test('touch: tap pins, second tap unpins', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'the touch projects');
    await booted(page);
    await showBack(page);
    await part(page, 'U15').tap();
    await expect(part(page, 'U15')).toHaveAttribute('aria-pressed', 'true');
    await expectLit(page, 'U15');
    // A tap on another part moves the pin; the same part again turns it off, and nothing stays lit.
    await part(page, 'U19').tap();
    await expect(part(page, 'U15')).toHaveAttribute('aria-pressed', 'false');
    await expectLit(page, 'U19');
    await part(page, 'U19').tap();
    await expect(part(page, 'U19')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(async () => (await lighting(page)).active).toBeNull();
    await expect.poll(async () => (await lighting(page)).nets).toEqual([]);
  });
});

test.describe('the current', () => {
  test.use({ reducedMotion: 'no-preference' });

  test('current runs once from the active part', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    await booted(page);
    await page.setViewportSize(WIDE);
    await showBack(page);
    // At rest, nothing runs on the back face: the front face (and its ambient set) is not drawn.
    const ambient = ['led-breathe part-led1::after', 'signal signal'];
    for (const a of await running(page)) expect(ambient).toContain(a);
    await part(page, 'U14').hover();
    // One pass of the signal along each of its traces, leaving from it: N7 and N10 start at U14,
    // N5 ends there (its signal runs it backwards).
    const runs = await page.evaluate(() =>
      [...document.querySelectorAll<SVGPathElement>('path.back-pulse')].flatMap((p) =>
        p.getAnimations().map((a) => {
          const effect = a.effect as KeyframeEffect;
          const frames = effect.getKeyframes().filter((f) => f.strokeDashoffset !== undefined);
          return {
            net: p.dataset.net,
            duration: effect.getTiming().duration,
            iterations: effect.getTiming().iterations,
            from: parseFloat(String(frames[0]?.strokeDashoffset)),
            to: parseFloat(String(frames.at(-1)?.strokeDashoffset)),
          };
        }),
      ),
    );
    expect(runs.map((r) => r.net).sort()).toEqual(['N10', 'N5', 'N7']);
    for (const r of runs) {
      expect(r.duration).toBeGreaterThanOrEqual(500);
      expect(r.duration).toBeLessThanOrEqual(700);
      expect(r.iterations).toBe(1);
      // pathLength 100: from just before the start of the path to past its end, or the other way.
      const forward = r.net !== 'N5';
      expect([r.from, r.to], r.net).toEqual(forward ? [5, -101] : [-101, 5]);
    }
    // After the pass, the traces stay lit and nothing runs any more.
    await expect.poll(async () => (await running(page)).filter((a) => !ambient.includes(a)), { timeout: 3000 }).toEqual([]);
    expect((await lighting(page)).nets.sort()).toEqual(['N10', 'N5', 'N7']);
    // Another part, another pass, from it.
    await part(page, 'U17').hover();
    await expect.poll(async () => (await running(page)).filter((a) => a.startsWith('back-run')).map((a) => a.split(' ')[1]).sort()).toEqual(['N3', 'N7']);
  });
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('reduced motion: light without motion', async ({ page, isMobile }) => {
    await page.setViewportSize(WIDE);
    await showBack(page);
    if (isMobile) await part(page, 'U14').tap();
    else await part(page, 'U14').hover();
    // Lit at once, and nothing moves.
    expect((await lighting(page)).nets.sort()).toEqual(['N10', 'N5', 'N7']);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  });
});

test.describe('the circuit', () => {
  for (const viewport of [WIDE, { width: 1264, height: 800 }, { width: 390, height: 844 }]) {
    test(`every net ends on a pad of its two parts at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await showBack(page);
      const ends = await face(page).evaluate((el) => {
        type Box = { left: number; right: number; top: number; bottom: number };
        const within = (p: DOMPoint, b: Box) => p.x >= b.left - 0.5 && p.x <= b.right + 0.5 && p.y >= b.top - 0.5 && p.y <= b.bottom + 0.5;
        // The pads of a part: the rects of its symbol, over the drawing of the part.
        const pads = (ref: string): Box[] => {
          const svg = el.querySelector(`.back-part[data-ref="${ref}"] svg`) as SVGSVGElement;
          const symbol = el.ownerDocument.querySelector((svg.querySelector('use') as SVGUseElement).getAttribute('href') ?? '') as SVGSymbolElement;
          const [, , vw = 1] = (symbol.getAttribute('viewBox') ?? '').split(' ').map(Number);
          const b = svg.getBoundingClientRect();
          const k = b.width / vw;
          return [...symbol.querySelectorAll('rect.pcb-pad')].map((p) => {
            const [x = 0, y = 0, w = 0, h = 0] = ['x', 'y', 'width', 'height'].map((a) => parseFloat(p.getAttribute(a) ?? '0'));
            return { left: b.left + x * k, right: b.left + (x + w) * k, top: b.top + y * k, bottom: b.top + (y + h) * k };
          });
        };
        return [...el.querySelectorAll<SVGPathElement>('path.back-net')].map((path) => {
          const m = path.getScreenCTM() as DOMMatrix;
          const total = path.getTotalLength();
          const [start, end] = [path.getPointAtLength(0), path.getPointAtLength(total)].map((p) => new DOMPoint(p.x, p.y).matrixTransform(m)) as [DOMPoint, DOMPoint];
          const { net, from = '', to = '' } = path.dataset;
          return `${net} ${pads(from).some((b) => within(start, b))} ${pads(to).some((b) => within(end, b))}`;
        });
      });
      expect(ends).toEqual(BACK_NETS.map(([id]) => `${id} true true`));
    });
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
  ]) {
    test(`no empty area on phones at ${viewport.width}x${viewport.height}`, async ({ page, isMobile }) => {
      if (!isMobile || viewport.width > 390) await page.setViewportSize(viewport);
      await showBack(page);
      const holes = await face(page).evaluate((el) => {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const f = el.getBoundingClientRect();
        // What fills the face: its header, its circuit, its table. Every band of the face without
        // any of them is an empty area.
        const spans = ['.back__header', '.back__circuit', 'table.bom']
          .map((s) => (el.querySelector(s) as Element).getBoundingClientRect())
          .map((r) => [r.top, r.bottom] as const)
          .sort((a, b) => a[0] - b[0]);
        const gaps: number[] = [];
        let y = f.top;
        for (const [top, bottom] of spans) {
          gaps.push(top - y);
          y = Math.max(y, bottom);
        }
        gaps.push(f.bottom - y);
        return { worst: Math.max(...gaps) / rem, board: (document.querySelector('.board') as Element).getBoundingClientRect().height - f.height };
      });
      expect(holes.worst).toBeLessThan(12);
      // The face is as tall as its content: the board takes its height while it is up.
      expect(Math.abs(holes.board)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const copy of [FR, EN] as Copy[]) {
    for (const viewport of [WIDE, { width: 390, height: 844 }]) {
      test(`no-JS back face (${copy.path}, ${viewport.width}px)`, async ({ page, isMobile }) => {
        if (!isMobile) await page.setViewportSize(viewport);
        await page.goto(copy.path);
        const back = face(page);
        await back.scrollIntoViewIfNeeded();
        await expect(page.locator('table.bom')).toBeVisible();
        // The table holds everything, « Relié à » included.
        expect(await page.locator('table.bom thead th').allTextContents()).toEqual(copy.back.columns);
        const rows = await page.locator('table.bom tbody tr').evaluateAll((trs) =>
          trs.map((tr) =>
            [...tr.children].map((c) => {
              const cell = c.cloneNode(true) as Element;
              cell.querySelector('.bom__links')?.remove();
              return cell.textContent?.trim();
            }),
          ),
        );
        expect(rows).toEqual(copy.back.rows);
        // On a phone the links are printed under the value, in place of the last column.
        const narrow = (page.viewportSize()?.width ?? 0) < 600;
        const shown = await page.locator('table.bom tbody tr').first().evaluate((tr) => ({
          column: (tr.lastElementChild as Element).checkVisibility(),
          inline: (tr.querySelector('.bom__links') as Element).checkVisibility(),
        }));
        expect(shown).toEqual({ column: !narrow, inline: narrow });
        // The parts are drawn, but they are no buttons that do nothing: disabled, out of the
        // accessibility tree, out of the tab order.
        await expect(page.locator('button.back-part')).toHaveCount(11);
        await expect(page.locator('button.back-part:not([disabled])')).toHaveCount(0);
        await expect(page.locator('.back__parts')).toHaveAttribute('aria-hidden', 'true');
        await expect(page.locator('.back__parts')).not.toHaveAttribute('role', /.*/);
        await expect(page.getByRole('button', { name: /^U1\d|^U20/ })).toHaveCount(0);
      });
    }
  }
});
