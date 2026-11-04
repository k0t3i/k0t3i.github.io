// @vitest-environment node
// Node: the oracle of the copy (tests/helpers/copy.ts) reads site.json from the disk.
import { describe, expect, it } from 'vitest';
import { encodeMorse, maxFlashesPerSecond, morseTimeline, MORSE_UNIT_MS } from '../../src/lib/morse';
import { MORSE_MESSAGE } from '../helpers/copy';

describe('Morse code', () => {
  it("encodeMorse('HELLO')", () => {
    expect(encodeMorse('HELLO')).toBe('.... . .-.. .-.. ---');
    expect(encodeMorse(MORSE_MESSAGE)).toBe('.... . .-.. .-.. ---');
    // Letters in any case, digits, and a word gap.
    expect(encodeMorse('sos 73')).toBe('... --- ... / --... ...--');
  });

  it('timeline unit rules', () => {
    // A dot is one unit on, a dash three; one unit off inside a letter, three between letters.
    expect(morseTimeline('.-', 100)).toEqual([
      { on: true, ms: 100 },
      { on: false, ms: 100 },
      { on: true, ms: 300 },
    ]);
    expect(morseTimeline('. -', 100)).toEqual([
      { on: true, ms: 100 },
      { on: false, ms: 300 },
      { on: true, ms: 300 },
    ]);
    // Seven units between words.
    expect(morseTimeline('. / .', 10)).toEqual([
      { on: true, ms: 10 },
      { on: false, ms: 70 },
      { on: true, ms: 10 },
    ]);
    // HELLO: 49 units, 16 signals.
    const hello = morseTimeline(encodeMorse('HELLO'), MORSE_UNIT_MS);
    expect(hello.reduce((t, s) => t + s.ms, 0)).toBe(49 * MORSE_UNIT_MS);
    expect(hello.filter((s) => s.on)).toHaveLength(16);
  });

  it('maxFlashesPerSecond counts the most flashes that start within one second', () => {
    const dots = (n: number, unit: number) => morseTimeline(Array.from({ length: n }, () => '.').join(''), unit);
    // Dots 200 ms apart (100 on, 100 off): 0, 200, 400, 600, 800 start within one second.
    expect(maxFlashesPerSecond(dots(8, 100))).toBe(5);
    // 240 ms units: a dot starts every 480 ms, three of them within any second.
    expect(maxFlashesPerSecond(dots(8, 240))).toBe(3);
    expect(maxFlashesPerSecond([])).toBe(0);
    // A light that stays on is one flash.
    expect(
      maxFlashesPerSecond([
        { on: true, ms: 100 },
        { on: true, ms: 100 },
      ]),
    ).toBe(1);
  });

  it('maxFlashesPerSecond(morseTimeline(encodeMorse(HELLO), MORSE_UNIT_MS)) <= 3', () => {
    expect(MORSE_UNIT_MS).toBe(240);
    expect(maxFlashesPerSecond(morseTimeline(encodeMorse('HELLO'), MORSE_UNIT_MS))).toBeLessThanOrEqual(3);
  });
});
