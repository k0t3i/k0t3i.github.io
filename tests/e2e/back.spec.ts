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

/** The second colour of the back face (the parts linked to the lit one), as the browser computes it. */
const linkedColour = (page: Page): Promise<string> =>
  face(page).evaluate((el) => {
    const probe = el.ownerDocument.createElement('i');
    probe.style.color = 'var(--linked)';
    el.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  });

/**
 * What is lit on the back face: the part of the state, the parts by the colour of their reference
 * (gold: active, the second colour: a neighbour), the traces drawn (opacity 1), the rows marked by
 * their gold rule, and the rows marked in the second colour.
 */
const lighting = async (page: Page) => {
  const linked = await linkedColour(page);
  return face(page).evaluate(
    (el, { gold, linked }) => {
      const refs = [...el.querySelectorAll<HTMLElement>('.back-part')];
      const rows = [...el.querySelectorAll<HTMLTableRowElement>('tbody tr')];
      const ruled = (colour: string) => rows.filter((tr) => getComputedStyle(tr.cells[0] as Element).boxShadow.includes(colour)).map((tr) => tr.dataset.ref);
      return {
        active: el.getAttribute('data-active'),
        parts: Object.fromEntries(refs.map((p) => [p.dataset.ref, getComputedStyle(p.querySelector('.part__ref') as Element).color])),
        nets: [...el.querySelectorAll<SVGPathElement>('path.back-net')].filter((n) => getComputedStyle(n).opacity === '1').map((n) => n.dataset.net),
        rows: ruled(gold),
        linkedRows: ruled(linked),
      };
    },
    { gold: GOLD, linked },
  );
};

/** The nets of a part, from the annex. */
const netsOf = (ref: string): string[] => BACK_NETS.filter(([, a, b]) => a === ref || b === ref).map(([id]) => id);

/** Checks that `ref` is lit, with its row, its nets and, in the second colour, its neighbours and their rows. */
async function expectLit(page: Page, ref: string): Promise<void> {
  await expect.poll(async () => (await lighting(page)).nets.sort()).toEqual(netsOf(ref).sort());
  const now = await lighting(page);
  const linked = await linkedColour(page);
  expect(now.active).toBe(ref);
  expect(now.rows).toEqual([ref]);
  expect(now.linkedRows).toEqual(NEIGHBOURS[ref]);
  expect(now.parts[ref]).toBe(GOLD);
  const dim = now.parts[REFS.find((r) => r !== ref && !NEIGHBOURS[ref]?.includes(r)) ?? ''];
  for (const other of REFS) {
    if (other === ref) continue;
    if (NEIGHBOURS[ref]?.includes(other)) expect(now.parts[other], `${other}, a neighbour of ${ref}`).toBe(linked);
    else expect(now.parts[other], other).toBe(dim);
  }
  expect(dim).not.toBe(linked);
  expect(dim).not.toBe(SILK);
}

/** The running animations of the page: their name, and the net or element they run on. */
const running = (page: Page) =>
  page.evaluate(() =>
    document.getAnimations().map((a) => {
      const target = (a.effect as KeyframeEffect | null)?.target as Element | null;
      const name = 'animationName' in a ? (a as CSSAnimation).animationName : `transition:${(a as CSSTransition).transitionProperty}`;
      // The glow of the page under the mouse (App.vue) is named apart from the rest of the app.
      const what = target?.matches('path.signal')
        ? 'signal'
        : target?.matches('.mat__glow')
          ? 'glow'
          : (target?.getAttribute('data-net') ?? target?.closest('[id]')?.id ?? target?.tagName ?? '?');
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
    // The same on the flowing board, the circuit above the table. Known WebKit behaviour: the last row
    // is at the bottom of the page, and as the board leans towards the still pointer WebKit moves the
    // page a few pixels under it (its scroll range follows the leaning board). Measured before the mat
    // of revision 8 too (at adff725: the scroll went 371, 368, 365, 348 while leaning), where this test
    // still passed 3 times in 3 by its timing; the mat only shifted the timing. So, once the board has
    // leant, the row is pointed at again.
    await page.setViewportSize({ width: 768, height: 1024 });
    await row(page, 'U20').hover();
    await page.waitForTimeout(800);
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

/** A colour as the browser gives it (rgb(), rgba() or color(srgb ...)): red, green, blue (0 to 255) and alpha. */
function parseColour(c: string): [number, number, number, number] {
  const srgb = c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.e-]+))?\)$/);
  if (srgb) return [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255, srgb[4] === undefined ? 1 : Number(srgb[4])];
  const rgb = c.match(/^rgba?\(([\d.]+),? ([\d.]+),? ([\d.]+)(?:[,/] ?([\d.]+))?\)$/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4])];
  throw new Error(`unknown colour ${c}`);
}

