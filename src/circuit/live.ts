import { ALL_VIAS, BACK_PADS, BACK_TRACES, HOPS, VIA, backVias } from './copper';
import { BACK_PLACED, THROUGH_PADS, placedPads, pointsPath, type Point, type Trace } from './layout';
import { MASTER, linksOf } from './links';
import { NETS } from './netlist';

/**
 * The live layer of the back face (BackFace.vue), computed from the circuit and written to live.json
 * by npm run gen:circuit (tests/unit/circuit-live.spec.ts keeps the two equal):
 * - parts: the eleven parts of the bill of materials, their box on the face and their drawing (pads,
 *   body, mark of pin 1) in the units of their box, the parts they are linked to;
 * - nets: the traces of the back each part lights (by), and the ones where its current runs back
 *   (rev): from the part to what it is linked to, along the real copper; on a shared bus, a device
 *   lights only its way to the chip U10;
 * - marks: the pads and vias that light, in the second colour, for the parts linked to a lit one that
 *   are not in the table (J7, Y2, the status LEDs, the parts of the front seen from behind).
 */

export const BOM = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6'] as const;

/** Where the reference of each of them is printed, clear of its traces. */
const LABEL: Record<(typeof BOM)[number], LivePart['label']> = { U10: 'n', U11: 'w', U12: 'n', U13: 'e', U14: 'n', U15: 'n', U16: 'n', U17: 'w', U18: 'n', Y1: 'n', J6: 'w' };

export interface LivePart {
  ref: string;
  /** Its box on the face. */
  box: [number, number, number, number];
  look: string;
  /** The side its reference is printed on: above it, under it, at its left or at its right. */
  label: 'n' | 's' | 'w' | 'e';
  /** Its pads, body and mark of pin 1, from the top-left corner of its box. */
  pads: [number, number, number, number][];
  body: [number, number, number, number];
  mark: [number, number] | null;
  links: string;
}

export interface LiveNet {
  d: string;
  by: string;
  rev: string;
}

export interface LiveMark {
  x: number;
  y: number;
  w: number;
  h: number;
  round: boolean;
  by: string;
}

export interface Live {
  parts: LivePart[];
  nets: LiveNet[];
  marks: LiveMark[];
}

