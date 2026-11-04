/**
 * The packages of the parts of the back face, drawn in the units of the wide board (one unit is
 * --u, about one CSS pixel on a 1600px board). A footprint is computed from a few dimensions, so it
 * stays easy to edit: its pads (gold copper, where the traces land), the tin of its leads, its
 * moulded body and the dimple of pin 1. Its origin is the top-left corner of its box, pads included.
 * PartSprite.vue draws one symbol per package; the circuit (content/backNets.ts) routes its traces
 * to the centres of the pads. Every pad centre is a whole unit, so the traces have integer points.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A pad and the number of its pin (counted anticlockwise from pin 1, as on a datasheet). */
export interface Pad extends Rect {
  n: number;
}

export interface Footprint {
  /** The box of the footprint, pads included. */
  w: number;
  h: number;
  pads: Pad[];
  leads: Rect[];
  body: Rect;
  /** The dimple that marks pin 1, on the body. */
  mark: { x: number; y: number; r: number };
}

export const PACKAGE_IDS = ['lqfp48', 'qfn24', 'tssop20', 'soic14', 'tssop16', 'msop10', 'soic16', 'tssop14', 'sot23-6', 'soic8', 'sot223'] as const;
export type PackageId = (typeof PACKAGE_IDS)[number];

/**
 * A dual package (SOIC, TSSOP, MSOP, SOT-23): two rows of gull-wing leads along its long sides, at
 * the top and the bottom of its box. Pin 1 is at the bottom left, the pins go right along the
 * bottom, then left along the top.
 */
function dual(o: { pins: number; pitch: number; bodyW: number; bodyH: number; padW: number; padL: number; leadW: number }): Footprint {
  const per = o.pins / 2;
  const x0 = (o.bodyW - o.pitch * (per - 1)) / 2;
  const h = o.bodyH + 2 * o.padL;
  const pads: Pad[] = [];
  const leads: Rect[] = [];
  for (let k = 0; k < per; k++) {
    const bottom = x0 + k * o.pitch;
    const top = x0 + (per - 1 - k) * o.pitch;
    pads.push({ n: k + 1, x: bottom - o.padW / 2, y: h - o.padL, w: o.padW, h: o.padL });
    pads.push({ n: per + k + 1, x: top - o.padW / 2, y: 0, w: o.padW, h: o.padL });
    leads.push({ x: bottom - o.leadW / 2, y: o.padL + o.bodyH, w: o.leadW, h: o.padL - 2 });
    leads.push({ x: top - o.leadW / 2, y: 2, w: o.leadW, h: o.padL - 2 });
  }
  pads.sort((a, b) => a.n - b.n);
  const body = { x: 0, y: o.padL, w: o.bodyW, h: o.bodyH };
  return { w: o.bodyW, h, pads, leads, body, mark: { x: x0, y: o.padL + o.bodyH - 5, r: 2 } };
}

/**
 * A quad package: leads (LQFP) or bare pads (QFN) on its four sides. Pin 1 is at the top of the left
 * side; the pins go down the left side, right along the bottom, up the right side, left along the top.
 */
