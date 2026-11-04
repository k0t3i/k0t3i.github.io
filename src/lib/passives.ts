import type { Rect } from './packages';

/**
 * The packages of the passive parts of the back face (content/backPassives.ts), seen from above, in
 * the units of the wide board, at the scale of the packages of the skills (lib/packages.ts): chip
 * capacitors and resistors, a tantalum capacitor, chip LEDs, a crystal, an aluminium electrolytic
 * capacitor and a power inductor. They are decoration: no trace means anything there.
 * Each one is a list of shapes in materials: gold pads (pcb-pad) and tin (pcb-tin) as for the
 * skills, then the materials of the passives (psv-*, back.css), whose colours are tokens of each
 * board (tokens.css). BackCopper.vue draws one symbol per package, one unit for one unit (no
 * viewBox). Its origin is the top-left corner of its box; w and h are even, so a part turned a
 * quarter turn about its centre stays on whole units.
 */

/** A shape of a package: its SVG element and its attributes, its material the class among them. */
export interface Shape {
  el: 'rect' | 'circle' | 'path';
  a: Readonly<Record<string, string | number>>;
}

export interface PassivePackage {
  w: number;
  h: number;
  /** Its pads, pin 1 first. */
  pads: Rect[];
  shapes: Shape[];
}

export const PASSIVE_IDS = ['c0603', 'r0805', 'tant', 'led', 'xtal', 'elec', 'ind'] as const;
export type PassiveId = (typeof PASSIVE_IDS)[number];

/**
 * A package from its line of the table: its size; its gold pads, pin 1 first ("x y w h", separated
 * by commas); then its shapes over them, painted in that order and separated by semicolons:
 * "material x y w h [rx]" a rectangle, "material cx cy r" a circle, "material path" a path (its
 * commands without a space).
 */
function pkg(w: number, h: number, pads: string, shapes: string): PassivePackage {
  const rects = pads.split(',').map((p): Rect => {
    const [x = 0, y = 0, pw = 0, ph = 0] = p.trim().split(' ').map(Number);
    return { x, y, w: pw, h: ph };
  });
  const drawn = shapes.split(';').map((line): Shape => {
    const [cls = '', ...v] = line.trim().split(' ');
    const [a = 0, b = 0, c = 0, d = 0, rx = 0] = v.map(Number);
    if (v.length === 1) return { el: 'path', a: { class: cls, d: v[0] ?? '' } };
    if (v.length === 3) return { el: 'circle', a: { class: cls, cx: a, cy: b, r: c } };
    return { el: 'rect', a: { class: cls, x: a, y: b, width: c, height: d, ...(rx ? { rx } : {}) } };
  });
  return { w, h, pads: rects, shapes: [...rects.map((r): Shape => ({ el: 'rect', a: { class: 'pcb-pad', x: r.x, y: r.y, width: r.w, height: r.h, rx: 0.5 } })), ...drawn] };
}

export const PASSIVES: Record<PassiveId, PassivePackage> = {
  // A multilayer ceramic capacitor 0603: a tan ceramic body between its two tin terminations.
  c0603: pkg(18, 10, '0 0 6 10, 12 0 6 10', 'pcb-tin 2 1 4 8; pcb-tin 12 1 4 8; psv-ceramic 5 1 8 8'),
  // A thick-film resistor 0805: a black body, its value printed in white.
  r0805: pkg(22, 12, '0 0 7 12, 15 0 7 12', 'pcb-tin 2 1 4 10; pcb-tin 16 1 4 10; psv-resistor 5 1 12 10; psv-marking 7 5 2 3; psv-marking 10 5 2 3; psv-marking 13 5 2 3'),
  // A tantalum capacitor, case A: a moulded body, its band at the positive end (pin 1).
  tant: pkg(28, 14, '0 2 8 10, 20 2 8 10', 'pcb-tin 1 4 4 6; pcb-tin 23 4 4 6; psv-tantalum 3 0 22 14 1; psv-band 3 0 5 14 1'),
  // A chip LED 0805: a pale body, its coloured lens (its colour is set by the part, back.css), its cathode mark at pin 2.
  led: pkg(20, 12, '0 0 6 12, 14 0 6 12', 'pcb-tin 2 1 4 10; pcb-tin 14 1 4 10; psv-led 4 1 12 10 1; psv-lens 6 3 7 6 2; psv-cathode 14 1 2 10; psv-glint 8 5 1'),
  // A crystal in a 3225 package: four pads, a ceramic base, a seam-welded metal lid.
  xtal: pkg(28, 22, '0 0 8 7, 20 0 8 7, 20 15 8 7, 0 15 8 7', 'psv-ceramic-base 2 1 24 20 1.5; psv-lid 4 3 20 16 2'),
  // An aluminium electrolytic capacitor (V-chip, 4 mm): a black base cut at its positive corners, the can, its negative mark.
  elec: pkg(36, 44, '11 0 14 9, 11 35 14 9', 'psv-base M1,4H35V34L29,40H7L1,34Z; psv-can 18 22 15; psv-can-mark M6,13A15,15,0,0,1,30,13Z'),
  // A shielded power inductor, 4 x 4 mm: a dark ferrite body, the round top of its core.
  ind: pkg(34, 34, '0 9 6 16, 28 9 6 16', 'psv-ferrite 2 2 30 30 4; psv-core 17 17 10'),
};
