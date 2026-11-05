import { describe, expect, it } from 'vitest';
import { portrait } from '../../src/lib/portrait';

/* The portrait of the player on the title of the game: four tones by luminance, transparency kept. */
describe('the portrait of the game', () => {
  /** A picture of w x 1 pixels from grey levels (null: transparent). */
  const row = (greys: (number | null)[]): Uint8ClampedArray => new Uint8ClampedArray(greys.flatMap((g) => (g === null ? [0, 0, 0, 0] : [g, g, g, 255])));

  it('puts each opaque pixel in one of four tones, darkest first, in even shares', () => {
    const greys = [0, 30, 60, 90, 120, 150, 180, 210];
    const tones = portrait(row(greys), greys.length, 1);
    expect(tones.map((t) => t.map((p) => p.x))).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
    ]);
  });

  it('leaves transparent pixels to the glass, and keeps where each pixel is', () => {
    const tones = portrait(row([null, 10, null, 250]), 2, 2);
    const all = tones.flat();
    expect(all).toHaveLength(2);
    expect(all).toContainEqual({ x: 1, y: 0 });
    expect(all).toContainEqual({ x: 1, y: 1 });
    expect(tones[0]).toEqual([{ x: 1, y: 0 }]);
    expect(tones.findIndex((t) => t.some((p) => p.y === 1))).toBeGreaterThan(0);
  });

  it('uses luminance, not the mean of the channels: green is lighter than blue', () => {
    const data = new Uint8ClampedArray([0, 200, 0, 255, 0, 0, 200, 255]);
    const tones = portrait(data, 2, 1);
    const toneOf = (x: number) => tones.findIndex((t) => t.some((p) => p.x === x));
    expect(toneOf(0)).toBeGreaterThan(toneOf(1));
  });
});