function quad(o: { perSide: number; pitch: number; body: number; padW: number; padL: number; gap: number; leadW?: number }): Footprint {
  const edge = o.padL + o.gap;
  const size = o.body + 2 * edge;
  const c0 = edge + (o.body - o.pitch * (o.perSide - 1)) / 2;
  const pads: Pad[] = [];
  const leads: Rect[] = [];
  const at = (k: number) => c0 + k * o.pitch;
  const back = (k: number) => c0 + (o.perSide - 1 - k) * o.pitch;
  const lead = (r: Rect) => o.leadW && leads.push(r);
  const w = o.padW;
  const l = o.padL;
  const lw = o.leadW ?? 0;
  for (let k = 0; k < o.perSide; k++) {
    pads.push({ n: 1 + k, x: 0, y: at(k) - w / 2, w: l, h: w });
    lead({ x: 2, y: at(k) - lw / 2, w: edge - 2, h: lw });
  }
  for (let k = 0; k < o.perSide; k++) {
    pads.push({ n: 1 + o.perSide + k, x: at(k) - w / 2, y: size - l, w, h: l });
    lead({ x: at(k) - lw / 2, y: size - edge, w: lw, h: edge - 2 });
  }
  for (let k = 0; k < o.perSide; k++) {
    pads.push({ n: 1 + 2 * o.perSide + k, x: size - l, y: back(k) - w / 2, w: l, h: w });
    lead({ x: size - edge, y: back(k) - lw / 2, w: edge - 2, h: lw });
  }
  for (let k = 0; k < o.perSide; k++) {
    pads.push({ n: 1 + 3 * o.perSide + k, x: back(k) - w / 2, y: 0, w, h: l });
    lead({ x: back(k) - lw / 2, y: 2, w: lw, h: edge - 2 });
  }
  return { w: size, h: size, pads, leads, body: { x: edge, y: edge, w: o.body, h: o.body }, mark: { x: edge + 9, y: edge + 9, r: 2.5 } };
}

/** SOT-223: three leads at the bottom and the wide tab of pin 4 at the top (a regulator). */
function sot223(): Footprint {
  const pads: Pad[] = [10, 32, 54].map((x, i) => ({ n: i + 1, x: x - 5, y: 50, w: 10, h: 14 }));
  pads.push({ n: 4, x: 14, y: 0, w: 36, h: 14 });
  const leads: Rect[] = [10, 32, 54].map((x) => ({ x: x - 3, y: 50, w: 6, h: 12 }));
  leads.push({ x: 17, y: 2, w: 30, h: 12 });
  return { w: 64, h: 64, pads, leads, body: { x: 0, y: 14, w: 64, h: 36 }, mark: { x: 8, y: 42, r: 2 } };
}

/** The package of each part of the back face (backNets.ts), one of a kind. */
export const PACKAGES: Record<PackageId, Footprint> = {
  lqfp48: quad({ perSide: 12, pitch: 8, body: 112, padW: 5, padL: 12, gap: 2, leadW: 3 }),
  qfn24: quad({ perSide: 6, pitch: 8, body: 56, padW: 4, padL: 6, gap: 0 }),
  tssop20: dual({ pins: 20, pitch: 7, bodyW: 77, bodyH: 26, padW: 4, padL: 8, leadW: 2 }),
  soic14: dual({ pins: 14, pitch: 10, bodyW: 76, bodyH: 28, padW: 6, padL: 10, leadW: 4 }),
  tssop16: dual({ pins: 16, pitch: 7, bodyW: 63, bodyH: 26, padW: 4, padL: 8, leadW: 2 }),
  msop10: dual({ pins: 10, pitch: 7, bodyW: 40, bodyH: 24, padW: 4, padL: 8, leadW: 2 }),
  soic16: dual({ pins: 16, pitch: 10, bodyW: 86, bodyH: 28, padW: 6, padL: 10, leadW: 4 }),
  tssop14: dual({ pins: 14, pitch: 7, bodyW: 56, bodyH: 26, padW: 4, padL: 8, leadW: 2 }),
  'sot23-6': dual({ pins: 6, pitch: 10, bodyW: 32, bodyH: 18, padW: 6, padL: 8, leadW: 3 }),
  soic8: dual({ pins: 8, pitch: 10, bodyW: 48, bodyH: 28, padW: 6, padL: 10, leadW: 4 }),
  sot223: sot223(),
};

/** The centre of the pad of pin `n` of a package, from the origin of its footprint. */
export function padCenter(pkg: PackageId, n: number): [number, number] {
  const pad = PACKAGES[pkg].pads.find((p) => p.n === n);
  if (!pad) throw new Error(`${pkg} has no pin ${n}`);
  return [pad.x + pad.w / 2, pad.y + pad.h / 2];
}
