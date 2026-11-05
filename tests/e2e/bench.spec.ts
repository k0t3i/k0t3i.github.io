import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { EN, FR, type Copy } from '../helpers/copy';

/*
 * The back face in the Konami mode (revision 11, spec 4.12, with Anthony's amendment of 05/11/2026):
 * the mode survives the turn of the board; the back plays its autorouter, then its test bench, once
 * per session of the mode; a click, a tap or a key skips to its end, the first Escape skips and the
 * next ends the mode; reduced motion shows the end at once; a real QUITTER by SW2; the code works on
 * the back too. Its timeline and order are unit-tested (tests/unit/bench.spec.ts).
 */

const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

const board = (page: Page): Locator => page.locator('div.board');
const back = (page: Page): Locator => page.locator('section.board__face--back');
const said = (page: Page): Locator => back(page).locator('> p.vh[aria-live="polite"]');
const counter = (page: Page): Locator => page.locator('.back__counter');
const stamp = (page: Page): Locator => page.locator('.back__stamp');
const exit = (page: Page, copy: Copy = FR): Locator => page.getByRole('button', { name: copy.back.bench.exitName });
const booted = (page: Page): Promise<unknown> => page.addInitScript(() => sessionStorage.setItem('k0t3i.booted', '1'));

async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('.board__face--front button.sw2')).toBeVisible();
}
async function typeCode(page: Page): Promise<void> {
  for (const key of CODE) await page.keyboard.press(key);
}
/** The Konami mode on, from the front face. */
async function konami(page: Page): Promise<void> {
  await typeCode(page);
  await expect(page.locator('html')).toHaveAttribute('data-retro', '');
}
/** The board turned with SW2, from the face that is up. */
async function turn(page: Page, from: 'front' | 'back'): Promise<void> {
  await page.locator(`.board__face--${from} button.sw2`).click();
  if (from === 'front') await expect(board(page)).toHaveAttribute('data-flipped', '');
  else await expect(board(page)).not.toHaveAttribute('data-flipped', /.*/);
}
/** The requests for the chunk of the bench. */
function chunks(page: Page): string[] {
  const asked: string[] = [];
  page.on('request', (r) => {
    if (/\/assets\/run-[\w-]+\.js$/.test(new URL(r.url()).pathname)) asked.push(r.url());
  });
  return asked;
}

/** The final state: DRC 0 ERR, every row passed with its result, the stamp, the copper back. */
async function final(page: Page, copy: Copy = FR): Promise<void> {
  await expect(back(page)).toHaveAttribute('data-bench', 'done');
  await expect(counter(page)).toHaveText(copy.back.bench.drc);
  await expect(stamp(page)).toBeVisible();
  await expect(page.locator('.bom tbody tr[data-test="pass"]')).toHaveCount(11);
  await expect(page.locator('.bom__test')).toHaveText(Array(11).fill(copy.back.bench.pass));
  await expect(page.locator('.bom__result')).toHaveText(copy.back.bench.results);
  await expect(page.locator('.back__route')).toHaveCount(0);
}

