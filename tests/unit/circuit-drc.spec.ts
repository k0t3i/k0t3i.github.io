// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ALL_VIAS, BACK_PADS, BACK_TRACES, DRC_CLEAR, FRONT_NET_PADS, FRONT_TRACES, HOPS, VIA, backVias, frontVias, grounded, pour, stitching, type NetPad } from '../../src/circuit/copper';
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

  it('the hops through an inner layer join two blind vias of one net, and never cross on their layer', () => {
    for (const h of HOPS) {
      expect([h.path[0], h.path.at(-1)], h.net).toEqual([h.a, h.b]);
      for (const end of [h.a, h.b]) expect(ALL_VIAS.some((v) => v.net === h.net && v.kind === 'blind' && v.x === end[0] && v.y === end[1]), `${h.net} at ${end.join(',')}`).toBe(true);
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
    // Planes: +3V3 (L3) and ground (L2): every blind via of theirs, every through-hole pad on them.
    for (const v of ALL_VIAS) if (v.kind === 'blind' && (v.net === '+3V3' || v.net === 'GND')) join(via(v), `plane ${v.net}`);
    for (const p of THROUGH_PADS) {
      const n = netOf(`${p.ref}.${p.pin}`)?.name;
      if (n === '+3V3' || n === 'GND') join(pad({ ...p, net: n }), `plane ${n}`);
    }
    for (const h of HOPS) join(`via ${h.a.join(',')}`, `via ${h.b.join(',')}`);
    // The pour: its islands joined to the ground plane, the ground pads of the back on them.
    const p = pour();
    const g = grounded(p, stitching(p));
    for (const q of BACK_PADS.filter((x) => x.net === 'GND' && x.layer === 'B')) {
      let on = false;
      for (let dy = -q.h / 2; dy <= q.h / 2 && !on; dy++) for (let dx = -q.w / 2; dx <= q.w / 2 && !on; dx++) on = g.has(p.island(q.x + dx, q.y + dy));
      expect(on, `${q.ref}.${q.pin} on a grounded pour`).toBe(true);
      join(pad(q), 'plane GND');
    }
    // Traces: each joins what its ends and its corners touch, on its face.
    for (const { traces, pads, vias } of faces) {
      for (const t of traces) {
        const key = `trace ${t.net} ${t.pts.map((q) => q.join(',')).join(' ')}`;
        for (const q of pads) if (q.net === t.net && segs(t).some((sg) => toPad(sg, q) < 0.01)) join(key, pad(q));
        for (const v of vias) {
          const back = { ...v, x: traces === FRONT_TRACES ? 1600 - v.x : v.x };
          if (v.net === t.net && t.pts.some((pt) => Math.hypot(pt[0] - v.x, pt[1] - v.y) <= viaR(v))) join(key, via(back));
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
