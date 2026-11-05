import { NETS, PARTS, netOf } from '../../src/circuit/netlist';
import { BACK_PLACED, CIRCUIT, FRONT_PADS, FRONT_TRACES, JOINED, THROUGH_PADS, VIAS, placedPads, type PlacedPad, type Point, type Trace, type Via } from '../../src/circuit/layout';

/**
 * The router of the back face: a maze router on a grid of one unit, eight directions (every segment
 * horizontal, vertical or at 45°), with a cost for each bend, as an autorouter would set it. Each
 * pad, via and trace keeps the others clear by the clearance of the board. It routes, in order:
 * - the pins on the planes (+3V3, ground) of the back: each to a blind via beside it, a decoupling
 *   capacitor first joined to the pin it serves;
 * - the power traces (VBUS, VDD_SPI), wider;
 * - every signal net, joining the copper already connected (pads, vias, the front traces) one group
 *   at a time, the nearest first.
 * Run by tests/gen/circuit.gen.spec.ts (npm run gen:circuit); its output is src/circuit/routes.json.
 */

export const CLEAR = 2.5;
/**
 * The back face breathes (Anthony, 05/11/2026): two traces of the back keep twice the clearance of a
 * trace and a pad (their own grid, so a pad stays reachable), and a trace stays a margin away from the
 * body of a package it has no pin on. Long, calm runs: a bend costs more.
 */
export const TRACE_CLEAR = 5;
export const BODY_CLEAR = 6;
const BEND_45 = 4;
const BEND_90 = 14;
export const VIA_R = 3;
export const WIDTH: Record<string, number> = { VBUS: 4, VDD_SPI: 3 };

const X0 = CIRCUIT.x - 10;
const Y0 = 48;
const W = CIRCUIT.w + 20;
const H = CIRCUIT.y + CIRCUIT.h + 10 - Y0;
const N = W * H;

const DIRS: Point[] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

export interface Routed {
  traces: Trace[];
  vias: Via[];
  failed: string[];
  /** Hops through an inner layer (L2 or L3, a split of its plane): a blind via at each end, nothing drawn between. */
  hops: { net: string; a: Point; b: Point; layer: 2 | 3; path: Point[] }[];
  grid?: { owner: Int32Array; X0: number; Y0: number; W: number; inner?: Record<2 | 3, Int32Array> };
}