test.describe('the test bench of the back face', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'a keyboard; the phones below');
  });

  test('its chunk is fetched only on a turn in the Konami mode, never at load nor on a plain turn', async ({ page }) => {
    const asked = chunks(page);
    await booted(page);
    await open(page);
    await turn(page, 'front');
    await page.waitForTimeout(300);
    await turn(page, 'back');
    expect(asked).toEqual([]);
    await konami(page);
    expect(asked).toEqual([]);
    await turn(page, 'front');
    await expect.poll(() => asked.length).toBe(1);
  });

  for (const copy of [FR, EN]) {
    test(`plays the autorouter, then the bench, said at its start and end, and stays on its end (${copy.path})`, async ({ page }) => {
      await booted(page);
      await page.setViewportSize({ width: 1600, height: 900 });
      const messages: string[] = [];
      page.on('console', (m) => messages.push(m.text()));
      await open(page, copy.path);
      await konami(page);
      await turn(page, 'front');
      // The mode lives on: the retro colours on the back face.
      await expect(page.locator('html')).toHaveAttribute('data-retro', '');
      await expect(back(page)).toHaveAttribute('data-bench', 'route');
      await expect(said(page)).toHaveText(copy.back.bench.start);
      await expect(page.locator('.back__route path.back-route__trace')).toHaveCount(152);
      await expect(counter(page)).toHaveText(/^\S+ \d+\/152$/);
      await expect.poll(async () => Number((await counter(page).textContent())?.match(/(\d+)\//)?.[1] ?? 0)).toBeGreaterThan(20);
      expect(await counter(page).textContent()).toMatch(new RegExp(`^${copy.back.bench.routing(0, 152).split(' ')[0]} `));
      // The parts take no pointer while it plays, and nothing is described yet.
      await page.locator('.back-part[data-ref="U14"]').hover({ force: true });
      await expect(back(page)).not.toHaveAttribute('data-active', /.*/);
      await expect(back(page)).toHaveAttribute('data-bench', 'test', { timeout: 6000 });
      await expect(counter(page)).toHaveText(copy.back.bench.drc);
      await expect(page.locator('.bom tbody tr[data-test="run"]')).toHaveCount(1);
      expect(await page.locator('#desc-U10').textContent()).not.toContain(copy.back.bench.results[0]);
      await final(page, copy);
      await expect(said(page)).toHaveText(copy.back.bench.end);
      // The descriptions of the parts gain their results; the parts are live again.
      for (const [ref, k] of [['U10', 0], ['U11', 1], ['J6', 10]] as const) {
        const text = await page.locator(`.back-part[data-ref="${ref}"]`).evaluate((el) => document.getElementById(el.getAttribute('aria-describedby') ?? '')?.textContent ?? '');
        expect(text.endsWith(copy.back.bench.described(copy.back.bench.results[k] ?? '')), ref).toBe(true);
      }
      await page.locator('.back-part[data-ref="U14"]').hover();
      await expect(back(page)).toHaveAttribute('data-active', 'U14');
      // It stays: nothing moves, nothing more is said.
      await page.waitForTimeout(1500);
      await final(page, copy);
      expect(messages.filter((m) => /hydrat|error|warn|content security policy/i.test(m))).toEqual([]);
    });
  }

  test('a click skips to its end; so does any key; the first Escape skips, the next ends the mode', async ({ page }) => {
    await booted(page);
    await open(page);
    await konami(page);
    await turn(page, 'front');
    await expect(back(page)).toHaveAttribute('data-bench', 'route');
    await page.mouse.click(5, 5);
    await final(page);
    await expect(said(page)).toHaveText(FR.back.bench.end);
    // A new session of the mode, a key: the end at once.
    await exit(page).click();
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await typeCode(page);
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await expect(back(page)).toHaveAttribute('data-bench', 'route');
    await page.keyboard.press('Shift');
    await final(page);
    await exit(page).click();
    await typeCode(page);
    await expect(back(page)).toHaveAttribute('data-bench', 'route');
    // Escape: the end of the sequence only, the mode stays; the next one ends it.
    await page.keyboard.press('Escape');
    await final(page);
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await expect(back(page)).not.toHaveAttribute('data-bench', /.*/);
    await expect(page.locator('.bom__test, .bom__result, .back__counter, .back__stamp, .back__route')).toHaveCount(0);
    await expect(exit(page)).toHaveCount(0);
    await expect(board(page)).toHaveAttribute('data-flipped', '');
  });

  test('plays once a session of the mode: a later turn shows its end at once, the next session plays again', async ({ page }) => {
    const asked = chunks(page);
    await booted(page);
    await open(page);
    await konami(page);
    await turn(page, 'front');
    await page.keyboard.press('Shift');
    await final(page);
    await turn(page, 'back');
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await turn(page, 'front');
    await final(page);
    expect(asked).toHaveLength(1);
    // The code typed again on the back ends the mode; typed again, it plays again.
    await typeCode(page);
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await typeCode(page);
    await expect(back(page)).toHaveAttribute('data-bench', 'route');
  });

  test('the QUITTER of the back face: a real button by SW2, it ends the mode and leaves the focus on SW2', async ({ page }) => {
    await booted(page);
    await open(page);
    await expect(exit(page)).toHaveCount(0);
    await konami(page);
    await turn(page, 'front');
    await expect(exit(page)).toBeVisible();
    await expect(exit(page)).toHaveText(FR.back.bench.exit);
    await exit(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await expect(exit(page)).toHaveCount(0);
    await expect(page.locator('.board__face--back button.sw2')).toBeFocused();
    // Back on the front: no game, DISP1 at rest.
    await turn(page, 'back');
    await expect(page.locator('figure.disp')).not.toHaveClass(/\bdisp--game\b/);
  });

  test('the code typed on the back face starts the mode and plays the bench at once; the front then shows the title', async ({ page }) => {
    await booted(page);
    await open(page);
    await turn(page, 'front');
    await typeCode(page);
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await expect(back(page)).toHaveAttribute('data-bench', 'route');
    await turn(page, 'back');
    await expect(page.locator('svg.disp__pixels')).toHaveAttribute('data-screen', 'game');
    await expect(page.locator('svg.disp__pixels path.px--word')).toHaveCount(1);
  });

  test('fast: a turn back during the sequence, Escape during it, a language switch during it: nothing left running', async ({ page }) => {
    await booted(page);
    await open(page);
    await konami(page);
    // Turned back during the autorouter: the front in the mode, the game on its title; again: the end at once.
    await turn(page, 'front');
    await expect(back(page)).toHaveAttribute('data-bench', 'route');
    await turn(page, 'back');
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await expect(page.locator('.back__route')).toHaveCount(0);
    await turn(page, 'front');
    await final(page);
    // Escape twice in a row during a new sequence: the end, then out.
    await exit(page).click();
    await typeCode(page);
    await expect(back(page)).toHaveAttribute('data-bench', 'route');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await expect(page.locator('.back__route, .back__counter')).toHaveCount(0);
    // A language switch during the sequence: the mode and the bench end, nothing comes back.
    await typeCode(page);
    await expect(back(page)).toHaveAttribute('data-bench', 'route');
    await page.evaluate(() => (document.querySelector('a[hreflang="en"], a[lang="en"]') as HTMLElement).click());
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    await page.waitForTimeout(1500);
    await expect(page.locator('.back__route, .back__counter, .back__stamp, .bom__test')).toHaveCount(0);
    await expect(back(page)).not.toHaveAttribute('data-bench', /.*/);
  });

  test('under reduced motion: its end at once, said, no chunk', async ({ page }) => {
    const asked = chunks(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await booted(page);
    await open(page);
    await konami(page);
    await turn(page, 'front');
    await final(page);
    await expect(said(page)).toHaveText(FR.back.bench.end);
    expect(asked).toEqual([]);
  });

  for (const scheme of ['light', 'dark'] as const) {
    for (const width of [1600, 390]) {
      test(`axe: 0 violations in its end, in the retro colours (${scheme}, ${width} px)`, async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: scheme });
        await booted(page);
        await page.setViewportSize({ width, height: 900 });
        await open(page);
        await konami(page);
        await turn(page, 'front');
        await final(page);
        // The front face is inert while the back is up: its main landmark and its h1 are not counted (as in a11y.spec.ts).
        const results = await new AxeBuilder({ page }).withTags(TAGS).disableRules(['landmark-one-main', 'page-has-heading-one']).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
      });
    }
  }
});