type Seg = [Point, Point];
const segs = (t: Trace): Seg[] => t.pts.slice(1).map((p, i) => [t.pts[i] as Point, p]);
const toSeg = ([px, py]: Point, [[ax, ay], [bx, by]]: Seg): number => {
  const [dx, dy] = [bx - ax, by - ay];
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
const inRect = ([x, y]: Point, p: { x: number; y: number; w: number; h: number }, m = 0.01) => Math.abs(x - p.x) <= p.w / 2 + m && Math.abs(y - p.y) <= p.h / 2 + m;

/** The traces of a net on the back that join a part to another one (shortest way), or all of them. */
function waysOf(net: string, from: string, to: string | null): Trace[] {
  const traces = BACK_TRACES.filter((t) => t.net === net);
  if (!to) return traces;
  // A graph of the copper of the net on the back: its traces, pads and vias (and its hops).
  const pads = BACK_PADS.filter((p) => p.net === net);
  const vias = ALL_VIAS.filter((v) => v.net === net && (v.kind === 'through' || v.layer === 'B'));
  const node = new Map<string, Set<string>>();
  const edge = (a: string, b: string) => {
    if (!node.has(a)) node.set(a, new Set());
    if (!node.has(b)) node.set(b, new Set());
    node.get(a)?.add(b);
    node.get(b)?.add(a);
  };
  traces.forEach((t, i) => {
    edge(`t${i}`, `t${i}`);
    pads.forEach((p, k) => {
      if (segs(t).some(([a, b]) => inRect(a, p) || inRect(b, p))) edge(`t${i}`, `p${k}`);
    });
    vias.forEach((v, k) => {
      const r = v.kind === 'through' ? VIA.through : VIA.blind;
      if ([t.pts[0], t.pts.at(-1)].some((e) => Math.hypot((e as Point)[0] - v.x, (e as Point)[1] - v.y) <= r)) edge(`t${i}`, `v${k}`);
    });
    traces.forEach((o, j) => {
      if (j !== i && [o.pts[0], o.pts.at(-1)].some((e) => segs(t).some((s) => toSeg(e as Point, s) < 0.01))) edge(`t${i}`, `t${j}`);
    });
  });
  vias.forEach((v, k) => pads.forEach((p, m) => inRect([v.x, v.y], p) && edge(`v${k}`, `p${m}`)));
  for (const h of HOPS.filter((x) => x.net === net)) {
    const a = vias.findIndex((v) => v.x === h.a[0] && v.y === h.a[1]);
    const b = vias.findIndex((v) => v.x === h.b[0] && v.y === h.b[1]);
    if (a >= 0 && b >= 0) edge(`v${a}`, `v${b}`);
  }
  const starts = pads.flatMap((p, k) => (p.ref === from ? [`p${k}`] : []));
  const goals = new Set(pads.flatMap((p, k) => (p.ref === to ? [`p${k}`] : [])));
  const prev = new Map<string, string | null>(starts.map((s) => [s, null]));
  const queue = [...starts];
  while (queue.length) {
    const n = queue.shift() as string;
    if (goals.has(n)) {
      const out: Trace[] = [];
      for (let c: string | null = n; c; c = prev.get(c) ?? null) if (c.startsWith('t')) out.push(traces[Number(c.slice(1))] as Trace);
      return out;
    }
    for (const m of node.get(n) ?? []) {
      if (!prev.has(m)) {
        prev.set(m, n);
        queue.push(m);
      }
    }
  }
  return [];
}

export function liveLayer(): Live {
  const by = new Map<string, { t: Trace; by: Set<string>; rev: Set<string> }>();
  const marks = new Map<string, LiveMark & { set: Set<string> }>();
  const mark = (x: number, y: number, w: number, h: number, round: boolean, ref: string) => {
    const key = `${x},${y},${w},${h}`;
    const m = marks.get(key) ?? { x, y, w, h, round, by: '', set: new Set<string>() };
    m.set.add(ref);
    marks.set(key, m);
  };
  const parts: LivePart[] = [];
  for (const ref of BOM) {
    const p = BACK_PLACED.find((q) => q.part.ref === ref);
    if (!p) throw new Error(`${ref} is not placed`);
    const centre: Point = [p.box.x + p.box.w / 2, p.box.y + p.box.h / 2];
    const links = linksOf(ref);
    for (const l of links) {
      for (const net of l.nets) {
        const bus = NETS.find((n) => n.name === net)?.bus;
        const ways = waysOf(net, ref, bus && ref !== MASTER ? MASTER : null);
        for (const t of ways) {
          const key = pointsPath(t.pts);
          const e = by.get(key) ?? { t, by: new Set<string>(), rev: new Set<string>() };
          // The current leaves the part: a trace drawn towards it runs backwards.
          const [a, b] = [t.pts[0] as Point, t.pts.at(-1) as Point];
          if (Math.hypot(a[0] - centre[0], a[1] - centre[1]) <= Math.hypot(b[0] - centre[0], b[1] - centre[1])) e.by.add(ref);
          else e.rev.add(ref);
          by.set(key, e);
        }
        // The parts out of the table it reaches: their pads, or the vias that take the net to the front.
        if (bus && ref !== MASTER) continue;
        if (BOM.includes(l.to as (typeof BOM)[number])) continue;
        for (const q of [...BACK_PADS.filter((x) => x.ref === l.to && x.layer === 'B'), ...THROUGH_PADS.filter((x) => x.ref === l.to && BACK_PADS.find((y) => y.ref === x.ref && y.pin === x.pin)?.net === net)]) {
          mark(q.x, q.y, q.w, q.h, Boolean(q.round), ref);
        }
        for (const v of backVias().filter((x) => x.kind === 'through' && x.net === net)) mark(v.x, v.y, 2 * VIA.through, 2 * VIA.through, true, ref);
      }
    }
    parts.push({
      ref,
      box: [p.box.x, p.box.y, p.box.w, p.box.h],
      look: p.fp.look,
      label: LABEL[ref],
      // Its pads as seen: the exposed pad of a QFN is under its body.
      pads: placedPads(p)
        .filter((q) => !(q.w > 30 && q.h > 30))
        .map((q) => [q.x - p.box.x - q.w / 2, q.y - p.box.y - q.h / 2, q.w, q.h]),
      body: bodyBox(p),
      mark: p.fp.mark ? markOf(p) : null,
      links: links.map((l) => l.to).join(' '),
    });
  }
  return {
    parts,
    nets: [...by.values()].map((e) => ({ d: pointsPath(e.t.pts), by: [...e.by].join(' '), rev: [...e.rev].join(' ') })),
    marks: [...marks.values()].map(({ set, ...m }) => ({ ...m, by: [...set].join(' ') })),
  };
}

/** The mark of pin 1, turned with the part. */
function markOf(p: (typeof BACK_PLACED)[number]): [number, number] {
  const m = p.fp.mark ?? { x: 0, y: 0 };
  const { w, h } = p.fp;
  const [x, y] = p.rot === 90 ? [h - m.y, m.x] : p.rot === 180 ? [w - m.x, h - m.y] : p.rot === 270 ? [m.y, w - m.x] : [m.x, m.y];
  return [x, y];
}

function bodyBox(p: (typeof BACK_PLACED)[number]): [number, number, number, number] {
  const b = p.fp.body;
  const quarter = p.rot === 90 || p.rot === 270;
  const [bw, bh] = quarter ? [b.h, b.w] : [b.w, b.h];
  const [bx, by] = p.rot === 90 ? [p.box.w - b.y - b.h, b.x] : p.rot === 180 ? [p.box.w - b.x - b.w, p.box.h - b.y - b.h] : p.rot === 270 ? [b.y, p.box.h - b.x - b.w] : [b.x, b.y];
  return [bx, by, bw, bh];
}
