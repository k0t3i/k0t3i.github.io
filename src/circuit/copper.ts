import { NETS, netOf } from './netlist';
import { BACK_PLACED, CIRCUIT, FRONT_PADS, FRONT_TRACES, THROUGH_PADS, VIAS, placedPads, type PlacedPad, type Point, type Trace, type Via } from './layout';
import ROUTES from './routes.json';

/**
 * All the copper of the board, as drawn and as checked (tests/unit/circuit-drc.spec.ts): the traces
 * of each face, the vias, the pads with their nets, and the ground pour of the back with its
 * stitching vias. The traces of the back are routed by tests/gen/route.ts (routes.json).
 */

export const VIA = { through: 4, blind: 3, drill: 1 };
/** The clearance of the board between copper of two nets, and of the pour. */
export const DRC_CLEAR = 2;
/**
 * The back face breathes (Anthony, 05/11/2026): on the back, two traces keep twice that clearance, and
 * a trace keeps it from the body of a package it has no pin on (tests/gen/route.ts routes at 5 and 6).
 */
export const BACK_TRACE_CLEAR = 4;
export const BODY_MARGIN = 4;
export const POUR_CLEAR = 4;
/** The width of a hop, a signal trace on an inner layer. */
export const HOP_W = 2;

export interface Hop {
  net: string;
  a: Point;
  b: Point;
  /** The inner layer it runs on: L2 (ground) or L3 (+3V3), in a split of the plane. */
  layer: 2 | 3;
  /** Its course on that layer, from one via to the other (not drawn). */
  path: Point[];
}

export interface Routes {
  traces: { net: string; w: number; pts: Point[] }[];
  vias: { net: string; x: number; y: number }[];
  hops: Hop[];
}
const routes = ROUTES as Routes;

export let BACK_TRACES: readonly Trace[] = [];
export let HOPS: readonly Hop[] = [];
/** Every via: the through vias of the layout, the blind ones of the back (planes, hops, the exposed pad). */
export let ALL_VIAS: readonly Via[] = [];
/** Takes the routes of the back (routes.json, or a pass of the router being checked). */
export function useRoutes(r: Routes): void {
  BACK_TRACES = r.traces.map((t) => ({ net: t.net, layer: 'B', w: t.w, pts: t.pts }));
  HOPS = r.hops;
  ALL_VIAS = [...VIAS, ...r.vias.map((v): Via => ({ ...v, kind: 'blind', layer: 'B' }))];
}
useRoutes(routes);

export interface NetPad extends PlacedPad {
  net: string | undefined;
}

const withNet = (p: PlacedPad): NetPad => ({ ...p, net: netOf(`${p.ref}.${p.pin}`)?.name });
/** The pads of the back: its parts, and the through-hole pads of the front seen from behind. */
export const BACK_PADS: readonly NetPad[] = [...BACK_PLACED.flatMap(placedPads), ...THROUGH_PADS].map(withNet);
/** The pads of the front, in front coordinates. */
export const FRONT_NET_PADS: readonly NetPad[] = FRONT_PADS.map(withNet);
export { FRONT_TRACES };

/** The vias that show on the back (through vias, and the blind ones of the back), and on the front. */
export const backVias = (): Via[] => ALL_VIAS.filter((v) => v.kind === 'through' || v.layer === 'B');
export const frontVias = (): Via[] => ALL_VIAS.filter((v) => v.kind === 'through' || v.layer === 'F').map((v) => ({ ...v, x: 1600 - v.x }));

