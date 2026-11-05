import { expect, test, type Page } from '@playwright/test';
import { SERIAL } from '../../src/circuit/frontArt';
import { KEYPAD, KEYPAD_SLOT, KEY_MARKS, TEST_ROW } from '../../src/circuit/keypad';

/*
 * The parts the art of the wide board draws in the hero zone and by J5 (spec 4.11): the keypad, the
 * TEST row and its marks, the marks of the keys, the pull-ups RN1, TP5, the serial-number label, FB1 and C27.
 * None of them is ever under a line of text of the page, at every wide width, with the root font at
 * 125 % or with the text spacing of WCAG 1.4.12, and with both at 1264 px. (The copper of the art is checked by layout.spec.ts.)
 */

const TEXT_SPACING = `
  * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
  p { margin-bottom: 2em !important; }
`;

/** The boxes of the drawn parts, in the units of the art: [name, x0, y0, x1, y1]. */
const last = TEST_ROW.x + 9 * TEST_ROW.pitch;
const PARTS: [string, number, number, number, number][] = [
  ['the keypad', KEYPAD_SLOT.x, KEYPAD_SLOT.y, KEYPAD_SLOT.x + KEYPAD_SLOT.w, KEYPAD_SLOT.y + KEYPAD_SLOT.h],
  ['the TEST row and its marks', TEST_ROW.x - TEST_ROW.r, TEST_ROW.y - TEST_ROW.r, last + TEST_ROW.r, TEST_ROW.y + 18],
  ['the label TEST', TEST_ROW.label.x, TEST_ROW.label.y - 12, TEST_ROW.label.x + 30, TEST_ROW.label.y + 2],
  ['the pull-ups RN1', 1023, 480, 1097, 499],
  ['TP5', 868, 464, 892, 494],
  ['the serial-number label', SERIAL.x, SERIAL.y, SERIAL.x + SERIAL.w, SERIAL.y + SERIAL.h],
  ['FB1 and C27', 1144, 753, 1180, 814],
  // The printed marks of the keys, some of them outside the slot.
  ...KEYPAD.map((k): [string, number, number, number, number] => {
    const [x, y] = [k.x + KEY_MARKS[k.key].dx, k.y + KEY_MARKS[k.key].dy];
    return [`the mark of ${k.key}`, x - 5, y - 6, x + 5, y + 6];
  }),
];

async function underText(page: Page): Promise<string[]> {
  return page.evaluate((parts) => {
    const board = (document.querySelector('.board') as HTMLElement).getBoundingClientRect();
    const front = document.querySelector('.board__face--front') as HTMLElement;
    const u = board.width / 1600;
    const out: string[] = [];
    const walker = document.createTreeWalker(front, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      // The keypad's own buttons sit on it; DISP1 and the sheets cover the art.
      if (!el || !n.nodeValue?.trim() || el.closest('.vh, .sheet, .disp, [class*="keypad"]') || !el.checkVisibility()) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const line of range.getClientRects()) {
        for (const [name, x0, y0, x1, y1] of parts) {
          const r = { left: board.left + x0 * u, top: board.top + y0 * u, right: board.left + x1 * u, bottom: board.top + y1 * u };
          const x = Math.min(line.right, r.right) - Math.max(line.left, r.left);
          const y = Math.min(line.bottom, r.bottom) - Math.max(line.top, r.top);
          if (x > 0.5 && y > 0.5) out.push(`"${n.nodeValue.trim().slice(0, 24)}" over ${name}`);
        }
      }
    }
    return out;
  }, PARTS);
}

test.describe('the parts drawn on the wide board', () => {
  test.use({ bypassCSP: true });
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || isMobile, 'the layout of the wide board: Chromium on a desktop');

  for (const width of [1264, 1440, 1600, 1920]) {
    for (const [setting, css] of [
      ['as is', ''],
      ['the root font at 125%', 'html { font-size: 125% !important; }'],
      ['text spacing', TEXT_SPACING],
      // Both at once, on the narrowest wide board (its title on three lines).
      ...(width === 1264 ? ([['the root font at 125% and text spacing', `html { font-size: 125% !important; } ${TEXT_SPACING}`]] as const) : []),
    ] as const) {
      test(`are never under text at ${width} px, ${setting}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        for (const path of ['/', '/en/']) {
          await page.goto(path);
          if (css) await page.addStyleTag({ content: css });
          const wide = await page.evaluate(() => getComputedStyle(document.querySelector('.board__face--front') as Element).backgroundImage.includes('board-wide'));
          // The root font at 125 % moves the wide board to 1580 px.
          if (!wide) continue;
          expect(await underText(page), path).toEqual([]);
        }
      });
    }
  }
});