/** WCAG contrast of a text colour on a background, the background composited over the face. */
function contrastOn(text: string, background: string, under: string): number {
  const [tr, tg, tb] = parseColour(text);
  const [br, bg, bb, ba] = parseColour(background);
  const [ur, ug, ub] = parseColour(under);
  const mix = [br * ba + ur * (1 - ba), bg * ba + ug * (1 - ba), bb * ba + ub * (1 - ba)];
  const lum = (rgb: number[]) =>
    rgb
      .map((v) => {
        const c = v / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
  const [a, b] = [lum([tr, tg, tb]), lum(mix)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** The hue of a colour, in degrees. */
function hueOf(c: string): number {
  const [r, g, b] = parseColour(c).map((v) => v / 255) as [number, number, number, number];
  const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
  const h = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min);
  return (h * 60 + 360) % 360;
}

/**
 * The rule of a row as drawn: a box shadow of its first cell, outside it (flowing board) or inset
 * (wide board). Its colour, its width, the gap from its edge on the side of the text to the text.
 */
const ruleOf = (page: Page, ref: string) =>
  row(page, ref).evaluate((tr) => {
    const th = (tr as HTMLTableRowElement).cells[0] as HTMLElement;
    const m = getComputedStyle(th).boxShadow.match(/^(.*\)) (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px( inset)?$/);
    const box = th.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(th);
    const text = Math.min(...[...range.getClientRects()].map((r) => r.left));
    const [, colour = '', ox = '0', , , spread = '0', inset] = m ?? [];
    const width = inset ? Number(ox) : -Number(ox) + Number(spread);
    return {
      colour,
      width,
      gap: text - (inset ? box.left + width : box.left),
      row: (tr as HTMLElement).getBoundingClientRect().toJSON() as Record<string, number>,
      text,
    };
  });

test.describe('the parts linked to the lit one', () => {
  test.use({ reducedMotion: 'reduce' });
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'a mouse: the touch projects tap');
  });

  test('neighbours light in the second colour', async ({ page }) => {
    await booted(page);
    await page.setViewportSize(WIDE);
    await showBack(page);
    const linked = await linkedColour(page);
    // A cool tone, apart from the gold: its hue more than 90 degrees away.
    const apart = Math.abs(hueOf(linked) - hueOf(GOLD));
    expect(Math.min(apart, 360 - apart)).toBeGreaterThan(90);
    const edge = await face(page).evaluate((el) => getComputedStyle(el).getPropertyValue('--linked').trim());

    for (const [how, ref] of [
      ['part', 'U14'],
      ['row', 'U10'],
    ] as const) {
      if (how === 'part') await part(page, ref).hover();
      else await row(page, ref).hover();
      await expectLit(page, ref);
      const neighbours = NEIGHBOURS[ref] ?? [];
      const look = await face(page).evaluate((el) => {
        const rows = [...el.querySelectorAll<HTMLTableRowElement>('tbody tr')];
        return {
          tint: Object.fromEntries(rows.map((tr) => [tr.dataset.ref, getComputedStyle(tr.cells[1] as Element).backgroundColor])),
          refs: Object.fromEntries(rows.map((tr) => [tr.dataset.ref, getComputedStyle(tr.cells[0] as Element).color])),
          to: Object.fromEntries(rows.map((tr) => [tr.dataset.ref, [...tr.querySelectorAll('td.bom__linked .bom__to')].map((t) => getComputedStyle(t).color)])),
          edges: Object.fromEntries([...el.querySelectorAll<HTMLElement>('.back-part')].map((p) => [p.dataset.ref, getComputedStyle(p).getPropertyValue('--body-edge').trim()])),
          // A pad of the symbol, drawn in the part's own svg: its computed fill is the one of its pads.
          pads: Object.fromEntries(
            [...el.querySelectorAll<HTMLElement>('.back-part')].map((p) => {
              const svg = p.querySelector('svg') as SVGSVGElement;
              const pad = svg.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'rect'));
              pad.setAttribute('class', 'pcb-pad');
              const fill = getComputedStyle(pad).fill;
              pad.remove();
              return [p.dataset.ref, fill];
            }),
          ),
          padLinked: (() => {
            const probe = el.ownerDocument.createElement('i');
            probe.style.color = 'var(--pad-linked)';
            el.append(probe);
            const colour = getComputedStyle(probe).color;
            probe.remove();
            return colour;
          })(),
        };
      });
      for (const other of REFS.filter((r) => r !== ref)) {
        if (neighbours.includes(other)) {
          // Their rows: tinted in the second colour, a finer rule of it, the reference in it.
          expect(parseColour(look.tint[other] ?? '')[3], `${other} tinted`).toBeGreaterThan(0);
          expect(look.refs[other], `${other} reference`).toBe(linked);
          const rule = await ruleOf(page, other);
          expect([rule.colour, rule.width], `${other} rule`).toEqual([linked, 1]);
          // Their packages on the circuit, in the second colour too: the edge of the body, and the
          // pads as drawn (the fill a pad of the symbol takes inside the part).
          expect(look.edges[other], `${other} package`).toBe(edge);
          expect(look.pads[other], `${other} pads`).toBe(look.padLinked);
        } else {
          expect(look.pads[other], `${other} pads`).not.toBe(look.padLinked);
          expect(parseColour(look.tint[other] ?? '')[3], `${other} not tinted`).toBe(0);
          expect(look.refs[other], `${other} reference`).not.toBe(linked);
          expect(look.edges[other], `${other} package`).not.toBe(edge);
        }
      }
      // The lit row: its gold rule, twice as wide, and its « Relié à » in the second colour.
      expect((await ruleOf(page, ref)).width).toBe(2);
      expect(look.to[ref]).toEqual(neighbours.map(() => linked));
      for (const other of REFS.filter((r) => r !== ref)) for (const c of look.to[other] ?? []) expect(c, `${other} links`).not.toBe(linked);
      await page.mouse.move(1, 1);
      await expect.poll(async () => (await lighting(page)).linkedRows).toEqual([]);
    }
  });

  test('on a phone, the « Relié à » printed under the value takes the second colour too', async ({ page }) => {
    await booted(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await showBack(page);
    const linked = await linkedColour(page);
    await row(page, 'U14').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await row(page, 'U14').hover();
    await expectLit(page, 'U14');
    const inline = await face(page).evaluate((el) =>
      Object.fromEntries(
        [...el.querySelectorAll<HTMLTableRowElement>('tbody tr')].map((tr) => [
          tr.dataset.ref,
          [...tr.querySelectorAll<HTMLElement>('.bom__links .bom__to')].filter((t) => t.checkVisibility()).map((t) => getComputedStyle(t).color),
        ]),
      ),
    );
    expect(inline.U14).toEqual((NEIGHBOURS.U14 ?? []).map(() => linked));
    for (const other of REFS.filter((r) => r !== 'U14')) {
      expect(inline[other]?.length, other).toBeGreaterThan(0);
      for (const c of inline[other] ?? []) expect(c, other).not.toBe(linked);
    }
  });

  for (const viewport of [
    WIDE,
    { width: 1264, height: 800 },
    { width: 768, height: 1024 },
    { width: 711, height: 900 },
    { width: 390, height: 844 },
    { width: 375, height: 812 },
    { width: 320, height: 720 },
  ]) {
    test(`lit row keeps a gap between its rule and its ref at ${viewport.width}px`, async ({ page }) => {
      await booted(page);
      await page.setViewportSize(viewport);
      await showBack(page);
      // The rows in view first: the hover does not scroll them then.
      await row(page, 'U10').evaluate((el) => el.scrollIntoView({ block: 'center' }));
      const [rest, restNeighbour] = [await ruleOf(page, 'U10'), await ruleOf(page, 'U11')];
      await row(page, 'U10').hover();
      await expectLit(page, 'U10');
      const [lit, neighbour] = [await ruleOf(page, 'U10'), await ruleOf(page, 'U11')];
      // At least 0.5rem between the inner edge of the rule and the reference, gold or not.
      expect(lit.gap, 'lit').toBeGreaterThanOrEqual(8);
      expect(neighbour.gap, 'neighbour').toBeGreaterThanOrEqual(8);
      // Nothing moves when a row lights up.
      expect(lit.row).toEqual(rest.row);
      expect(lit.text).toBe(rest.text);
      expect(neighbour.row).toEqual(restNeighbour.row);
      // No sideways scrolling.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  }

  for (const scheme of ['light', 'dark'] as const) {
    test(`second colour meets AA (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await booted(page);
      for (const viewport of [WIDE, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        await showBack(page);
        await part(page, 'U14').click();
        await page.mouse.move(1, 1);
        await expectLit(page, 'U14');
        // Every text of the lit row and of its neighbours, on its row, on the face.
        const texts = await face(page).evaluate((el) => {
          const under = getComputedStyle(el).backgroundColor;
          const out: { what: string; color: string; background: string; under: string }[] = [];
          for (const tr of el.querySelectorAll<HTMLTableRowElement>('tbody tr')) {
            if (!['U12', 'U14', 'U17', 'U19'].includes(tr.dataset.ref ?? '')) continue;
            for (const cell of tr.cells) {
              const background = getComputedStyle(cell).backgroundColor;
              for (const t of [cell, ...cell.querySelectorAll<HTMLElement>('span')]) {
                const own = [...t.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
                if (own && t.checkVisibility()) out.push({ what: `${tr.dataset.ref} ${t.textContent?.trim()}`, color: getComputedStyle(t).color, background, under });
              }
            }
          }
          return out;
        });
        expect(texts.length).toBeGreaterThan(12);
        for (const t of texts) expect(contrastOn(t.color, t.background, t.under), `${viewport.width}px ${t.what}`).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});

test.describe('forced colours', () => {
  test.use({ forcedColors: 'active', reducedMotion: 'reduce' });

  test('forced colours: the lit part in Highlight, the parts linked to it apart from it, the passives in outline', async ({ page, isMobile }) => {
    test.skip(isMobile, 'a mouse');
    await booted(page);
    await page.setViewportSize(WIDE);
    await showBack(page);
    await part(page, 'U14').click();
    await page.mouse.move(1, 1);
    await expect(face(page)).toHaveAttribute('data-active', 'U14');
    const look = await face(page).evaluate((el) => ({
      pads: Object.fromEntries([...el.querySelectorAll<HTMLElement>('.back-part')].map((p) => [p.dataset.ref, getComputedStyle(p).getPropertyValue('--pad').trim()])),
      outlines: Object.fromEntries([...el.querySelectorAll<HTMLTableRowElement>('tbody tr')].map((tr) => [tr.dataset.ref, getComputedStyle(tr.cells[0] as Element).outlineStyle])),
      passives: [...el.querySelectorAll<SVGUseElement>('use.back__psv')].map((u) => [getComputedStyle(u).display, getComputedStyle(u).getPropertyValue('--psv-line').trim()]),
    }));
    expect(look.pads.U14).toBe('Highlight');
    for (const ref of NEIGHBOURS.U14 ?? []) {
      expect(look.pads[ref], ref).toBe('CanvasText');
      expect(look.outlines[ref], ref).toBe('dashed');
    }
    expect(look.outlines.U14).toBe('solid');
    expect(look.outlines.U10).toBe('none');
    expect(look.passives.length).toBeGreaterThan(20);
    for (const [display, line] of look.passives) expect([display, line]).toEqual(['inline', 'GrayText']);
  });
});

test.describe('the circuit on a flowing board', () => {
  for (const viewport of [
    { width: 711, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`wider circuit on flowing boards at ${viewport.width}px`, async ({ page, isMobile }) => {
      test.skip(isMobile && viewport.width > 390, 'the phone sizes only');
      if (!isMobile) await page.setViewportSize(viewport);
      await showBack(page);
      const fit = await face(page).evaluate((el) => {
        const cs = getComputedStyle(el);
        const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        return { room, circuit: (el.querySelector('.back__circuit') as Element).getBoundingClientRect().width };
      });
      // The whole width of the face, as the table under it.
      expect(Math.abs(fit.circuit - fit.room)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('the description of a part', () => {
  for (const copy of [FR, EN] as Copy[]) {
    for (const viewport of [WIDE, { width: 390, height: 844 }]) {
      test(`a part is described by its value and the parts it is linked to, labelled (${copy.path}, ${viewport.width}px)`, async ({ page, isMobile }) => {
        test.skip(isMobile && viewport.width > 390, 'the phone sizes only');
        if (!isMobile) await page.setViewportSize(viewport);
        await showBack(page, copy.path);
        for (const [ref = '', , value, links] of copy.back.rows) {
          // Not its name again: the reference and the skill are its name already.
          await expect(part(page, ref)).toHaveAccessibleDescription(`${value} ${copy.back.columns[3]} ${links}`);
        }
      });
    }
  }
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
    // At rest, nothing runs on the back face: the front face (and its ambient set) is not drawn. The
    // wave of the page runs on, and the glow of the page fades in under the mouse: they are not the board's.
    const ambient = ['led-breathe part-led1::after', 'signal signal', 'mat-dots app::before', 'mat-wave app', 'transition:opacity glow'];
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
