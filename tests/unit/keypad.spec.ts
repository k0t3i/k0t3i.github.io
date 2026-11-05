import { describe, expect, it } from 'vitest';
import { KEYPAD, KEYPAD_FLOW, KEYPAD_SLOT, KEY_HIT, TEST_PADS, TEST_ROW } from '../../src/circuit/keypad';

/*
 * The place of the test keypad and of its TEST row on the front face (spec 4.11): the data the page,
 * the netlist and the art take their places from (src/circuit/keypad.ts).
 */

type Box = { x0: number; y0: number; x1: number; y1: number };
const hit = (k: { x: number; y: number }): Box => ({ x0: k.x - KEY_HIT / 2, y0: k.y - KEY_HIT / 2, x1: k.x + KEY_HIT / 2, y1: k.y + KEY_HIT / 2 });
const overlap = (a: Box, b: Box): boolean => Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && Math.min(a.y1, b.y1) > Math.max(a.y0, b.y0);

describe('the test keypad', () => {
  it('has six switches, SW3 to SW8, the cross then B and A', () => {
    expect(KEYPAD.map((k) => `${k.ref} ${k.key}`)).toEqual(['SW3 up', 'SW4 down', 'SW5 left', 'SW6 right', 'SW7 b', 'SW8 a']);
  });

  it('gives each switch a hit area of at least 24 CSS px on the smallest wide board, root font at 125 % too (WCAG 2.5.8)', () => {
    // 79rem wide: a 1200 px board (0.75 px a unit); with the root font at 125 %, 0.74 px a unit.
    expect(KEY_HIT * 0.74).toBeGreaterThanOrEqual(24);
  });

  it('keeps the hit areas apart and in the slot of the group', () => {
    const boxes = KEYPAD.map(hit);
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(overlap(a, b)).toBe(false);
    const slot = { x0: KEYPAD_SLOT.x, y0: KEYPAD_SLOT.y, x1: KEYPAD_SLOT.x + KEYPAD_SLOT.w, y1: KEYPAD_SLOT.y + KEYPAD_SLOT.h };
    expect(Math.min(...boxes.map((b) => b.x0))).toBe(slot.x0);
    expect(Math.max(...boxes.map((b) => b.x1))).toBe(slot.x1);
    expect(Math.min(...boxes.map((b) => b.y0))).toBe(slot.y0);
    expect(Math.max(...boxes.map((b) => b.y1))).toBe(slot.y1);
  });

  it('stays clear of the text of the hero (as measured, with the root font at 125 % or the WCAG spacing), of TP1 and of DISP1', () => {
    // The title ends before x 954 above y 410, the subtitle before x 789 above y 509; DISP1 starts at 1188.
    expect(KEYPAD_SLOT.x).toBeGreaterThan(954 + 20);
    expect(KEYPAD_SLOT.x + KEYPAD_SLOT.w).toBeLessThan(1188 - 16);
    expect(overlap({ x0: 1046 - 6, y0: 252 - 6, x1: 1046 + 6, y1: 252 + 6 }, { x0: KEYPAD_SLOT.x, y0: KEYPAD_SLOT.y, x1: 1163, y1: 405 })).toBe(false);
  });

  it('fits the flowing board: the hit areas apart, the group within its cells', () => {
    const boxes = Object.values(KEYPAD_FLOW.centres).map(([x, y]) => ({ x0: x - 0.5, y0: y - 0.5, x1: x + 0.5, y1: y + 0.5 }));
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(overlap(a, b)).toBe(false);
    for (const b of boxes) {
      expect(b.x0).toBeGreaterThanOrEqual(0);
      expect(b.y0).toBeGreaterThanOrEqual(0);
      expect(b.x1).toBeLessThanOrEqual(KEYPAD_FLOW.w);
      expect(b.y1).toBeLessThanOrEqual(KEYPAD_FLOW.h);
    }
  });
});

describe('the TEST row', () => {
  it('is J8, ten pads marked ↑ ↑ ↓ ↓ ← → ← → B A, each on the net of its key', () => {
    expect(TEST_ROW.ref).toBe('J8');
    expect(TEST_PADS.map((p) => p.mark).join(' ')).toBe('↑ ↑ ↓ ↓ ← → ← → B A');
    const netOf = Object.fromEntries(KEYPAD.map((k) => [k.key, k.net]));
    const key = { '↑': 'up', '↓': 'down', '←': 'left', '→': 'right', B: 'b', A: 'a' } as const;
    for (const p of TEST_PADS) expect(p.net).toBe(netOf[key[p.mark as keyof typeof key]]);
  });

  it('lies under the keypad, clear of the subtitle (x 789, y 509) and above the copper of the principles (y 522)', () => {
    expect(TEST_ROW.y - TEST_ROW.r).toBeGreaterThan(KEYPAD_SLOT.y + KEYPAD_SLOT.h + 20);
    expect(TEST_ROW.label.x - 40).toBeGreaterThan(789 + 40);
    expect(TEST_ROW.y + 30).toBeLessThan(522);
    expect((TEST_PADS.at(-1)?.x ?? 0) + TEST_ROW.r).toBeLessThan(1188 - 16);
  });
});
