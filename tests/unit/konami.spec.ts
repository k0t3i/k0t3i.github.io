// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CODE, codeDetector, codeKey, gesture, SWIPE_MIN, TAP_SLOP, type CodeKey } from '../../src/lib/konami';

/** The code as typed on a keyboard: ↑ ↑ ↓ ↓ ← → ← → B A. */
const TYPED = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

/** Feeds keys to a detector: whether each one completed the code. */
const feed = (detect: (k: CodeKey | null) => boolean, keys: (CodeKey | null)[]): boolean[] => keys.map((k) => detect(k));

describe('the code', () => {
  it('is ↑ ↑ ↓ ↓ ← → ← → B A', () => {
    expect(CODE).toEqual(['up', 'up', 'down', 'down', 'left', 'right', 'left', 'right', 'b', 'a']);
    expect(TYPED.map(codeKey)).toEqual(CODE);
  });

  it('reads the key of a keyboard event, B and A in either case (AZERTY and QWERTY give the same key)', () => {
    expect(['b', 'B', 'a', 'A'].map(codeKey)).toEqual(['b', 'b', 'a', 'a']);
    // Any other key is a wrong one; a modifier on its own is no key of the code at all.
    expect(['q', 'Enter', ' ', 'Escape', 'Tab', '2'].map(codeKey)).toEqual([null, null, null, null, null, null]);
    expect(['Shift', 'CapsLock'].map(codeKey)).toEqual([undefined, undefined]);
  });

  it('is found once complete, and only then', () => {
    const detect = codeDetector();
    const keys = TYPED.map(codeKey).filter((k): k is CodeKey => Boolean(k));
    expect(feed(detect, keys)).toEqual([...Array(9).fill(false), true]);
    // Then it starts again from nothing.
    expect(feed(detect, keys)).toEqual([...Array(9).fill(false), true]);
  });

  it('a wrong key sets it back to the longest start of the code that the keys typed end with', () => {
    const detect = codeDetector();
    // ↑ ↑ ↓ then a wrong key: from the start again.
    expect(feed(detect, ['up', 'up', 'down', null, ...CODE])).toEqual([false, false, false, false, ...Array(9).fill(false), true]);
    // ↑ ↑ ↓ ↓ ← then ↑ (wrong here, and the first key of the code): progress is 1, so ↑ ↓ ↓ … completes it.
    expect(feed(detect, ['up', 'up', 'down', 'down', 'left', 'up', ...CODE.slice(1)])).toEqual([...Array(14).fill(false), true]);
    // ↑ ↑ ↑ : the keys typed end with ↑ ↑, the start of the code: progress 2, so ↑ ↑ ↑ ↓ ↓ ← → ← → B A completes it.
    expect(feed(detect, ['up', 'up', 'up', ...CODE.slice(2)])).toEqual([...Array(10).fill(false), true]);
    expect(feed(codeDetector(), ['up', 'up', 'up', 'up', ...CODE.slice(2)])).toEqual([...Array(11).fill(false), true]);
    // ↑ ↑ ↓ ↓ ← → ← → ↑ ↑ (a slip after the arrows): the last two keys start it again.
    expect(feed(codeDetector(), [...CODE.slice(0, 8), 'up', 'up', ...CODE.slice(2)])).toEqual([...Array(17).fill(false), true]);
  });

  it('by touch, a tap of DISP1 stands for B, then A, and for nothing else', () => {
    const detect = codeDetector();
    expect(feed(detect, [...CODE.slice(0, 8), 'tap', 'tap'])).toEqual([...Array(9).fill(false), true]);
    // A tap where a direction is due is a wrong key.
    expect(feed(detect, ['up', 'tap', ...CODE])).toEqual([...Array(11).fill(false), true]);
  });
});

describe('a gesture on DISP1', () => {
  it('is a swipe along its main axis, from SWIPE_MIN (about 24 px)', () => {
    expect(SWIPE_MIN).toBe(24);
    expect(gesture(0, -30)).toBe('up');
    expect(gesture(0, 30)).toBe('down');
    expect(gesture(-30, 0)).toBe('left');
    expect(gesture(30, 0)).toBe('right');
    // The dominant axis wins.
    expect(gesture(40, -25)).toBe('right');
    expect(gesture(-20, 60)).toBe('down');
    expect(gesture(24, 0)).toBe('right');
  });

  it('is a tap when the finger hardly moved, and nothing in between', () => {
    expect(TAP_SLOP).toBeLessThan(SWIPE_MIN);
    expect(gesture(0, 0)).toBe('tap');
    expect(gesture(TAP_SLOP - 1, 0)).toBe('tap');
    expect(gesture(TAP_SLOP, 0)).toBeNull();
    expect(gesture(SWIPE_MIN - 1, 0)).toBeNull();
  });
});
