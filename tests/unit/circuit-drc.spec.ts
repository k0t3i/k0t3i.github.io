// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALL_VIAS, BACK_PADS, BACK_TRACE_CLEAR, BACK_TRACES, BODY_MARGIN, DRC_CLEAR, FRONT_NET_PADS, FRONT_TRACES, HOPS, VIA, backVias, frontVias, grounded, pour, stitching, type NetPad } from '../../src/circuit/copper';
import { BACK_PLACED, CIRCUIT, JOINED, PLACE, THROUGH_PADS, placedPads, type Point, type Trace, type Via } from '../../src/circuit/layout';
import { NETS, PARTS, netOf } from '../../src/circuit/netlist';

/*
 * The design rules check of the copper of the board (spec 4.10): 45° routing, clearances, every
 * trace ending on a pad or a via of its net, no crossing on a face (a change of layer is a via), and
 * the copper joining the pins of each net as the netlist says, and nothing else.
 */

type Seg = [Point, Point];
const segs = (t: Trace): Seg[] => t.pts.slice(1).map((p, i) => [t.pts[i] as Point, p]);
const toSeg = ([px, py]: Point, [[ax, ay], [bx, by]]: Seg): number => {
  const [dx, dy] = [bx - ax, by - ay];
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};
function between(s: Seg, t: Seg): number {
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const [a, b] = s;
  const [c, d] = t;
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(toSeg(a, t), toSeg(b, t), toSeg(c, s), toSeg(d, s));
}
/** Distance from a segment to a pad (its rectangle, or its circle). */
function toPad(s: Seg, p: NetPad): number {
  if (p.round) return Math.max(0, toSeg([p.x, p.y], s) - p.w / 2);
  const [[ax, ay], [bx, by]] = s;
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2));
  let best = Infinity;
  for (let k = 0; k <= n; k++) {
    const [x, y] = [ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n];
    best = Math.min(best, Math.hypot(Math.max(Math.abs(x - p.x) - p.w / 2, 0), Math.max(Math.abs(y - p.y) - p.h / 2, 0)));
  }
  return best;
}
const inPad = ([x, y]: Point, p: NetPad) => (p.round ? Math.hypot(x - p.x, y - p.y) <= p.w / 2 + 0.01 : Math.abs(x - p.x) <= p.w / 2 + 0.01 && Math.abs(y - p.y) <= p.h / 2 + 0.01);
const viaR = (v: Via) => (v.kind === 'through' ? VIA.through : VIA.blind);

/*
 * The stack, from the front: F, L2 (the ground plane), L3 (the +3V3 plane), B. A through via reaches
 * both inner layers; a blind via of the front reaches L2, and L3 too for +3V3; a blind via of the back
 * reaches L3, and L2 too for ground (the stitching of the pour and the exposed pad of U10 included)
 * and for the ends of a hop on L2.
 */
const PLANE = { 2: 'GND', 3: '+3V3' } as const;
const hw = 1;
const hopOf = (v: Via) => HOPS.find((h) => h.net === v.net && [h.a, h.b].some(([x, y]) => x === v.x && y === v.y));
function reach(v: Via): (2 | 3)[] {
  if (v.kind === 'through') return [2, 3];
  if (v.layer === 'F') return v.net === '+3V3' ? [2, 3] : [2];
  if (v.net === 'GND') return [2, 3];
  if (v.net === '+3V3') return [3];
  return hopOf(v)?.layer === 2 ? [2, 3] : [3];
}
const stitchVias = (): Via[] => stitching(pour()).map(([x, y]): Via => ({ net: 'GND', x, y, kind: 'blind', layer: 'B' }));

/**
 * An inner plane as made: the whole board inside its edge, less an antipad round every via and
 * through pad of another net that reaches the layer, and a slot round every hop of another net on
 * it; its islands labelled by flood fill.
 */
