// @vitest-environment node
// Node: the oracle of the copy (tests/helpers/copy.ts) reads site.json from the disk.
import { describe, expect, it } from 'vitest';
import { GLYPHS, layoutText, pixelPath, textWidth } from '../../src/lib/pixelFont';
import { formatHours, uptimeHours } from '../../src/lib/uptime';
import { BOOT_SCREENS, EN, FR, GAME_WORDS, MORSE_MESSAGE, READOUTS, UPTIME_UNIT } from '../helpers/copy';

/** Every string DISP1 draws in pixels: the readouts with the reference of their part, the boot, the uptime, the Morse. */
const REFS = [...FR.principles, ...FR.connectors, ...EN.principles, ...EN.connectors].map((p) => p.ref);
/** The uptime as DISP1 draws it: the digits of formatHours, without the thousands separator. */
const hours = (date: string, locale: 'fr' | 'en') => formatHours(uptimeHours(new Date(date)), locale).replace(/\D/g, '');
const UPTIMES = ['2026-11-04', '2040-01-01'].flatMap((d) => [hours(d, 'fr'), hours(d, 'en')]);
/** The mini-game (revision 8): DRC ERR and the key A at scale 1; its title and its scores, up to 3 digits, at scale 2. */
const SCALE_1 = [...Object.values(READOUTS), ...BOOT_SCREENS, ...REFS, ...MORSE_MESSAGE, UPTIME_UNIT, GAME_WORDS.over, GAME_WORDS.key];
const GAME_LARGE = [GAME_WORDS.title, '0', '9', '42', '225'];

describe('pixel font', () => {
  it('every glyph is 5x7', () => {
    expect(Object.keys(GLYPHS).length).toBeGreaterThan(40);
    for (const [ch, rows] of Object.entries(GLYPHS)) {
      expect(rows, ch).toHaveLength(7);
      for (const row of rows) expect(row, ch).toMatch(/^[.#]{5}$/);
    }
    // The space draws nothing; every other glyph draws something.
    expect(GLYPHS[' ']?.join('')).toBe('.'.repeat(35));
    for (const [ch, rows] of Object.entries(GLYPHS)) if (ch !== ' ') expect(rows.join(''), ch).toContain('#');
  });

  it('covers A-Z, 0-9, the space, . - k n m Ω and ×', () => {
    const wanted = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', ' ', '.', '-', 'k', 'n', 'm', 'Ω', '×'];
    expect(wanted.filter((ch) => !(ch in GLYPHS))).toEqual([]);
  });

  it('font covers every screen string', () => {
    const missing = [...SCALE_1, ...UPTIMES, ...GAME_LARGE].flatMap((s) => [...s].filter((ch) => !(ch in GLYPHS)).map((ch) => `${ch} in ${s}`));
    expect(missing).toEqual([]);
    expect(UPTIMES[0]).toMatch(/^\d{5}$/);
  });

  it('lays out each glyph as its own pixels, 6 x scale apart', () => {
    const lit = (rows: readonly string[]) =>
      rows.flatMap((row, y) => [...row].flatMap((c, x) => (c === '#' ? [`${x},${y}`] : [])));
    const h = GLYPHS.H ?? [];
    expect(layoutText('H', 1).map((p) => `${p.x},${p.y}`).sort()).toEqual(lit(h).sort());
    // The second glyph starts one pitch further.
    const two = layoutText('HH', 1);
    expect(two).toHaveLength(lit(h).length * 2);
    expect(Math.min(...two.filter((p) => p.x >= 6).map((p) => p.x))).toBe(6);
    // Scale 2: each pixel is 2 x 2, and the pitch is 12.
    const big = layoutText('HH', 2);
    expect(big).toHaveLength(lit(h).length * 8);
    expect(Math.min(...big.filter((p) => p.x >= 12).map((p) => p.x))).toBe(12);
    expect(Math.max(...big.map((p) => p.y))).toBe(13);
    expect(textWidth('HH', 1)).toBe(11);
    expect(textWidth('HH', 2)).toBe(22);
    expect(textWidth('', 2)).toBe(0);
  });

  it('layoutText fits 64x64', () => {
    const fits = (text: string, scale: 1 | 2) => {
      const px = layoutText(text, scale);
      return px.every((p) => p.x >= 0 && p.x < 64 && p.y >= 0 && p.y < 64) && textWidth(text, scale) <= 64;
    };
    for (const s of SCALE_1) expect(fits(s, 1), s).toBe(true);
    // The uptime in large digits, for years to come.
    for (const s of UPTIMES) expect(fits(s, 2), s).toBe(true);
    // The references are drawn large too, over their readout.
    for (const s of REFS) expect(fits(s, 2), s).toBe(true);
    // The title of the game and its scores (225 cells: never more pads than that), large.
    for (const s of GAME_LARGE) expect(fits(s, 2), s).toBe(true);
  });

  it('draws pixels as one path of squares, a run of lit pixels as one rectangle', () => {
    expect(pixelPath([])).toBe('');
    expect(pixelPath([{ x: 3, y: 4 }], 10, 20)).toBe('M13 24h1v1h-1z');
    // Three in a row on one line, one alone on the next: two rectangles.
    expect(
      pixelPath([
        { x: 2, y: 0 },
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ]),
    ).toBe('M0 0h3v1h-3zM0 1h1v1h-1z');
  });
});