const segDist = ([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number => {
  const [dx, dy] = [bx - ax, by - ay];
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const rectDist = ([px, py]: Point, p: { x: number; y: number; w: number; h: number }): number =>
  Math.hypot(Math.max(Math.abs(px - p.x) - p.w / 2, 0), Math.max(Math.abs(py - p.y) - p.h / 2, 0));

/**
 * The ground pour of the back: the area of the circuit, less a clearance round all copper of the
 * other nets (and round the bodies of the parts, where no copper is poured). A grid of one unit,
 * 1 where copper is poured; and its islands, the ones joined to the ground plane by a via.
 */
export interface Pour {
  at: (x: number, y: number) => number;
  island: (x: number, y: number) => number;
  x0: number;
  y0: number;
  w: number;
  h: number;
}

export function pour(): Pour {
  const { x: x0, y: y0, w, h } = CIRCUIT;
  const grid = new Uint8Array(w * h).fill(1);
  const cut = (test: (x: number, y: number) => boolean, bx0: number, by0: number, bx1: number, by1: number) => {
    for (let y = Math.max(y0, Math.floor(by0)); y < Math.min(y0 + h, Math.ceil(by1)); y++) {
      for (let x = Math.max(x0, Math.floor(bx0)); x < Math.min(x0 + w, Math.ceil(bx1)); x++) if (test(x, y)) grid[(y - y0) * w + (x - x0)] = 0;
    }
  };
  // The edge of the pour, rounded inside the circuit.
  cut((x, y) => x < x0 + 4 || y < y0 + 4 || x >= x0 + w - 4 || y >= y0 + h - 4, x0, y0, x0 + w, y0 + h);
  for (const t of BACK_TRACES.filter((x) => x.net !== 'GND')) {
    for (let i = 1; i < t.pts.length; i++) {
      const [a, b] = [t.pts[i - 1] as Point, t.pts[i] as Point];
      const r = t.w / 2 + POUR_CLEAR;
      cut((x, y) => segDist([x, y], a, b) < r, Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r);
    }
  }
  for (const p of BACK_PADS.filter((x) => x.net !== 'GND')) cut((x, y) => rectDist([x, y], p) < POUR_CLEAR, p.x - p.w, p.y - p.h, p.x + p.w, p.y + p.h);
  for (const v of backVias().filter((x) => x.net !== 'GND')) {
    const r = (v.kind === 'through' ? VIA.through : VIA.blind) + POUR_CLEAR;
    cut((x, y) => Math.hypot(x - v.x, y - v.y) < r, v.x - r, v.y - r, v.x + r, v.y + r);
  }
  // Islands: label the poured cells by flood, and keep the ones a ground via (or a ground pad of a through-hole part) sits in.
  const label = new Int32Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!grid[i] || label[i]) continue;
    n++;
    const stack = [i];
    label[i] = n;
    while (stack.length) {
      const c = stack.pop() as number;
      const cx = c % w;
      const cy = Math.floor(c / w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Point[]) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (grid[j] && !label[j]) {
          label[j] = n;
          stack.push(j);
        }
      }
    }
  }
  const at = (x: number, y: number) => (x >= x0 && y >= y0 && x < x0 + w && y < y0 + h ? (grid[(Math.round(y) - y0) * w + (Math.round(x) - x0)] ?? 0) : 0);
  const island = (x: number, y: number) => (at(x, y) ? (label[(Math.round(y) - y0) * w + (Math.round(x) - x0)] ?? 0) : 0);
  return { at, island, x0, y0, w, h };
}

/** Where the stitching vias of the pour may go: a staggered grid of 32 units. */
function STITCH_CANDIDATES(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let row = 0, y = CIRCUIT.y + 14; y < CIRCUIT.y + CIRCUIT.h - 10; row++, y += 28) {
    for (let x = CIRCUIT.x + 14 + (row % 2) * 14; x < CIRCUIT.x + CIRCUIT.w - 10; x += 28) out.push({ x, y });
  }
  return out;
}

/**
 * The stitching vias of the pour: on the grid, wherever the pour has room for one and its clearance.
 * Each goes down to the ground plane (L2), crossing L3: so it keeps clear of every hop on either
 * inner layer, and of the +3V3 vias of the front, which reach both.
 */
export function stitching(p: Pour = pour()): Point[] {
  const r = VIA.blind + 3;
  const inner = (x: number, y: number) =>
    HOPS.some((h) => h.path.slice(1).some((q, k) => segDist([x, y], h.path[k] as Point, q) < VIA.blind + HOP_W / 2 + DRC_CLEAR + 0.5)) ||
    ALL_VIAS.some((v) => v.layer === 'F' && v.net !== 'GND' && Math.hypot(v.x - x, v.y - y) < 2 * VIA.blind + DRC_CLEAR + 0.5);
  return STITCH_CANDIDATES()
    .filter(({ x, y }) => {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.hypot(dx, dy) <= r && !p.at(x + dx, y + dy)) return false;
      if (inner(x, y)) return false;
      return !BACK_PLACED.some((q) => x > q.box.x - 4 && x < q.box.x + q.box.w + 4 && y > q.box.y - 4 && y < q.box.y + q.box.h + 4);
    })
    .map(({ x, y }): Point => [x, y]);
}

/** The islands of the pour joined to the ground plane: by a ground via, a stitching via or a ground pad that goes through. */
export function grounded(p: Pour, stitch: Point[] = stitching(p)): Set<number> {
  const out = new Set<number>();
  for (const v of backVias().filter((x) => x.net === 'GND')) out.add(p.island(v.x, v.y));
  for (const [x, y] of stitch) out.add(p.island(x, y));
  for (const q of THROUGH_PADS.filter((t) => netOf(`${t.ref}.${t.pin}`)?.name === 'GND')) out.add(p.island(q.x, q.y));
  out.delete(0);
  return out;
}

export const NET_NAMES = NETS.map((n) => n.name);