/*
 * Its end changes no size: the board as tall with it as without (the results take the place of the
 * parts, PASS the line under each reference), and every drawing in its place, clear of the text.
 */
test.describe('the end of the bench in its place', () => {
  test.use({ reducedMotion: 'reduce', bypassCSP: true });
  test.beforeEach(async ({ isMobile }) => {
    test.skip(isMobile, 'the widths are set here');
  });

  for (const width of [320, 390, 768, 1264, 1440, 1600]) {
    for (const [label, css] of [
      ['plain', ''],
      ['the root font at 125%', 'html { font-size: 125% !important; }'],
      ['text spacing', TEXT_SPACING],
    ] as const) {
      test(`${width} px, ${label}`, async ({ page }) => {
        await booted(page);
        await page.setViewportSize({ width, height: 900 });
        await open(page);
        if (css) await page.addStyleTag({ content: css });
        await turn(page, 'front');
        const height = await board(page).evaluate((el) => (el as HTMLElement).offsetHeight);
        const cells = await page.locator('.bom tbody tr').evaluateAll((rows) => rows.map((r) => (r as HTMLElement).offsetHeight));
        await turn(page, 'back');
        await konami(page);
        await turn(page, 'front');
        await final(page);
        expect(await board(page).evaluate((el) => (el as HTMLElement).offsetHeight)).toBe(height);
        expect(await page.locator('.bom tbody tr').evaluateAll((rows) => rows.map((r) => (r as HTMLElement).offsetHeight))).toEqual(cells);
        const problems = await page.evaluate(() => {
          const out: string[] = [];
          const box = (el: Element) => el.getBoundingClientRect();
          const hits = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5;
          // Each result within its own cell, as high as the part it stands for or less.
          for (const r of document.querySelectorAll('.bom__result')) {
            const part = box(r.parentElement?.querySelector('.bom__part') as Element);
            const cell = box(r.closest('td') as Element);
            const b = box(r);
            if (b.height > part.height + 0.5 && b.bottom > cell.bottom + 0.5) out.push(`a result leaves its row: ${r.textContent}`);
            if (b.right > cell.right + 0.5) out.push(`a result leaves its cell: ${r.textContent}`);
          }
          for (const t of document.querySelectorAll('.bom__test')) {
            const cell = box(t.closest('th') as Element);
            if (!(box(t).bottom <= cell.bottom + 0.5 && box(t).right <= cell.right + 0.5)) out.push('a status leaves its cell');
          }
          // The drawings: in the circuit, never over the table, the parts of the table or each other.
          const circuit = box(document.querySelector('.back__circuit') as Element);
          const table = box(document.querySelector('.bom') as Element);
          for (const q of ['.back__counter', '.back__stamp']) {
            const b = box(document.querySelector(q) as Element);
            if (b.left < circuit.left - 0.5 || b.right > circuit.right + 0.5 || b.top < circuit.top - 0.5 || b.bottom > circuit.bottom + 0.5) out.push(`${q} leaves the circuit`);
            if (hits(b, table)) out.push(`${q} over the table`);
            for (const p of document.querySelectorAll('.back-part')) if (hits(b, box(p))) out.push(`${q} over ${(p as HTMLElement).dataset.ref}`);
          }
          if (hits(box(document.querySelector('.back__counter') as Element), box(document.querySelector('.back__stamp') as Element))) out.push('the counter over the stamp');
          // QUITTER: by SW2, on the face, clear of the title, SW2 and the caption; a target of 24 px.
          const exit = box(document.querySelector('.back__exit') as Element);
          const face = box(document.querySelector('.board__face--back') as Element);
          if (exit.left < face.left || exit.right > face.right) out.push('QUITTER leaves the face');
          if (exit.width < 24 || exit.height < 24) out.push(`QUITTER is ${exit.width} x ${exit.height}`);
          const lines = (q: string): DOMRect[] => {
            const range = document.createRange();
            range.selectNodeContents(document.querySelector(q) as Element);
            return [...range.getClientRects()];
          };
          for (const q of ['.back__title', '.bom__caption', '.bom thead']) for (const l of lines(q)) if (hits(exit, l)) out.push(`QUITTER over ${q}`);
          if (hits(exit, box(document.querySelector('.board__face--back .sw2') as Element))) out.push('QUITTER over SW2');
          // On the flowing board the circuit is under the header; on the wide board it is the whole face.
          if (!matchMedia('(min-width: 79rem)').matches && hits(exit, box(document.querySelector('.back__circuit') as Element))) out.push('QUITTER over the circuit');
          return out;
        });
        expect(problems).toEqual([]);
      });
    }
  }
});

