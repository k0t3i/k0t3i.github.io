import type { Rect } from './packages';

/**
 * The packages of the passive parts of the back face (content/backPassives.ts), seen from above, in
 * the units of the wide board, at the scale of the packages of the skills (lib/packages.ts): chip
 * capacitors and resistors, a tantalum capacitor, chip LEDs, a crystal, an aluminium electrolytic
 * capacitor and a power inductor. They are decoration: no trace means anything there.
 * Each one is a list of shapes in materials: gold pads (pcb-pad) and tin (pcb-tin) as for the
 * skills, then the materials of the passives (psv-*, back.css), whose colours are tokens of each
 * board (tokens.css). PartSprite.vue draws one symbol per package. Its origin is the top-left corner
 * of its box; w and h are even, so a part turned a quarter turn about its centre stays on whole units.
 */

export type Shape =
  | ({ el: 'rect'; cls: string; rx?: number } & Rect)
  | { el: 'circle'; cls: string; cx: number; cy: number; r: number }
  | { el: 'path'; cls: string; d: string };

export interface PassivePackage {
  w: number;
  h: number;
  /** Where its pads are (pin 1 first): a short trace may land there (content/backPassives.ts). */
  pads: Rect[];
  shapes: Shape[];
}

export const PASSIVE_IDS = ['c0603', 'r0805', 'tant', 'led', 'xtal', 'elec', 'ind'] as const;
export type PassiveId = (typeof PASSIVE_IDS)[number];

const rect = (cls: string, x: number, y: number, w: number, h: number, rx?: number): Shape => ({ el: 'rect', cls, x, y, w, h, ...(rx ? { rx } : {}) });
const pad = (r: Rect): Shape => rect('pcb-pad', r.x, r.y, r.w, r.h, 0.5);

/** A two-terminal chip (C, R): its pads at its ends, then the tin of its terminations over them. */
function chip(w: number, h: number, padW: number): { pads: Rect[]; base: Shape[] } {
  const pads = [
    { x: 0, y: 0, w: padW, h },
    { x: w - padW, y: 0, w: padW, h },
  ];
  return { pads, base: [...pads.map(pad), rect('pcb-tin', 2, 1, 4, h - 2), rect('pcb-tin', w - 6, 1, 4, h - 2)] };
}

/** A multilayer ceramic capacitor 0603: a tan ceramic body between its two tin terminations. */
function c0603(): PassivePackage {
  const { pads, base } = chip(18, 10, 6);
  return { w: 18, h: 10, pads, shapes: [...base, rect('psv-ceramic', 5, 1, 8, 8)] };
}

/** A thick-film resistor 0805: a black body, its value printed in white. */
function r0805(): PassivePackage {
  const { pads, base } = chip(22, 12, 7);
  const marking = [7, 10, 13].map((x) => rect('psv-marking', x, 5, 2, 3));
  return { w: 22, h: 12, pads, shapes: [...base, rect('psv-resistor', 5, 1, 12, 10), ...marking] };
}

/** A tantalum capacitor, case A: a moulded body, its band at the positive end (pin 1). */
function tant(): PassivePackage {
  const pads = [
    { x: 0, y: 2, w: 8, h: 10 },
    { x: 20, y: 2, w: 8, h: 10 },
  ];
  return {
    w: 28,
    h: 14,
    pads,
    shapes: [...pads.map(pad), rect('pcb-tin', 1, 4, 4, 6), rect('pcb-tin', 23, 4, 4, 6), rect('psv-tantalum', 3, 0, 22, 14, 1), rect('psv-band', 3, 0, 5, 14, 1)],
  };
}

/** A chip LED 0805: a pale body, its coloured lens (its colour is set by the part, back.css), its cathode mark at pin 2. */
function led(): PassivePackage {
  const { pads, base } = chip(20, 12, 6);
  return {
    w: 20,
    h: 12,
    pads,
    shapes: [...base, rect('psv-led', 4, 1, 12, 10, 1), rect('psv-lens', 6, 3, 7, 6, 2), rect('psv-cathode', 14, 1, 2, 10), { el: 'circle', cls: 'psv-glint', cx: 8, cy: 5, r: 1 }],
  };
}

/** A crystal in a 3225 package: four pads, a ceramic base, a seam-welded metal lid. */
function xtal(): PassivePackage {
  const pads = [
    { x: 0, y: 0, w: 8, h: 7 },
    { x: 20, y: 0, w: 8, h: 7 },
    { x: 20, y: 15, w: 8, h: 7 },
    { x: 0, y: 15, w: 8, h: 7 },
  ];
  return { w: 28, h: 22, pads, shapes: [...pads.map(pad), rect('psv-ceramic-base', 2, 1, 24, 20, 1.5), rect('psv-lid', 4, 3, 20, 16, 2)] };
}

/** An aluminium electrolytic capacitor (V-chip, 4 mm): a black base cut at its positive corners, the can, its negative mark. */
function elec(): PassivePackage {
  const pads = [
    { x: 11, y: 0, w: 14, h: 9 },
    { x: 11, y: 35, w: 14, h: 9 },
  ];
  return {
    w: 36,
    h: 44,
    pads,
    shapes: [
      ...pads.map(pad),
      { el: 'path', cls: 'psv-base', d: 'M1 4H35V34L29 40H7L1 34Z' },
      { el: 'circle', cls: 'psv-can', cx: 18, cy: 22, r: 15 },
      { el: 'path', cls: 'psv-can-mark', d: 'M6 13A15 15 0 0 1 30 13Z' },
    ],
  };
}

/** A shielded power inductor, 4 x 4 mm: a dark ferrite body, the round top of its core. */
function ind(): PassivePackage {
  const pads = [
    { x: 0, y: 9, w: 6, h: 16 },
    { x: 28, y: 9, w: 6, h: 16 },
  ];
  return { w: 34, h: 34, pads, shapes: [...pads.map(pad), rect('psv-ferrite', 2, 2, 30, 30, 4), { el: 'circle', cls: 'psv-core', cx: 17, cy: 17, r: 10 }] };
}

export const PASSIVES: Record<PassiveId, PassivePackage> = {
  c0603: c0603(),
  r0805: r0805(),
  tant: tant(),
  led: led(),
  xtal: xtal(),
  elec: elec(),
  ind: ind(),
};
