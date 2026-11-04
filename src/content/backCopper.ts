import { PACKAGES } from '../lib/packages';
import { BACK_PARTS, BACK_NETS, CIRCUIT_VIEW, netPoints, type BackPart, type Point } from './backNets';
import { BACK_PASSIVES, STUBS, passiveBox, passiveRef, stubPoints } from './backPassives';

/**
 * The copper of the back face that names nothing: what a real bottom side shows besides its parts.
 * In the units of the wide board, x mirrored from the front (1600 - x of the front art):
 * - the through-hole pads of the parts of the front, seen from behind: the header of DISP1 (pin 1,
 *   GND, square, at its right end now), SW1, J1, J2 and the shield tabs of J3;
 * - the mounting holes in the corners, each with its ring of stitching vias, and the fiducials;
 * - the ground pour under the circuit, cut back round every trace, part and pad, its ground pads
 *   joined to it by thermal spokes, and stitched to the ground plane by vias wherever it is free
 *   (the passive parts, content/backPassives.ts, included).
 */

export interface ThroughHole {
  x: number;
  y: number;
  r: number;
  drill: number;
  square?: boolean;
}

export const FRONT_PADS: readonly ThroughHole[] = [
  { x: 372, y: 188, r: 6, drill: 3, square: true },
  { x: 328, y: 188, r: 6, drill: 3 },
  { x: 284, y: 188, r: 6, drill: 3 },
  { x: 240, y: 188, r: 6, drill: 3 },
  { x: 196, y: 188, r: 6, drill: 3 },
  { x: 152, y: 188, r: 6, drill: 3 },
  { x: 192, y: 525, r: 4, drill: 1 },
  { x: 168, y: 525, r: 4, drill: 1 },
  { x: 192, y: 543, r: 4, drill: 1 },
  { x: 168, y: 543, r: 4, drill: 1 },
  { x: 406, y: 634, r: 4, drill: 2, square: true },
  { x: 396, y: 634, r: 4, drill: 2 },
  { x: 386, y: 634, r: 4, drill: 2 },
  { x: 376, y: 634, r: 4, drill: 2 },
  { x: 366, y: 634, r: 4, drill: 2 },
  { x: 356, y: 634, r: 4, drill: 2 },
  { x: 406, y: 698, r: 4, drill: 2, square: true },
  { x: 396, y: 698, r: 4, drill: 2 },
  { x: 386, y: 698, r: 4, drill: 2 },
  { x: 376, y: 698, r: 4, drill: 2 },
  { x: 406, y: 762, r: 5, drill: 2, square: true },
  { x: 354, y: 762, r: 5, drill: 2, square: true },
];

/** Thermal spokes of the ground pads among them (DISP1 GND, J1 GND, J2 GND, the shield of J3). */
export const SPOKES = 'M359 188H385M372 175V201M345 634H367M356 623V645M395 698H417M406 687V709M394 762H418M406 750V774M342 762H366M354 750V774';

export const HOLES: readonly Point[] = [
  [56, 52],
  [1544, 52],
  [56, 848],
  [1544, 848],
];

/** The 8 stitching vias round a mounting hole, as on the front. */
export const HOLE_RING: readonly Point[] = [
  [28, 0],
  [20, 20],
  [0, 28],
  [-20, 20],
  [-28, 0],
  [-20, -20],
  [0, -28],
  [20, -20],
];

export const FIDUCIALS: readonly Point[] = [
  [56, 150],
  [56, 750],
  [1544, 750],
];

/** The routed edge of the board, a fine line of copper just inside it. */
export const OUTLINE = { x: 16, y: 16, w: 1568, h: 868, r: 14 };

/** A mounting hole (plated ring, drill), a stitching via (pad, drill) and a fiducial (pad, its clearing). */
export const HOLE = { r: 15, drill: 8 };
export const VIA = { r: 4, drill: 1 };
export const FIDUCIAL = { r: 5, clear: 13 };

/** The pour: the area of the circuit, its corners rounded (on the flowing board, the whole window). */
export const POUR = { ...CIRCUIT_VIEW, r: 12 };

/** How far the pour stays from a trace (each side), a part and a pad. */
export const CLEARANCE = { trace: 7, part: 6, pad: 6 };

/** The width of the traces of the nets. */
export const TRACE = 3;

/**
 * The room kept for the reference of a part, beside it: wide enough for three letters of silkscreen
 * on a phone, where the circuit is drawn at half size or less and the text keeps its size.
 */
export const LABEL_ROOM = { w: 72, h: 44 };

/** The room of the reference of a part, on its side (back.css places it there). */
export function labelRoom(p: BackPart): { x: number; y: number; w: number; h: number } {
  const f = PACKAGES[p.pkg];
  const { w, h } = LABEL_ROOM;
  const middle = p.y + f.h / 2 - h / 2;
  return {
    n: { x: p.x, y: p.y - h, w, h },
    s: { x: p.x, y: p.y + f.h, w, h },
    w: { x: p.x - w, y: middle, w, h },
    e: { x: p.x + f.w, y: middle, w, h },
  }[p.label];
}

function nearSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const [dx, dy] = [bx - ax, by - ay];
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * The stitching vias: a staggered grid of 32 units over the pour, kept 12 units clear of every
 * trace, part (skill or passive), reference, pad and of the edge of the pour.
 */
function stitching(): Point[] {
  const step = 32;
  const keep = 12;
  const boxes = [
    ...BACK_PARTS.flatMap((p) => [{ x: p.x, y: p.y, w: PACKAGES[p.pkg].w, h: PACKAGES[p.pkg].h }, labelRoom(p)]),
    ...BACK_PASSIVES.flatMap((p) => [passiveBox(p), passiveRef(p).room]),
  ];
  const traces = [...BACK_NETS.map(netPoints), ...STUBS.map(stubPoints)];
  const out: Point[] = [];
  for (let row = 0, y = POUR.y + step / 2; y < POUR.y + POUR.h - keep; row++, y += step) {
    for (let x = POUR.x + step / 2 + (row % 2) * (step / 2); x < POUR.x + POUR.w - keep; x += step) {
      const p: Point = [x, y];
      if (boxes.some((b) => x > b.x - keep && x < b.x + b.w + keep && y > b.y - keep && y < b.y + b.h + keep)) continue;
      if (traces.some((pts) => pts.slice(1).some((q, i) => nearSegment(p, pts[i] as Point, q) < keep))) continue;
      if (FRONT_PADS.some((d) => Math.hypot(x - d.x, y - d.y) < d.r + keep)) continue;
      out.push(p);
    }
  }
  return out;
}

export const STITCH: readonly Point[] = stitching();