/* On a phone: the code by touch on the circuit of the back face, the skip by a tap, QUITTER tapped. */
test.describe('the back face in the Konami mode, on a phone', () => {
  test.use({ reducedMotion: 'no-preference' });
  test.beforeEach(async ({ isMobile }) => {
    test.skip(!isMobile, 'a touch screen');
  });

  /** A touch on the circuit of the back face, moved by (dx, dy), as a finger does it. */
  async function swipe(page: Page, dx: number, dy: number): Promise<void> {
    await page.locator('.back__circuit').evaluate(
      (el, [dx, dy]) => {
        const box = el.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + Math.min(box.height / 2, innerHeight / 2 - box.top);
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

  test('swiped and tapped on the circuit of the back, the code starts the mode; a tap skips; QUITTER ends it', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'WebKit builds no Touch from a script: the swipes are dispatched in Chromium');
    await booted(page);
    await open(page);
    await page.locator('.board__face--front button.sw2').tap();
    await expect(board(page)).toHaveAttribute('data-flipped', '');
    for (const [dx, dy] of SWIPES) await swipe(page, dx, dy);
    await expect(page.locator('html')).toHaveAttribute('data-retro', '');
    await expect(back(page)).toHaveAttribute('data-bench', 'route');
    await page.locator('.back__circuit').tap();
    await final(page);
    await exit(page).tap();
    await expect(page.locator('html')).not.toHaveAttribute('data-retro', /.*/);
    // The table is as it was.
    const rows = await page.locator('.bom tbody tr').evaluateAll((trs) =>
      trs.map((tr) => [...tr.children].slice(0, 4).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())),
    );
    expect(rows.map((r) => r[0])).toEqual(FR.back.rows.map((r) => r.ref));
  });
});