function plane(layer: 2 | 3, vias: Via[]): (x: number, y: number) => number {
  const net = PLANE[layer];
  const [x0, y0, w, h] = [24, 24, 1552, 852];
  const grid = new Uint8Array(w * h).fill(1);
  const cut = (test: (x: number, y: number) => boolean, bx0: number, by0: number, bx1: number, by1: number) => {
    for (let y = Math.max(y0, Math.floor(by0)); y < Math.min(y0 + h, Math.ceil(by1) + 1); y++) {
      for (let x = Math.max(x0, Math.floor(bx0)); x < Math.min(x0 + w, Math.ceil(bx1) + 1); x++) if (test(x, y)) grid[(y - y0) * w + (x - x0)] = 0;
    }
  };
  for (const v of vias.filter((q) => q.net !== net && reach(q).includes(layer))) {
    const r = viaR(v) + DRC_CLEAR;
    cut((x, y) => Math.hypot(x - v.x, y - v.y) < r, v.x - r, v.y - r, v.x + r, v.y + r);
  }
  for (const p of THROUGH_PADS.filter((q) => netOf(`${q.ref}.${q.pin}`)?.name !== net)) {
    const q = { ...p, net: undefined };
    cut((x, y) => toPad([[x, y], [x, y]], q) < DRC_CLEAR, p.x - p.w / 2 - 3, p.y - p.h / 2 - 3, p.x + p.w / 2 + 3, p.y + p.h / 2 + 3);
  }
  for (const hp of HOPS.filter((q) => q.layer === layer && q.net !== net)) {
    for (const s of hp.path.slice(1).map((q, k): Seg => [hp.path[k] as Point, q])) {
      const r = hw + DRC_CLEAR;
      cut((x, y) => toSeg([x, y], s) < r, Math.min(s[0][0], s[1][0]) - r, Math.min(s[0][1], s[1][1]) - r, Math.max(s[0][0], s[1][0]) + r, Math.max(s[0][1], s[1][1]) + r);
    }
  }
  const label = new Int32Array(w * h);
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    if (!grid[i] || label[i]) continue;
    label[i] = ++n;
    const stack = [i];
    while (stack.length) {
      const c = stack.pop() as number;
      const [cx, cy] = [c % w, Math.floor(c / w)];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as Point[]) {
        const [nx, ny] = [cx + dx, cy + dy];
        const j = ny * w + nx;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && grid[j] && !label[j]) {
          label[j] = n;
          stack.push(j);
        }
      }
    }
  }
  return (x, y) => {
    const [cx, cy] = [Math.round(x) - x0, Math.round(y) - y0];
    return cx >= 0 && cy >= 0 && cx < w && cy < h ? (label[cy * w + cx] ?? 0) : 0;
  };
}

const faces = [
  { face: 'back', traces: BACK_TRACES, pads: BACK_PADS, vias: backVias() },
  { face: 'front', traces: FRONT_TRACES, pads: FRONT_NET_PADS, vias: frontVias() },
] as const;

