/**
 * The footprints of the parts of the back face, in the units of the wide board (1600 x 900; a pitch
 * of 2.54 mm is 44 units, the scale of the headers of the front face). Each one: its box (origin at
 * its top-left corner), its pads (their centre, their size, the pin they are), its moulded body and
 * the mark of pin 1. Pins counted as their datasheet does, anticlockwise from pin 1 seen from above.
 * Every pad centre is a whole unit, so the traces have integer points. Rotations are quarter turns,
 * clockwise (layout.ts). Drawn by the art of the back face (art.ts) and by the live parts (BackFace).
 */

export interface Pad {
  pin: string;
  /** Its centre and size; round for a round pad. */
  x: number;
  y: number;
  w: number;
  h: number;
  round?: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Look = 'qfn' | 'gull' | 'chip' | 'led' | 'xtal' | 'can' | 'ufl' | 'header' | 'tp';

export interface Footprint {
  w: number;
  h: number;
  pads: Pad[];
  /** The body seen from above (a moulded package, a metal lid, a ceramic chip). */
  body: Rect;
  /** The mark of pin 1, on the body; none on a two-pin passive. */
  mark?: { x: number; y: number };
  look: Look;
}

/**
 * A quad flat no-lead package: n pads a side at a pitch, pin 1 at the top of the left side, the pins
 * going down the left side, right along the bottom, up the right side, left along the top; its
 * exposed pad in the middle (the last pin).
 */
function qfn(n: number, pitch: number, size: number, epad: number): Footprint {
  const c0 = (size - pitch * (n - 1)) / 2;
  const pads: Pad[] = [];
  const at = (k: number) => c0 + k * pitch;
  const len = 12;
  const mid = len / 2;
  for (let k = 0; k < n; k++) pads.push({ pin: String(1 + k), x: mid, y: at(k), w: len, h: 5 });
  for (let k = 0; k < n; k++) pads.push({ pin: String(1 + n + k), x: at(k), y: size - mid, w: 5, h: len });
  for (let k = 0; k < n; k++) pads.push({ pin: String(1 + 2 * n + k), x: size - mid, y: at(n - 1 - k), w: len, h: 5 });
  for (let k = 0; k < n; k++) pads.push({ pin: String(1 + 3 * n + k), x: at(n - 1 - k), y: mid, w: 5, h: len });
  pads.push({ pin: String(4 * n + 1), x: size / 2, y: size / 2, w: epad, h: epad });
  return { w: size, h: size, pads, body: { x: 3, y: 3, w: size - 6, h: size - 6 }, mark: { x: 18, y: 18 }, look: 'qfn' };
}

/**
 * A package with gull-wing leads on two sides (SOIC, TSSOP, SOT-23): the pins along the bottom from
 * the left (pin 1 at the bottom left), then along the top from the right. `top` lists the pins of
 * the top row from the right when it is not the full row (SOT-23, SOT-23-5).
 */
function gull(o: { n: number; pitch: number; bodyW: number; bodyH: number; padW: number; padL: number; top?: (number | null)[] }): Footprint {
  const x0 = (o.bodyW - o.pitch * (o.n - 1)) / 2;
  const h = o.bodyH + o.padL;
  const pads: Pad[] = [];
  for (let k = 0; k < o.n; k++) pads.push({ pin: String(k + 1), x: x0 + k * o.pitch, y: h - o.padL / 2, w: o.padW, h: o.padL });
  const top = o.top ?? Array.from({ length: o.n }, (_, k) => o.n + k + 1);
  top.forEach((pin, k) => {
    if (pin !== null) pads.push({ pin: String(pin), x: x0 + (o.n - 1 - k) * o.pitch, y: o.padL / 2, w: o.padW, h: o.padL });
  });
  pads.sort((a, b) => Number(a.pin) - Number(b.pin));
  const body = { x: 0, y: o.padL / 2, w: o.bodyW, h: h - o.padL };
  return { w: o.bodyW, h, pads, body, mark: { x: x0 + 1, y: h - o.padL - 4 }, look: 'gull' };
}

/** A two-pad chip (resistor, capacitor, inductor, LED, crystal): pin 1 on the left. */
function chip(w: number, h: number, padW: number, look: Look = 'chip', pins: [string, string] = ['1', '2']): Footprint {
  return {
    w,
    h,
    pads: [
      { pin: pins[0], x: padW / 2, y: h / 2, w: padW, h },
      { pin: pins[1], x: w - padW / 2, y: h / 2, w: padW, h },
    ],
    body: { x: padW - 2, y: 0, w: w - 2 * padW + 4, h },
    look,
  };
}

export const FOOTPRINTS = {
  qfn56: qfn(14, 9, 151, 79),
  soic8w: gull({ n: 4, pitch: 15, bodyW: 65, bodyH: 72, padW: 9, padL: 20 }),
  so8: gull({ n: 4, pitch: 14, bodyW: 60, bodyH: 52, padW: 8, padL: 16 }),
  tssop16: gull({ n: 8, pitch: 9, bodyW: 77, bodyH: 48, padW: 5, padL: 14 }),
  tssop8: gull({ n: 4, pitch: 9, bodyW: 43, bodyH: 40, padW: 5, padL: 12 }),
  // SOT-23: pins 1 and 2 at the bottom, pin 3 alone at the top.
  sot23: {
    w: 36,
    h: 48,
    pads: [
      { pin: '1', x: 8, y: 42, w: 10, h: 12 },
      { pin: '2', x: 28, y: 42, w: 10, h: 12 },
      { pin: '3', x: 18, y: 6, w: 10, h: 12 },
    ],
    body: { x: 0, y: 6, w: 36, h: 36 },
    mark: { x: 6, y: 32 },
    look: 'gull',
  },
  'sot23-5': gull({ n: 3, pitch: 13, bodyW: 40, bodyH: 36, padW: 8, padL: 12, top: [4, null, 5] }),
  'sot23-6': gull({ n: 3, pitch: 13, bodyW: 40, bodyH: 36, padW: 8, padL: 12 }),
  wsof6: gull({ n: 3, pitch: 10, bodyW: 36, bodyH: 28, padW: 5, padL: 10 }),
  // A 2.0 x 1.6 mm crystal (2016), at the scale of the board (an 0603 is 28 x 14): four pads under its can.
  xtal2016: {
    w: 36,
    h: 30,
    pads: [
      { pin: '1', x: 7, y: 23, w: 12, h: 10 },
      { pin: '2', x: 29, y: 23, w: 12, h: 10 },
      { pin: '3', x: 29, y: 7, w: 12, h: 10 },
      { pin: '4', x: 7, y: 7, w: 12, h: 10 },
    ],
    body: { x: 2, y: 2, w: 32, h: 26 },
    mark: { x: 7, y: 23 },
    look: 'can',
  },
  xtal3215: chip(44, 18, 12, 'xtal'),
  ufl: {
    w: 40,
    h: 38,
    pads: [
      { pin: '1', x: 20, y: 31, w: 10, h: 12 },
      { pin: '2', x: 6, y: 14, w: 12, h: 24 },
      { pin: '3', x: 34, y: 14, w: 12, h: 24 },
    ],
    body: { x: 8, y: 2, w: 24, h: 26 },
    look: 'ufl',
  },
  header6smd: {
    w: 260,
    h: 40,
    // The SMT tails, alternating above and below the row (as the TSM-SV), the posts in the middle; the
    // plastic block of each position, 40 wide at a pitch of 44, inside the body.
    pads: Array.from({ length: 6 }, (_, k): Pad => ({ pin: String(k + 1), x: 20 + k * 44, y: k % 2 ? 35 : 5, w: 12, h: 10 })),
    body: { x: 0, y: 10, w: 260, h: 20 },
    look: 'header',
  },
  '0402': chip(20, 10, 8),
  '0603': chip(28, 14, 10),
  'led0603': chip(28, 14, 10, 'led', ['A', 'K']),
  tp: { w: 16, h: 16, pads: [{ pin: '1', x: 8, y: 8, w: 16, h: 16, round: true }], body: { x: 0, y: 0, w: 16, h: 16 }, look: 'tp' },
} as const satisfies Record<string, Footprint>;

export type FootprintId = keyof typeof FOOTPRINTS;