export function route(order: string[] = [], seed = 0, groundVias: string[] = []): Routed {
  const netId = new Map(NETS.map((n, i) => [n.name, i + 1]));
  const owner = new Int32Array(N);
  const idx = (x: number, y: number) => (y - Y0) * W + (x - X0);
  const inside = (x: number, y: number) => x >= X0 && y >= Y0 && x < X0 + W && y < Y0 + H;

  function mark(cx: number, cy: number, hx: number, hy: number, id: number, round = false, grid = owner): void {
    for (let y = Math.floor(cy - hy); y <= Math.ceil(cy + hy); y++) {
      for (let x = Math.floor(cx - hx); x <= Math.ceil(cx + hx); x++) {
        if (!inside(x, y)) continue;
        if (round && Math.hypot(x - cx, y - cy) > hx) continue;
        if (!round && (Math.abs(x - cx) > hx || Math.abs(y - cy) > hy)) continue;
        const i = idx(x, y);
        const o = grid[i] ?? 0;
        grid[i] = o === 0 || o === id ? id : -1;
      }
    }
  }
  /** Keep-out round a segment, for the traces of other nets. */
  function markSegment([ax, ay]: Point, [bx, by]: Point, r: number, id: number, grid = owner): void {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
    for (let k = 0; k <= n; k++) mark(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, r, r, id, true, grid);
  }

  // Every copper pad of the back, with its net.
  const pads: (PlacedPad & { net: number })[] = [
    ...BACK_PLACED.flatMap(placedPads),
    ...THROUGH_PADS,
  ].map((p) => ({ ...p, net: netId.get(netOf(`${p.ref}.${p.pin}`)?.name ?? '') ?? -1 }));
  const hw = 1;
  // The keep-outs of the traces laid, for the traces of the other nets (TRACE_CLEAR).
  const wires = new Int32Array(N);
  // Round each body, its margin (BODY_CLEAR): a cell holds the parts it is near (index + 1), or a list of them (−(k + 1)).
  const margin = new Int32Array(N);
  const nearBy: number[][] = [];
  const netsOfPart = BACK_PLACED.map((p) => new Set(placedPads(p).map((q) => netId.get(netOf(`${q.ref}.${q.pin}`)?.name ?? '') ?? -1)));
  const marginOk = (i: number, id: number): boolean => {
    const m = margin[i] ?? 0;
    if (m === 0) return true;
    if (m > 0) return netsOfPart[m - 1]?.has(id) ?? false;
    return (nearBy[-m - 1] ?? []).some((k) => netsOfPart[k]?.has(id));
  };
  // The bodies of the parts: no trace under them (their own pads excepted, below).
  for (const [k, p] of BACK_PLACED.entries()) {
    const b = p.fp.body;
    const quarter = p.rot === 90 || p.rot === 270;
    const [bw, bh] = quarter ? [b.h, b.w] : [b.w, b.h];
    const [bx, by] = p.rot === 90 ? [p.box.w - b.y - b.h, b.x] : p.rot === 180 ? [p.box.w - b.x - b.w, p.box.h - b.y - b.h] : p.rot === 270 ? [b.y, p.box.h - b.x - b.w] : [b.x, b.y];
    mark(p.x + bx + bw / 2, p.y + by + bh / 2, bw / 2 + CLEAR, bh / 2 + CLEAR, -1);
    const [cx, cy] = [p.x + bx + bw / 2, p.y + by + bh / 2];
    for (let y = Math.floor(cy - bh / 2 - BODY_CLEAR); y <= Math.ceil(cy + bh / 2 + BODY_CLEAR); y++) {
      for (let x = Math.floor(cx - bw / 2 - BODY_CLEAR); x <= Math.ceil(cx + bw / 2 + BODY_CLEAR); x++) {
        if (!inside(x, y)) continue;
        const i = idx(x, y);
        const m = margin[i] ?? 0;
        if (m === 0) margin[i] = k + 1;
        else if (m > 0 && m !== k + 1) {
          nearBy.push([m - 1, k]);
          margin[i] = -nearBy.length;
        } else if (m < 0) nearBy[-m - 1]?.push(k);
      }
    }
  }
  for (const p of pads) {
    // The pad itself is its net's (a pin on no net: nobody's), its clearance too.
    if (p.round) mark(p.x, p.y, p.w / 2 + CLEAR + hw, p.w / 2 + CLEAR + hw, p.net, true);
    else mark(p.x, p.y, p.w / 2 + CLEAR + hw, p.h / 2 + CLEAR + hw, p.net);
  }
  // The pad of a part over its body: open to its own net.
  for (const p of pads) {
    for (let y = Math.ceil(p.y - p.h / 2); y <= Math.floor(p.y + p.h / 2); y++) {
      for (let x = Math.ceil(p.x - p.w / 2); x <= Math.floor(p.x + p.w / 2); x++) if (inside(x, y) && p.net > 0) owner[idx(x, y)] = owner[idx(x, y)] === -1 ? p.net : owner[idx(x, y)] ?? 0;
    }
  }
  // The fan-out: in front of each pin of a chip, a corridor of its own, so that no other trace seals it in.
  const corridors: { id: number; x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const p of BACK_PLACED.filter((q) => q.fp.look === 'qfn' || q.fp.look === 'gull')) {
    const cx = p.box.x + p.box.w / 2;
    const cy = p.box.y + p.box.h / 2;
    for (const pad of placedPads(p)) {
      const id = netId.get(netOf(`${pad.ref}.${pad.pin}`)?.name ?? '') ?? -1;
      if (id < 0 || (pad.w > 30 && pad.h > 30)) continue;
      const dx = (pad.x - cx) / p.box.w;
      const dy = (pad.y - cy) / p.box.h;
      const len = 12;
      if (Math.abs(dx) > Math.abs(dy)) {
        const sx = Math.sign(dx);
        const edge = pad.x + (sx * pad.w) / 2;
        mark(edge + (sx * len) / 2, pad.y, len / 2, 4, id);
        corridors.push({ id, x0: Math.min(edge, edge + sx * len), x1: Math.max(edge, edge + sx * len), y0: pad.y - 4, y1: pad.y + 4 });
      } else {
        const sy = Math.sign(dy);
        const edge = pad.y + (sy * pad.h) / 2;
        mark(pad.x, edge + (sy * len) / 2, 4, len / 2, id);
        corridors.push({ id, x0: pad.x - 4, x1: pad.x + 4, y0: Math.min(edge, edge + sy * len), y1: Math.max(edge, edge + sy * len) });
      }
    }
  }
  const vias: Via[] = [];
  const throughs = VIAS.filter((v) => v.kind === 'through');
  for (const v of throughs) mark(v.x, v.y, 4 + CLEAR + hw, 4 + CLEAR + hw, netId.get(v.net) ?? -1, true);

  // The inner layers, L2 (the ground plane) and L3 (the +3V3 plane): a hop runs in a split of one of
  // them, so each has its own grid of what crosses it. The stack, from the front: F, L2, L3, B. A
  // through via and a through-hole pad cross both; a blind via of the front reaches L2, and L3 too for
  // +3V3; a blind via of the back reaches L3, and L2 too for ground and for the ends of a hop on L2.
  const inner = { 2: new Int32Array(N), 3: new Int32Array(N) };
  const both = [2, 3] as const;
  const backReach = (net: string, hop?: 2 | 3): readonly (2 | 3)[] => (net === 'GND' || hop === 2 ? both : [3]);
  for (const l of both) {
    for (const v of throughs) mark(v.x, v.y, 4 + CLEAR + hw, 4 + CLEAR + hw, netId.get(v.net) ?? -1, true, inner[l]);
    for (const v of VIAS.filter((q) => q.kind === 'blind' && (l === 2 || q.net === '+3V3'))) mark(v.x, v.y, VIA_R + CLEAR + hw, VIA_R + CLEAR + hw, netId.get(v.net) ?? -1, true, inner[l]);
    for (const p of pads.filter((q) => q.layer === 'both')) {
      if (p.round) mark(p.x, p.y, p.w / 2 + CLEAR + hw, p.w / 2 + CLEAR + hw, p.net, true, inner[l]);
      else mark(p.x, p.y, p.w / 2 + CLEAR + hw, p.h / 2 + CLEAR + hw, p.net, false, inner[l]);
    }
    // The fan-out of the chips is kept on the inner layers too: under each pin and its corridor, only
    // its own net, so that a hop of another net never takes the place of the via a pin needs.
    for (const c of corridors) mark((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2, (c.x1 - c.x0) / 2, (c.y1 - c.y0) / 2, c.id, false, inner[l]);
    for (const p of BACK_PLACED.filter((q) => q.fp.look === 'qfn' || q.fp.look === 'gull').flatMap(placedPads)) {
      const id = netId.get(netOf(`${p.ref}.${p.pin}`)?.name ?? '') ?? -1;
      // The room of a via in the pad, with its clearance.
      if (id > 0 && !(p.w > 30 && p.h > 30)) mark(p.x, p.y, VIA_R + CLEAR + hw, VIA_R + CLEAR + hw, id, true, inner[l]);
    }
    const grid = inner[l];
    for (let y = Y0; y < Y0 + H; y++) {
      for (let x = X0; x < X0 + W; x++) if (x < CIRCUIT.x + 6 || x > CIRCUIT.x + CIRCUIT.w - 6 || y < CIRCUIT.y + 6 || y > CIRCUIT.y + CIRCUIT.h - 6) grid[idx(x, y)] = -1;
    }
  }
  /** A blind via of the back: on the back, and on the inner layers it reaches. */
  function addVia(name: string, [x, y]: Point, reach: readonly (2 | 3)[]): void {
    const id = netId.get(name) ?? -1;
    vias.push({ net: name, x, y, kind: 'blind', layer: 'B' });
    mark(x, y, VIA_R + CLEAR + hw, VIA_R + CLEAR + hw, id, true);
    for (const l of reach) mark(x, y, VIA_R + CLEAR + hw, VIA_R + CLEAR + hw, id, true, inner[l]);
  }
  // The edge of the circuit.
  for (let y = Y0; y < Y0 + H; y++) {
    for (let x = X0; x < X0 + W; x++) {
      const out = x < CIRCUIT.x + 6 || x > CIRCUIT.x + CIRCUIT.w - 6 || y > CIRCUIT.y + CIRCUIT.h - 6 || (y < CIRCUIT.y + 6 && !(x > 250 && x < 330));
      if (out) owner[idx(x, y)] = -1;
    }
  }

  // --- A* ---
  const g = new Float64Array(N * 9);
  const stamp = new Int32Array(N * 9);
  const came = new Int32Array(N * 9);
  let gen = 0;
  const target = new Int32Array(N);
  let tgen = 0;

  /** The cheapest path from any source to any target, for a net; its cells, or null. */
  function search(sources: Point[], targets: Point[], id: number, bound = Infinity, grid = owner): Point[] | null {
    gen++;
    tgen++;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let bx0 = Infinity;
    let bx1 = -Infinity;
    let by0 = Infinity;
    let by1 = -Infinity;
    for (const [x, y] of [...sources, ...targets]) {
      bx0 = Math.min(bx0, x);
      bx1 = Math.max(bx1, x);
      by0 = Math.min(by0, y);
      by1 = Math.max(by1, y);
    }
    const margin = 50 + 0.35 * Math.max(bx1 - bx0, by1 - by0);
    [bx0, bx1, by0, by1] = [bx0 - margin, bx1 + margin, by0 - margin, by1 + margin];
    for (const [x, y] of targets) {
      if (!inside(x, y)) continue;
      target[idx(x, y)] = tgen;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const hOf = (x: number, y: number) => {
      const dx = Math.max(minX - x, 0, x - maxX);
      const dy = Math.max(minY - y, 0, y - maxY);
      return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
    };
    // A binary heap of [f, state].
    const heap: number[] = [];
    const fs: number[] = [];
    const push = (f: number, s: number) => {
      heap.push(s);
      fs.push(f);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if ((fs[p] ?? 0) <= f) break;
        [heap[i], heap[p]] = [heap[p] ?? 0, heap[i] ?? 0];
        [fs[i], fs[p]] = [fs[p] ?? 0, fs[i] ?? 0];
        i = p;
      }
    };
    let topF = 0;
    const pop = (): number => {
      const top = heap[0] ?? 0;
      topF = fs[0] ?? 0;
      const lastS = heap.pop() ?? 0;
      const lastF = fs.pop() ?? 0;
      if (heap.length) {
        heap[0] = lastS;
        fs[0] = lastF;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && (fs[l] ?? 0) < (fs[m] ?? 0)) m = l;
          if (r < heap.length && (fs[r] ?? 0) < (fs[m] ?? 0)) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m] ?? 0, heap[i] ?? 0];
          [fs[i], fs[m]] = [fs[m] ?? 0, fs[i] ?? 0];
          i = m;
        }
      }
      return top;
    };
    for (const [x, y] of sources) {
      if (!inside(x, y)) continue;
      const s = idx(x, y) * 9 + 8;
      stamp[s] = gen;
      g[s] = 0;
      came[s] = -1;
      push(hOf(x, y), s);
    }
    const back = grid === owner;
    const ok = (i: number) => {
      const o = grid[i] ?? 0;
      if (o !== 0 && o !== id) return false;
      if (!back) return true;
      const w = wires[i] ?? 0;
      return (w === 0 || w === id) && marginOk(i, id);
    };
    const bundles = grid === owner;
    let pops = 0;
    while (heap.length) {
      const s = pop();
      if (++pops > 3_000_000 || topF > bound) break;
      const cell = Math.floor(s / 9);
      const dir = s % 9;
      const x = (cell % W) + X0;
      const y = Math.floor(cell / W) + Y0;
      const gs = g[s] ?? 0;
      if (target[cell] === tgen && dir !== 8) {
        const path: Point[] = [];
        for (let t = s; t !== -1; t = came[t] ?? -1) {
          const c = Math.floor(t / 9);
          path.push([(c % W) + X0, Math.floor(c / W) + Y0]);
        }
        return path.reverse();
      }
      for (let d = 0; d < 8; d++) {
        let turn = 0;
        if (dir !== 8) {
          const a = Math.abs(d - dir) % 8;
          const t = Math.min(a, 8 - a);
          if (t >= 3) continue;
          turn = t === 1 ? BEND_45 : t === 2 ? BEND_90 : 0;
        }
        const [dx, dy] = DIRS[d] as Point;
        const nx = x + dx;
        const ny = y + dy;
        if (!inside(nx, ny) || nx < bx0 || nx > bx1 || ny < by0 || ny > by1) continue;
        const ni = idx(nx, ny);
        if (!ok(ni)) continue;
        // A diagonal never squeezes between two blocked cells.
        if (dx && dy && (!ok(idx(x + dx, y)) || !ok(idx(x, y + dy)))) continue;
        const ns = ni * 9 + d;
        const ng = gs + (dx && dy ? Math.SQRT2 : 1) * (bundles && along[ni] ? 0.7 : 1) + turn;
        if (stamp[ns] === gen && (g[ns] ?? 0) <= ng) continue;
        stamp[ns] = gen;
        g[ns] = ng;
        came[ns] = s;
        push(ng + hOf(nx, ny), ns);
      }
    }
    return null;
  }

  /** The corners of a path of cells. */
  function corners(path: Point[]): Point[] {
    const out: Point[] = [path[0] as Point];
    for (let i = 1; i < path.length - 1; i++) {
      const [ax, ay] = path[i - 1] as Point;
      const [bx, by] = path[i] as Point;
      const [cx, cy] = path[i + 1] as Point;
      if (bx - ax !== cx - bx || by - ay !== cy - by) out.push([bx, by]);
    }
    out.push(path.at(-1) as Point);
    return out;
  }

  // Cells that run alongside a trace already laid, just outside its keep-out: cheaper, so that
  // traces gather in bundles at a constant pitch, as a designer routes them.
  const along = new Uint8Array(N);
  const traces: Trace[] = [];
  const failed: string[] = [];
  /** The copper of each net on the back already joined: the cells of its traces. */
  const copper = new Map<number, Point[]>();
  function lay(name: string, pts: Point[], w: number): void {
    const id = netId.get(name) ?? -1;
    const cs = corners(pts);
    traces.push({ net: name, layer: 'B', w, pts: cs });
    for (let i = 1; i < cs.length; i++) markSegment(cs[i - 1] as Point, cs[i] as Point, w / 2 + CLEAR + hw, id);
    for (let i = 1; i < cs.length; i++) markSegment(cs[i - 1] as Point, cs[i] as Point, w / 2 + TRACE_CLEAR + hw, id, wires);
    // Mark the lane beside it, one pitch away.
    for (const [px, py] of pts) {
      const r = w / 2 + TRACE_CLEAR + hw + 2.5;
      for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++) {
        for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++) {
          if (!inside(x, y)) continue;
          const d = Math.hypot(x - px, y - py);
          if (d > r - 2 && d <= r) along[idx(x, y)] = 1;
        }
      }
    }
    copper.set(id, [...(copper.get(id) ?? []), ...pts]);
  }

  /** A free place for a via of a net, near a point. */
  function viaSpot([px, py]: Point, id: number, reach: readonly (2 | 3)[], held: Point[] = [], r = VIA_R): Point | null {
    // The zones of the others already hold their clearance: the via needs its own radius free of them, less a trace's half width.
    const keep = r - hw;
    for (let d = 6; d <= 30; d++) {
      const ring: Point[] = [];
      for (let y = py - d; y <= py + d; y++) for (let x = px - d; x <= px + d; x++) if (Math.max(Math.abs(x - px), Math.abs(y - py)) === d) ring.push([x, y]);
      ring.sort((a, b) => Math.hypot(a[0] - px, a[1] - py) - Math.hypot(b[0] - px, b[1] - py));
      for (const [x, y] of ring) {
        let free = true;
        for (let yy = Math.floor(y - keep); yy <= Math.ceil(y + keep) && free; yy++) {
          for (let xx = Math.floor(x - keep); xx <= Math.ceil(x + keep); xx++) {
            if (Math.hypot(xx - x, yy - y) > keep) continue;
            if (!inside(xx, yy)) {
              free = false;
              break;
            }
            const i = idx(xx, yy);
            const o = owner[i] ?? 0;
            if ((o !== 0 && o !== id) || reach.some((l) => (inner[l][i] ?? 0) !== 0 && inner[l][i] !== id)) {
              free = false;
              break;
            }
          }
        }
        // Never in front of the pin of another net, nor by its pad: the zone of the via would close them.
        const toRect = (r: { x0: number; y0: number; x1: number; y1: number }) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.y0 - y, 0, y - r.y1));
        if (free && corridors.some((c) => c.id !== id && toRect(c) < r + CLEAR + hw)) free = false;
        if (free && pads.some((q) => q.net !== id && toRect({ x0: q.x - q.w / 2, x1: q.x + q.w / 2, y0: q.y - q.h / 2, y1: q.y + q.h / 2 }) < r + CLEAR + 2)) free = false;
        if (free && held.some(([hx, hy]) => Math.hypot(hx - x, hy - y) < 2 * r + CLEAR + 2 * hw)) free = false;
        if (free) return [x, y];
      }
    }
    return null;
  }

  const padsOf = (pin: string) => pads.filter((p) => `${p.ref}.${p.pin}` === pin);
  const centre = (p: PlacedPad): Point => [Math.round(p.x), Math.round(p.y)];

  /** A pin of the back on a plane: a blind via beside it, joined by a short trace. */
  function toPlane(pin: string, plane: string): void {
    const pad = padsOf(pin)[0];
    if (!pad || pad.layer !== 'B') return;
    const id = netId.get(plane) ?? -1;
    const spot = viaSpot(centre(pad), id, backReach(plane));
    if (!spot) {
      failed.push(`${pin}: no room for its via`);
      return;
    }
    const path = search([centre(pad)], [spot], id);
    if (!path) {
      failed.push(`${pin}: no path to its via`);
      return;
    }
    lay(plane, path, 2);
    addVia(plane, spot, backReach(plane));
  }

  // 1. The exposed pad of U10: its thermal vias to the ground plane, a grid of 3 x 3.
  const epad = padsOf('U10.57')[0];
  if (epad) for (const dx of [-18, 0, 18]) for (const dy of [-18, 0, 18]) addVia('GND', [epad.x + dx, epad.y + dy], both);

  // 2. Decoupling: each capacitor joined to the pin it serves, then the planes.
  const done = new Set<string>(['U10.57']);
  for (const part of PARTS.filter((p) => p.decoupling && p.face === 'back')) {
    for (const [pin, caps] of Object.entries(part.decoupling ?? {})) {
      const id = `${part.ref}.${pin}`;
      const rail = netOf(id)?.name ?? '';
      const railId = netId.get(rail) ?? -1;
      for (const c of caps) {
        const capPin = `${c}.1`;
        const from = padsOf(id)[0];
        const to = padsOf(capPin)[0];
        if (!from || !to) continue;
        if (!done.has(capPin)) {
          // Joined to its pin by a short trace; too far or no room: both on the plane, each by its via.
          const far = octile(centre(to), centre(from)) > 45;
          const path = far ? null : search([centre(to)], [centre(from)], railId, 2 * octile(centre(to), centre(from)) + 20);
          if (path) {
            lay(rail, path, 2);
            done.add(capPin);
          }
        }
      }
      if ([...caps].every((c) => done.has(`${c}.1`))) done.add(id);
    }
  }
  // Every pin of the back on a plane: a via (the decoupling capacitors at their own pad).
  // The ground pins sit on the ground pour of the back (copper.ts floods it): only +3V3 needs vias.
  for (const n of NETS.filter((x) => x.name === '+3V3')) {
    for (const pin of n.pins) {
      if (done.has(pin) && !/^C\d/.test(pin)) continue;
      if (done.has(`${pin}#via`)) continue;
      toPlane(pin, n.name);
      done.add(`${pin}#via`);
    }
  }

  // 3. The other nets: power first, then the signals, in the given order then the rest.
  const front = new Set(FRONT_PADS.map((p) => `${p.ref}.${p.pin}`));
  /** The copper of a net already joined on the front: groups of terminals reachable on the back. */
  function groups(name: string): Point[][] {
    const n = NETS.find((x) => x.name === name);
    if (!n) return [];
    // Union-find over the pins of the net and its through vias, joined by the front traces.
    const items: { key: string; at: Point | null; f: Point | null }[] = [];
    for (const pin of n.pins) {
      const rep = JOINED[pin] ?? pin;
      const back = padsOf(rep).filter((p) => p.layer !== 'F');
      const fr = FRONT_PADS.find((p) => `${p.ref}.${p.pin}` === rep);
      items.push({ key: pin, at: back[0] ? centre(back[0]) : null, f: fr ? [fr.x, fr.y] : null });
    }
    for (const v of throughs.filter((x) => x.net === name)) items.push({ key: `via ${v.x},${v.y}`, at: [v.x, v.y], f: [1600 - v.x, v.y] });
    const parent = items.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i] ?? i)));
    const join = (a: number, b: number) => {
      parent[find(a)] = find(b);
    };
    items.forEach((it, i) => {
      const rep = JOINED[it.key];
      if (rep) {
        const j = items.findIndex((o) => o.key === rep);
        if (j >= 0) join(i, j);
      }
    });
    // A via in a pad of the front (under a socket) is joined to it.
    items.forEach((it, i) => {
      if (!it.key.startsWith('via') || !it.f) return;
      const [x, y] = it.f;
      items.forEach((o, j) => {
        const fp = FRONT_PADS.find((p) => `${p.ref}.${p.pin}` === (JOINED[o.key] ?? o.key));
        if (fp && Math.abs(x - fp.x) <= fp.w / 2 && Math.abs(y - fp.y) <= fp.h / 2) join(i, j);
      });
    });
    // A front trace joins the items at its two ends (a pad it ends in, a via it ends on).
    for (const t of FRONT_TRACES.filter((x) => x.net === name)) {
      const ends = [t.pts[0], t.pts.at(-1)] as Point[];
      const hit = ends.map(([x, y]) =>
        items.findIndex((it) => {
          if (!it.f) return false;
          const fp = FRONT_PADS.find((p) => `${p.ref}.${p.pin}` === (JOINED[it.key] ?? it.key));
          if (fp && !it.key.startsWith('via')) return Math.abs(x - fp.x) <= fp.w / 2 && Math.abs(y - fp.y) <= fp.h / 2;
          return Math.hypot(x - it.f[0], y - it.f[1]) < 0.5;
        }),
      );
      if ((hit[0] ?? -1) >= 0 && (hit[1] ?? -1) >= 0) join(hit[0] ?? 0, hit[1] ?? 0);
    }
    const out = new Map<number, Point[]>();
    items.forEach((it, i) => {
      const r = find(i);
      if (!out.has(r)) out.set(r, []);
      if (it.at) out.get(r)?.push(it.at);
    });
    void front;
    return [...out.values()];
  }

  const hops: Routed['hops'] = [];
  /** Joins two pieces of a net through the inner layer: a via by each, a short trace to each via. */
  /** A pad of a net at a point: a via may go in it (filled and capped, as on a fine-pitch board). */
  const inPad = ([x, y]: Point, id: number, reach: readonly (2 | 3)[]): Point | null => {
    if (!pads.some((q) => q.net === id && q.layer === 'B' && Math.abs(q.x - x) < 0.5 && Math.abs(q.y - y) < 0.5)) return null;
    const i = idx(x, y);
    return reach.every((l) => (inner[l][i] ?? 0) === 0 || inner[l][i] === id) ? [x, y] : null;
  };
  /** A through-hole pad or a through via of a net at a point, if there is one. */
  const throughAt = ([x, y]: Point, id: number): Point | null => {
    const pad = pads.find((q) => q.net === id && q.layer === 'both' && Math.abs(q.x - x) < 0.5 && Math.abs(q.y - y) < 0.5);
    const via = throughs.find((v) => (netId.get(v.net) ?? -1) === id && v.x === x && v.y === y);
    return pad ? [Math.round(pad.x), Math.round(pad.y)] : via ? [via.x, via.y] : null;
  };
  function hopBetween(name: string, id: number, w: number, from: Point[], to: Point[], [a, b]: [Point, Point]): Point[] | null {
    const at = (pts: Point[], q: Point) => pts.some((p) => p[0] === q[0] && p[1] === q[1]);
    /** A via near an end (or in its pad), free on the layers it reaches, and the path to it on the back. */
    const end = (p: Point, pts: Point[], reverse: boolean, reach: readonly (2 | 3)[], held: Point[]): { spot: Point; path: Point[]; through?: true } | null => {
      // A through-hole pad or a through via of the net already reaches the inner layers: the hop starts there.
      const own = throughAt(p, id);
      if (own) return { spot: own, path: [own], through: true };
      for (const spot of [viaSpot(p, id, reach, held), inPad(p, id, reach)]) {
        if (!spot || held.some(([hx, hy]) => Math.hypot(hx - spot[0], hy - spot[1]) < 2 * VIA_R + CLEAR + 2 * hw)) continue;
        if (at(pts, spot)) return { spot, path: [spot] };
        const path = reverse ? search([spot], pts, id, 3 * octile(p, spot) + 30) : search(pts, [spot], id, 3 * octile(p, spot) + 30);
        if (path) return { spot, path };
      }
      return null;
    };
    // L2 first: a slot cut in the ground plane leaves its pieces joined through the pour of the back
    // and its stitching, where an island of the +3V3 plane (L3) would be cut off. Then L3. The inner
    // trace is routed as on the back, at 45°, clear of everything that crosses its layer.
    for (const layer of [2, 3] as const) {
      const reach = backReach(name, layer);
      const ea = end(a, from, false, reach, []);
      if (!ea) continue;
      const eb = end(b, to, true, reach, [ea.spot]);
      if (!eb) continue;
      const cells = search([ea.spot], [eb.spot], id, 3 * octile(ea.spot, eb.spot) + 160, inner[layer]);
      if (!cells) continue;
      const path = corners(cells);
      if (ea.path.length > 1) lay(name, ea.path, w);
      if (eb.path.length > 1) lay(name, eb.path, w);
      if (!ea.through) addVia(name, ea.spot, reach);
      if (!eb.through) addVia(name, eb.spot, reach);
      for (let i = 1; i < path.length; i++) markSegment(path[i - 1] as Point, path[i] as Point, hw + CLEAR + hw, id, inner[layer]);
      hops.push({ net: name, a: ea.spot, b: eb.spot, layer, path });
      return [...ea.path, ...eb.path];
    }
    return null;
  }

  const rest = NETS.filter((n) => n.kind !== 'ground' && n.name !== '+3V3').map((n) => n.name);
  const span = (name: string) => {
    const pts = groups(name).flat();
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
  };
  // A seeded shuffle of the nets of similar span: a pass tries one order of them.
  let r = seed * 9301 + 49297;
  const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const keyed = rest.map((n) => ({ n, k: span(n) * (seed ? 0.6 + 0.8 * rand() : 1) }));
  const names = [...new Set([...order, ...keyed.sort((a, b) => a.k - b.k).map((x) => x.n)])];
  // Two phases, as a designer routes: first the nearest leg of every net (from the chip U10 where it
  // has a pin), then the other legs of the nets that have more, in the same order.
  const state = new Map<string, { joined: Point[]; left: Point[][] }>();
  for (const name of names) {
    const gs = groups(name).filter((g0) => g0.length);
    if (gs.length < 2) continue;
    const u10 = gs.findIndex((g0) => g0.some(([x, y]) => x >= 430 && x <= 581 && y >= 290 && y <= 441));
    state.set(name, { joined: [...(gs[u10 >= 0 ? u10 : 0] ?? [])], left: gs.filter((_, i) => i !== (u10 >= 0 ? u10 : 0)) });
  }
  const connect = (name: string, all: boolean): void => {
    const st = state.get(name);
    if (!st) return;
    const id = netId.get(name) ?? -1;
    const w = WIDTH[name] ?? 2;
    const { joined, left } = st;
    while (left.length) {
      left.sort((a, b) => near(a, joined) - near(b, joined));
      const next = left.shift() as Point[];
      // The closest pair: the detour a path may take is bounded by it.
      let best = Infinity;
      let pair: [Point, Point] = [next[0] as Point, joined[0] as Point];
      for (const a of next) for (const b of joined) {
        const d = octile(a, b);
        if (d < best) [best, pair] = [d, [a, b]];
      }
      const path = search(next, joined, id, 3 * best + 160);
      if (path) {
        lay(name, path, w);
        joined.push(...path, ...next);
      } else {
        // No good path on the back: down to the inner layer by a blind via near each end, from the
        // closest pair of points, else from the next ones (a few, apart from each other).
        const pairs: [Point, Point][] = [pair];
        const all = next.flatMap((p) => joined.map((q): [Point, Point, number] => [p, q, octile(p, q)])).sort((u, v) => u[2] - v[2]);
        for (const [p, q] of all) {
          if (pairs.length >= 5) break;
          if (pairs.every(([, b]) => Math.hypot(b[0] - q[0], b[1] - q[1]) > 24)) pairs.push([p, q]);
        }
        let hop: Point[] | null = null;
        for (const pr of pairs) if (!hop) hop = hopBetween(name, id, w, next, joined, pr);
        if (hop) joined.push(...hop, ...next);
        else failed.push(`${name}: ${next.map((p) => p.join(',')).join(' ')}`);
      }
      if (!all) return;
    }
  };
  for (const name of names) connect(name, false);
  for (const name of names) connect(name, true);
  // Last, the ground pins the pour could not reach in a previous pass: each its via, where there is room.
  for (const pin of groundVias) toPlane(pin, 'GND');
  return { traces, vias, failed, hops, grid: { owner, X0, Y0, W, inner } };
}

function octile([ax, ay]: Point, [bx, by]: Point): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

function near(a: Point[], b: Point[]): number {
  let best = Infinity;
  for (const [x, y] of a) for (const [u, v] of b) best = Math.min(best, Math.abs(x - u) + Math.abs(y - v));
  return best;
}