describe('the copper of the board', () => {
  it('every segment is horizontal, vertical or at 45°, between integer points', () => {
    for (const { face, traces } of faces) {
      for (const t of traces) {
        for (const [x, y] of t.pts) expect(Number.isInteger(x) && Number.isInteger(y), `${face} ${t.net} ${x},${y}`).toBe(true);
        for (const [[ax, ay], [bx, by]] of segs(t)) {
          const [dx, dy] = [Math.abs(bx - ax), Math.abs(by - ay)];
          expect(dx === 0 || dy === 0 || dx === dy, `${face} ${t.net} ${ax},${ay} ${bx},${by}`).toBe(true);
          expect(dx + dy, `${face} ${t.net}: a segment of no length`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('every trace ends on a pad or a via of its net, or on its own net', () => {
    for (const { face, traces, pads, vias } of faces) {
      for (const t of traces) {
        for (const end of [t.pts[0], t.pts.at(-1)] as Point[]) {
          const onPad = pads.some((p) => p.net === t.net && inPad(end, p));
          const onVia = vias.some((v) => v.net === t.net && Math.hypot(end[0] - v.x, end[1] - v.y) <= viaR(v));
          const onTrace = traces.some((o) => o !== t && o.net === t.net && segs(o).some((s) => toSeg(end, s) < 0.01));
          expect(onPad || onVia || onTrace, `${face} ${t.net} ends at ${end.join(',')} on nothing`).toBe(true);
        }
      }
    }
  });

  it('copper of two nets never crosses nor comes closer than the clearance, on each face', () => {
    for (const { face, traces, pads, vias } of faces) {
      for (const [i, a] of traces.entries()) {
        for (const b of traces.slice(i + 1)) {
          if (a.net === b.net) continue;
          let gap = Infinity;
          for (const s of segs(a)) for (const t of segs(b)) gap = Math.min(gap, between(s, t));
          expect(gap - (a.w + b.w) / 2, `${face}: ${a.net} and ${b.net}`).toBeGreaterThanOrEqual(DRC_CLEAR);
        }
        for (const p of pads) {
          if (p.net === a.net) continue;
          const gap = Math.min(...segs(a).map((s) => toPad(s, p)));
          expect(gap - a.w / 2, `${face}: ${a.net} by ${p.ref}.${p.pin}`).toBeGreaterThanOrEqual(DRC_CLEAR);
        }
        for (const v of vias) {
          if (v.net === a.net) continue;
          const gap = Math.min(...segs(a).map((s) => toSeg([v.x, v.y], s)));
          expect(gap - a.w / 2 - viaR(v), `${face}: ${a.net} by a via of ${v.net} at ${v.x},${v.y}`).toBeGreaterThanOrEqual(DRC_CLEAR);
        }
      }
      for (const [i, v] of vias.entries()) {
        for (const w of vias.slice(i + 1)) {
          if (v.net === w.net) continue;
          expect(Math.hypot(v.x - w.x, v.y - w.y) - viaR(v) - viaR(w), `${face}: vias of ${v.net} and ${w.net}`).toBeGreaterThanOrEqual(DRC_CLEAR);
        }
        for (const p of pads) {
          if (p.net === v.net || (p.net === undefined && false)) continue;
          const d = p.round ? Math.hypot(v.x - p.x, v.y - p.y) - p.w / 2 : Math.hypot(Math.max(Math.abs(v.x - p.x) - p.w / 2, 0), Math.max(Math.abs(v.y - p.y) - p.h / 2, 0));
          expect(d - viaR(v), `${face}: a via of ${v.net} by ${p.ref}.${p.pin}`).toBeGreaterThanOrEqual(DRC_CLEAR);
        }
      }
    }
  });

  it('the back breathes: two traces keep twice the clearance, and a trace keeps clear of the body of a package it has no pin on', () => {
    for (const [i, a] of BACK_TRACES.entries()) {
      for (const b of BACK_TRACES.slice(i + 1)) {
        if (a.net === b.net) continue;
        let gap = Infinity;
        for (const s of segs(a)) for (const t of segs(b)) gap = Math.min(gap, between(s, t));
        expect(gap - (a.w + b.w) / 2, `${a.net} and ${b.net}`).toBeGreaterThanOrEqual(BACK_TRACE_CLEAR);
      }
    }
    expect(BACK_TRACE_CLEAR).toBe(2 * DRC_CLEAR);
    for (const p of BACK_PLACED) {
      const nets = new Set(placedPads(p).map((q) => netOf(`${q.ref}.${q.pin}`)?.name));
      const b = p.fp.body;
      const quarter = p.rot === 90 || p.rot === 270;
      const [bw, bh] = quarter ? [b.h, b.w] : [b.w, b.h];
      const [bx, by] = p.rot === 90 ? [p.box.w - b.y - b.h, b.x] : p.rot === 180 ? [p.box.w - b.x - b.w, p.box.h - b.y - b.h] : p.rot === 270 ? [b.y, p.box.h - b.x - b.w] : [b.x, b.y];
      const body = { ref: p.part.ref, pin: 'body', x: p.x + bx + bw / 2, y: p.y + by + bh / 2, w: bw, h: bh, layer: 'B' as const, net: undefined };
      for (const t of BACK_TRACES.filter((x) => !nets.has(x.net))) {
        const gap = Math.min(...segs(t).map((s) => toPad(s, body)));
        expect(gap - t.w / 2, `${t.net} by the body of ${p.part.ref}`).toBeGreaterThanOrEqual(BODY_MARGIN);
      }
    }
  });

  it('no trace of the back runs under a part, and none leaves the circuit (nothing under the table)', () => {
    for (const t of BACK_TRACES) {
      for (const [x, y] of t.pts) {
        expect(x >= CIRCUIT.x && x <= CIRCUIT.x + CIRCUIT.w && y >= 56 && y <= CIRCUIT.y + CIRCUIT.h, `${t.net} at ${x},${y}`).toBe(true);
      }
      for (const p of BACK_PLACED) {
        const own = placedPads(p).filter((q) => netOf(`${q.ref}.${q.pin}`)?.name === t.net);
        const b = p.fp.body;
        const quarter = p.rot === 90 || p.rot === 270;
        // The body of the part on the face, a little inside its outline.
        const [bw, bh] = quarter ? [b.h, b.w] : [b.w, b.h];
        const [bx, by] = p.rot === 90 ? [p.box.w - b.y - b.h, b.x] : p.rot === 180 ? [p.box.w - b.x - b.w, p.box.h - b.y - b.h] : p.rot === 270 ? [b.y, p.box.h - b.x - b.w] : [b.x, b.y];
        const body = { x: p.x + bx + 1, y: p.y + by + 1, w: bw - 2, h: bh - 2 };
        for (const [a, c] of segs(t)) {
          const n = Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]));
          for (let k = 0; k <= n; k++) {
            const q: Point = [a[0] + ((c[0] - a[0]) * k) / n, a[1] + ((c[1] - a[1]) * k) / n];
            const under = q[0] > body.x && q[0] < body.x + body.w && q[1] > body.y && q[1] < body.y + body.h;
            if (under) expect(own.some((o) => inPad(q, { ...o, net: t.net })), `${t.net} under ${p.part.ref} at ${q.join(',')}`).toBe(true);
          }
        }
      }
    }
    for (const v of backVias()) expect(v.x >= CIRCUIT.x && v.x <= CIRCUIT.x + CIRCUIT.w, `via of ${v.net} at ${v.x}`).toBe(true);
  });

  it('the hops through an inner layer join two vias or through-hole pads of one net, and never cross on their layer', () => {
    for (const h of HOPS) {
      expect([h.path[0], h.path.at(-1)], h.net).toEqual([h.a, h.b]);
      for (const end of [h.a, h.b]) {
        const via = ALL_VIAS.some((v) => v.net === h.net && v.x === end[0] && v.y === end[1] && (v.kind === 'through' || v.layer === 'B'));
        const pad = THROUGH_PADS.some((p) => netOf(`${p.ref}.${p.pin}`)?.name === h.net && Math.round(p.x) === end[0] && Math.round(p.y) === end[1]);
        expect(via || pad, `${h.net} at ${end.join(',')}`).toBe(true);
      }
    }
    for (const [i, a] of HOPS.entries()) {
      for (const b of HOPS.slice(i + 1)) {
        if (a.net === b.net || a.layer !== b.layer) continue;
        let gap = Infinity;
        for (const s of a.path.slice(1).map((q, k): Seg => [a.path[k] as Point, q])) for (const t of b.path.slice(1).map((q, k): Seg => [b.path[k] as Point, q])) gap = Math.min(gap, between(s, t));
        expect(gap, `${a.net} / ${b.net} on L${a.layer}`).toBeGreaterThan(0);
      }
    }
  });

  it('the hops run at 45° on their inner layer, clear of every via, through pad and hop of another net that reaches it', () => {
    const stitch = stitchVias();
    const issues: string[] = [];
    for (const h of HOPS) {
      const ss = h.path.slice(1).map((q, k): Seg => [h.path[k] as Point, q]);
      for (const [[ax, ay], [bx, by]] of ss) {
        const [dx, dy] = [Math.abs(bx - ax), Math.abs(by - ay)];
        if (!(Number.isInteger(ax + ay + bx + by) && (dx === 0 || dy === 0 || dx === dy))) issues.push(`${h.net} L${h.layer} ${ax},${ay} ${bx},${by} not at 45°`);
      }
      for (const v of [...ALL_VIAS, ...stitch]) {
        if (v.net === h.net || !reach(v).includes(h.layer)) continue;
        const gap = Math.min(...ss.map((s) => toSeg([v.x, v.y], s))) - viaR(v) - hw;
        if (gap < DRC_CLEAR) issues.push(`${h.net} L${h.layer} / via ${v.net} at ${v.x},${v.y}: ${gap.toFixed(2)}`);
      }
      for (const p of THROUGH_PADS) {
        const n = netOf(`${p.ref}.${p.pin}`)?.name;
        if (n === h.net) continue;
        const gap = Math.min(...ss.map((s) => toPad(s, { ...p, net: n }))) - hw;
        if (gap < DRC_CLEAR) issues.push(`${h.net} L${h.layer} / ${p.ref}.${p.pin} (${n}): ${gap.toFixed(2)}`);
      }
    }
    for (const [i, a] of HOPS.entries()) {
      for (const b of HOPS.slice(i + 1)) {
        if (a.net === b.net || a.layer !== b.layer) continue;
        let gap = Infinity;
        for (const s of a.path.slice(1).map((q, k): Seg => [a.path[k] as Point, q])) for (const t of b.path.slice(1).map((q, k): Seg => [b.path[k] as Point, q])) gap = Math.min(gap, between(s, t));
        if (gap - 2 * hw < DRC_CLEAR) issues.push(`${a.net} / ${b.net} on L${a.layer}: ${(gap - 2 * hw).toFixed(2)}`);
      }
    }
    // Two vias of two nets that meet on an inner layer (one from the front, one from the back) keep the clearance there too.
    const all = [...ALL_VIAS, ...stitch];
    for (const [i, u] of all.entries()) {
      for (const v of all.slice(i + 1)) {
        if (u.net === v.net || !reach(u).some((l) => reach(v).includes(l))) continue;
        const gap = Math.hypot(u.x - v.x, u.y - v.y) - viaR(u) - viaR(v);
        if (gap < DRC_CLEAR) issues.push(`via ${u.net} at ${u.x},${u.y} / via ${v.net} at ${v.x},${v.y}: ${gap.toFixed(2)}`);
      }
    }
    expect(issues).toEqual([]);
  });

  it('the parts sit apart, each decoupling capacitor by the pin it serves', () => {
    for (const [i, p] of BACK_PLACED.entries()) {
      for (const q of BACK_PLACED.slice(i + 1)) {
        const apart = p.box.x + p.box.w <= q.box.x || q.box.x + q.box.w <= p.box.x || p.box.y + p.box.h <= q.box.y || q.box.y + q.box.h <= p.box.y;
        expect(apart, `${p.part.ref} / ${q.part.ref}`).toBe(true);
      }
    }
    expect(Object.keys(PLACE).sort()).toEqual(BACK_PLACED.map((p) => p.part.ref).sort());
    for (const part of PARTS.filter((p) => p.decoupling)) {
      for (const [pin, caps] of Object.entries(part.decoupling ?? {})) {
        const at = [...BACK_PADS, ...FRONT_NET_PADS.map((p) => ({ ...p, x: 1600 - p.x }))].find((p) => p.ref === part.ref && p.pin === pin);
        for (const c of caps) {
          const cap = BACK_PADS.find((p) => p.ref === c && p.pin === '1');
          expect(at && cap && Math.hypot(at.x - cap.x, at.y - cap.y) < 90, `${c} by ${part.ref}.${pin}`).toBe(true);
        }
      }
    }
  });

  it('the copper joins the pins of each net, and only them', () => {
    // Union-find over every piece of copper: pads (both faces for a through-hole one), vias (a
    // through via on both faces, a blind one to its plane or its hop), traces, the planes, the pour.
    const parent = new Map<string, string>();
    const find = (k: string): string => {
      const p = parent.get(k) ?? k;
      if (p === k) return k;
      const r = find(p);
      parent.set(k, r);
      return r;
    };
    const join = (a: string, b: string) => parent.set(find(a), find(b));
    const pad = (p: NetPad) => `pad ${p.ref}.${p.pin}`;
    const via = (v: Via) => `via ${v.x},${v.y}`;
    for (const [pin, rep] of Object.entries(JOINED)) join(`pad ${pin}`, `pad ${rep}`);
    // The planes, ground on L2 and +3V3 on L3, each cut by its antipads and slots: every via and
    // through-hole pad of its net joins the island it lands in.
    const p = pour();
    const vias = [...ALL_VIAS, ...stitchVias()];
    for (const layer of [2, 3] as const) {
      const island = plane(layer, vias);
      const net = PLANE[layer];
      for (const v of vias.filter((q) => q.net === net && reach(q).includes(layer))) join(via(v), `L${layer} island ${island(v.x, v.y)}`);
      for (const q of THROUGH_PADS.filter((t) => netOf(`${t.ref}.${t.pin}`)?.name === net)) join(pad({ ...q, net }), `L${layer} island ${island(q.x, q.y)}`);
    }
    // A hop joins its two vias, and whatever copper it touches on its layer, of any net.
    for (const h of HOPS) {
      const ss = h.path.slice(1).map((q, k): Seg => [h.path[k] as Point, q]);
      const key = `hop ${h.net} ${h.a.join(',')}`;
      join(key, `via ${h.a.join(',')}`);
      join(key, `via ${h.b.join(',')}`);
      for (const v of vias) if (reach(v).includes(h.layer) && ss.some((s) => toSeg([v.x, v.y], s) <= viaR(v) + hw)) join(key, via(v));
      for (const q of THROUGH_PADS) if (ss.some((s) => toPad(s, { ...q, net: undefined }) <= hw)) join(key, `pad ${q.ref}.${q.pin}`);
      for (const o of HOPS) {
        if (o === h || o.layer !== h.layer) continue;
        const os = o.path.slice(1).map((q, k): Seg => [o.path[k] as Point, q]);
        if (ss.some((s) => os.some((t) => between(s, t) <= 2 * hw))) join(key, `hop ${o.net} ${o.a.join(',')}`);
      }
    }
    // The pour: its grounded islands, each joined to the ground vias and through pads in it; the ground pads of the back on them.
    const g = grounded(p, stitching(p));
    for (const v of vias.filter((q) => q.net === 'GND' && (q.kind === 'through' || q.layer === 'B'))) if (p.island(v.x, v.y)) join(via(v), `pour ${p.island(v.x, v.y)}`);
    for (const q of THROUGH_PADS.filter((t) => netOf(`${t.ref}.${t.pin}`)?.name === 'GND')) if (p.island(q.x, q.y)) join(`pad ${q.ref}.${q.pin}`, `pour ${p.island(q.x, q.y)}`);
    for (const q of BACK_PADS.filter((x) => x.net === 'GND' && x.layer === 'B')) {
      let on = 0;
      for (let dy = -q.h / 2; dy <= q.h / 2 && !on; dy++) for (let dx = -q.w / 2; dx <= q.w / 2 && !on; dx++) if (g.has(p.island(q.x + dx, q.y + dy))) on = p.island(q.x + dx, q.y + dy);
      expect(on, `${q.ref}.${q.pin} on a grounded pour`).toBeGreaterThan(0);
      join(pad(q), `pour ${on}`);
    }
    // Traces: each joins what its ends and its corners touch, on its face.
    for (const { traces, pads, vias } of faces) {
      for (const t of traces) {
        const key = `trace ${t.net} ${t.pts.map((q) => q.join(',')).join(' ')}`;
        for (const q of pads) if (q.net === t.net && segs(t).some((sg) => toPad(sg, q) < 0.01)) join(key, pad(q));
        for (const v of vias) {
          const back = { ...v, x: traces === FRONT_TRACES ? 1600 - v.x : v.x };
          // A via on a trace (its end, or on its way) joins it.
          if (v.net === t.net && segs(t).some((sg) => toSeg([v.x, v.y], sg) <= viaR(v))) join(key, via(back));
        }
        for (const o of traces) if (o.net === t.net && o !== t && [o.pts[0], o.pts.at(-1)].some((e) => segs(t).some((s) => toSeg(e as Point, s) < 0.01))) join(key, `trace ${o.net} ${o.pts.map((q) => q.join(',')).join(' ')}`);
      }
      // A via in a pad (under a socket, or filled in the pad of a chip) joins it.
      for (const v of vias) for (const q of pads) if (q.net === v.net && inPad([v.x, v.y], q)) join(via(traces === FRONT_TRACES ? { ...v, x: 1600 - v.x } : v), pad(q));
    }
    for (const n of NETS) {
      const roots = new Set(n.pins.map((pin) => find(`pad ${pin}`)));
      expect(roots.size, `${n.name}: ${n.pins.map((pin) => `${pin} ${find(`pad ${pin}`).slice(0, 24)}`).join(' / ')}`).toBe(1);
    }
    // And no two nets joined.
    const of = new Map<string, string>();
    for (const n of NETS) {
      const r = find(`pad ${n.pins[0]}`);
      expect(of.get(r), `${n.name} joined to ${of.get(r)}`).toBeUndefined();
      of.set(r, n.name);
    }
  });
});
