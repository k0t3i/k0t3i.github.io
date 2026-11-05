import type { Pixel } from './pixelFont';

/**
 * The portrait of the player on the title of « Routage » (Anthony's 32 x 32 pixel avatar, the
 * decision of 05/11/2026), in the four tones of the screen of the game: each opaque pixel of the
 * picture goes to the tone of its luminance, darkest first, the four tones splitting the pixels in
 * four even shares (so a dark or a light picture still uses them all). Transparent pixels are left
 * to the glass. `data` is RGBA, row by row, as a canvas gives it.
 */
export function portrait(data: ArrayLike<number>, w: number, h: number): Pixel[][] {
  const lit: { x: number; y: number; l: number }[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 4 * (y * w + x);
      if ((data[i + 3] ?? 0) < 128) continue;
      const l = 0.2126 * (data[i] ?? 0) + 0.7152 * (data[i + 1] ?? 0) + 0.0722 * (data[i + 2] ?? 0);
      lit.push({ x, y, l });
    }
  }
  const sorted = lit.map((p) => p.l).sort((a, b) => a - b);
  const cut = [1, 2, 3].map((k) => sorted[Math.ceil((k * sorted.length) / 4)] ?? Infinity);
  const tones: Pixel[][] = [[], [], [], []];
  for (const p of lit) tones[cut.filter((c) => p.l >= c).length]?.push({ x: p.x, y: p.y });
  return tones;
}
