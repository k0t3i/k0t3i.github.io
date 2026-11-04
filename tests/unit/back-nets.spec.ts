// @vitest-environment node
// Node, not happy-dom: the oracle (tests/helpers/copy.ts) reads site.json from a file URL.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BACK_NETS as ORACLE_NETS, EN, FR } from '../helpers/copy';
import { BACK_NETS, BACK_PARTS, BACK_REFS, CIRCUIT_VIEW, linkedTo, netPoints, type BackPart } from '../../src/content/backNets';
import { FIDUCIALS, FRONT_PADS, HOLES, POUR, STITCH, VIA, labelRoom } from '../../src/content/backCopper';
import { BACK_PASSIVES, PASSIVE_REF, passiveBox, passiveRef, passiveUse } from '../../src/content/backPassives';
import { PACKAGES, padCenter } from '../../src/lib/packages';
import { PASSIVES, PASSIVE_IDS } from '../../src/lib/passives';
import { en } from '../../src/content/en';
import { fr } from '../../src/content/fr';

type Point = [number, number];
type Box = { x: number; y: number; w: number; h: number };

const part = (ref: string): BackPart => {
  const found = BACK_PARTS.find((p) => p.ref === ref);
  if (!found) throw new Error(`no part ${ref}`);
  return found;
};
/** The box of a part on the face, pads included. */
const footprint = (p: BackPart): Box => ({ x: p.x, y: p.y, w: PACKAGES[p.pkg].w, h: PACKAGES[p.pkg].h });
const body = (p: BackPart): Box => {
  const b = PACKAGES[p.pkg].body;
  return { x: p.x + b.x, y: p.y + b.y, w: b.w, h: b.h };
};
const grow = (b: Box, m: number): Box => ({ x: b.x - m, y: b.y - m, w: b.w + 2 * m, h: b.h + 2 * m });
const apart = (a: Box, b: Box): boolean => a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
const segments = (pts: Point[]): [Point, Point][] => pts.slice(1).map((p, i) => [pts[i] as Point, p]);

/** Distance from a point to a segment. */
function toSegment([px, py]: Point, [[ax, ay], [bx, by]]: [Point, Point]): number {
  const [dx, dy] = [bx - ax, by - ay];
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
/** Distance between two segments (0 when they cross). */
function between(s: [Point, Point], t: [Point, Point]): number {
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const [a, b] = s;
  const [c, d] = t;
  if (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0) return 0;
  return Math.min(toSegment(a, t), toSegment(b, t), toSegment(c, s), toSegment(d, s));
}
/** Whether a segment runs through a box (sampled every unit: the segments are a few hundred units at most). */
function crosses([[ax, ay], [bx, by]]: [Point, Point], box: Box): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
  for (let i = 0; i <= n; i++) {
    const [x, y] = [ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n];
    if (x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h) return true;
  }
  return false;
}

describe('the nets of the back face', () => {
  it('nets match the annex', () => {
    expect(BACK_NETS.map((n) => [n.id, n.from, n.to])).toEqual(ORACLE_NETS);
    // The column « Relié à », derived from the nets: the neighbours of each part, in order.
    for (const copy of [FR, EN]) {
      expect(BACK_REFS.map((ref) => [ref, linkedTo(ref).join(' · ')])).toEqual(copy.back.rows.map((r) => [r[0], r[3]]));
    }
  });

  it('every BOM ref has one part and at least one net', () => {
    for (const content of [fr, en]) expect([...BACK_REFS]).toEqual(content.back.bom.rows.map((r) => r.ref));
    expect(BACK_PARTS.map((p) => p.ref).sort()).toEqual([...BACK_REFS]);
    for (const ref of BACK_REFS) expect(BACK_NETS.some((n) => n.from === ref || n.to === ref), ref).toBe(true);
    // One package of each kind.
    expect(new Set(BACK_PARTS.map((p) => p.pkg)).size).toBe(BACK_PARTS.length);
  });

  it('every net runs at 45° from a pad of one of its parts to a pad of the other', () => {
    for (const net of BACK_NETS) {
      const pts = netPoints(net);
      for (const [x, y] of pts) expect(Number.isInteger(x) && Number.isInteger(y), `${net.id} ${x},${y}`).toBe(true);
      for (const [[ax, ay], [bx, by]] of segments(pts)) {
        const [dx, dy] = [Math.abs(bx - ax), Math.abs(by - ay)];
        expect(dx === 0 || dy === 0 || dx === dy, `${net.id} ${ax},${ay} ${bx},${by}`).toBe(true);
        expect(dx + dy, `${net.id}: a segment of no length`).toBeGreaterThan(0);
      }
      const [from, to] = [part(net.from), part(net.to)];
      const [p, q] = [padCenter(from.pkg, net.pins[0]), padCenter(to.pkg, net.pins[1])];
      expect(pts[0], net.id).toEqual([from.x + p[0], from.y + p[1]]);
      expect(pts.at(-1), net.id).toEqual([to.x + q[0], to.y + q[1]]);
    }
  });

  it('the nets never cross or touch, and keep clear of the parts they do not link', () => {
    for (const [i, a] of BACK_NETS.entries()) {
      for (const b of BACK_NETS.slice(i + 1)) {
        let gap = Infinity;
        for (const s of segments(netPoints(a))) for (const t of segments(netPoints(b))) gap = Math.min(gap, between(s, t));
        expect(gap, `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(10);
      }
      for (const p of BACK_PARTS) {
        // No trace runs under a body; past the parts it does not link, it keeps 6 units of clearance.
        const keep = p.ref === a.from || p.ref === a.to ? body(p) : grow(footprint(p), 6);
        for (const s of segments(netPoints(a))) expect(crosses(s, keep), `${a.id} through ${p.ref}`).toBe(false);
      }
      // Clear of the through-hole pads of the front face and of the mounting holes.
      for (const [x, y, r] of [...FRONT_PADS.map((d) => [d.x, d.y, d.r] as const), ...HOLES.map(([x, y]) => [x, y, 15] as const)]) {
        for (const s of segments(netPoints(a))) expect(toSegment([x, y], s), `${a.id} by ${x},${y}`).toBeGreaterThanOrEqual(r + 8);
      }
    }
  });

  it('the stylesheet places the parts and the window of the flowing board as the data does', () => {
    const css = readFileSync(new URL('../../src/styles/back.css', import.meta.url), 'utf8');
    const vars = (block: string) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(-?\d+);/g)].map(([, k, v]) => [k, Number(v)]));
    for (const p of BACK_PARTS) {
      const block = css.match(new RegExp(String.raw`\.back-part\[data-ref="${p.ref}"\] \{([^}]*)\}`))?.[1] ?? '';
      expect(vars(block), p.ref).toEqual({ x: p.x, y: p.y, w: PACKAGES[p.pkg].w, h: PACKAGES[p.pkg].h });
    }
    const view = vars(css.match(/\.back__circuit \{([^}]*)\}/)?.[1] ?? '');
    expect(view).toEqual({ 'view-x': CIRCUIT_VIEW.x, 'view-y': CIRCUIT_VIEW.y, 'view-w': CIRCUIT_VIEW.w, 'view-h': CIRCUIT_VIEW.h });
  });

  it('the parts sit apart, inside the circuit, clear of the through-hole pads', () => {
    const view = grow(CIRCUIT_VIEW, -12);
    for (const [i, p] of BACK_PARTS.entries()) {
      const box = footprint(p);
      expect(box.x >= view.x && box.y >= view.y && box.x + box.w <= view.x + view.w && box.y + box.h <= view.y + view.h, `${p.ref} inside`).toBe(true);
      for (const q of BACK_PARTS.slice(i + 1)) expect(apart(grow(box, 24), footprint(q)), `${p.ref} / ${q.ref}`).toBe(true);
      for (const d of FRONT_PADS) expect(apart(grow(box, 10), { x: d.x - d.r, y: d.y - d.r, w: 2 * d.r, h: 2 * d.r }), `${p.ref} by ${d.x},${d.y}`).toBe(true);
    }
  });
});

describe('the passive parts of the back face', () => {
  const within = (a: Box, b: Box): boolean => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const pad = (d: { x: number; y: number; r: number }): Box => ({ x: d.x - d.r, y: d.y - d.r, w: 2 * d.r, h: 2 * d.r });

  it('are decoration of every kind, each with a reference of its kind, smaller than the skills', () => {
    const refs = BACK_PASSIVES.map((p) => p.ref);
    expect(new Set(refs).size).toBe(refs.length);
    const letter = { c0603: 'C', tant: 'C', elec: 'C', r0805: 'R', led: 'D', xtal: 'Y', ind: 'L' } as const;
    for (const p of BACK_PASSIVES) expect(p.ref).toMatch(new RegExp(`^${letter[p.pkg]}\\d+$`));
    // Every package, an LED of each colour.
    expect(new Set(BACK_PASSIVES.map((p) => p.pkg))).toEqual(new Set(PASSIVE_IDS));
    expect(new Set(BACK_PASSIVES.filter((p) => p.pkg === 'led').map((p) => p.tone))).toEqual(new Set(['amber', 'blue', 'green', 'red']));
    // Never a skill: no reference of the bill of materials.
    for (const p of BACK_PASSIVES) expect([...BACK_REFS] as string[]).not.toContain(p.ref);
    // The skills stay the subject: every passive under half the mean area of a skill.
    const mean = BACK_PARTS.reduce((sum, q) => sum + PACKAGES[q.pkg].w * PACKAGES[q.pkg].h, 0) / BACK_PARTS.length;
    for (const p of BACK_PASSIVES) {
      const b = passiveBox(p);
      expect(b.w * b.h, p.ref).toBeLessThan(mean / 2);
    }
  });

  it('passives are decorative and clear of the meaningful copper', () => {
    const pour = grow(POUR, -8);
    for (const p of BACK_PASSIVES) {
      const b = passiveBox(p);
      const label = passiveRef(p).room;
      for (const box of [b, label]) expect(within(box, pour), `${p.ref} inside the pour`).toBe(true);
      for (const q of BACK_PARTS) {
        // Never under a part or on its reference, the reference of a passive neither.
        expect(apart(grow(b, 6), footprint(q)), `${p.ref} by ${q.ref}`).toBe(true);
        expect(apart(grow(b, 2), labelRoom(q)), `${p.ref} on the reference of ${q.ref}`).toBe(true);
        expect(apart(label, footprint(q)), `reference of ${p.ref} on ${q.ref}`).toBe(true);
        expect(apart(label, labelRoom(q)), `reference of ${p.ref} on the reference of ${q.ref}`).toBe(true);
      }
      // Never on a net, which keeps its clearance from them.
      for (const net of BACK_NETS) {
        for (const s of segments(netPoints(net))) {
          expect(crosses(s, grow(b, 9)), `${net.id} by ${p.ref}`).toBe(false);
          expect(crosses(s, grow(label, 3)), `${net.id} on the reference of ${p.ref}`).toBe(false);
        }
      }
      // Never on a through-hole pad, a mounting hole or a fiducial.
      for (const d of FRONT_PADS) expect(apart(grow(b, 8), pad(d)), `${p.ref} by ${d.x},${d.y}`).toBe(true);
      for (const [x, y] of [...HOLES, ...FIDUCIALS]) expect(apart(grow(b, 8), pad({ x, y, r: 15 })), `${p.ref} by ${x},${y}`).toBe(true);
    }
    // Apart from each other, their references included.
    const rooms = BACK_PASSIVES.map((p) => [passiveBox(p), passiveRef(p).room] as const);
    for (const [i, [b, l]] of rooms.entries()) {
      for (const [k, [c, m]] of rooms.slice(i + 1).entries()) {
        const q = BACK_PASSIVES[i + 1 + k]?.ref;
        for (const [x, y] of [[b, c], [b, m], [l, c], [l, m]] as const) expect(apart(grow(x, 2), y), `${BACK_PASSIVES[i]?.ref} / ${q}`).toBe(true);
      }
    }
  });

  it('the stitching vias keep clear of the passives and their references', () => {
    for (const p of BACK_PASSIVES) {
      for (const box of [passiveBox(p), passiveRef(p).room]) {
        const near = STITCH.filter(([x, y]) => !apart(grow(box, VIA.r + 4), { x, y, w: 0, h: 0 }));
        expect(near, p.ref).toEqual([]);
      }
    }
  });

  it('a turned part stays on whole units, about the centre of its box', () => {
    for (const p of BACK_PASSIVES) {
      const use = passiveUse(p);
      for (const v of [use.x, use.y]) expect(Number.isInteger(v), p.ref).toBe(true);
      const b = passiveBox(p);
      const { w, h } = PASSIVES[p.pkg];
      // Its symbol, centred on its box: upright, the box is the symbol turned a quarter turn.
      expect([use.x + w / 2, use.y + h / 2], p.ref).toEqual([b.x + b.w / 2, b.y + b.h / 2]);
      expect(use.transform !== undefined, p.ref).toBe(Boolean(p.turned));
    }
  });

  it('the stylesheet prints their references at the size the data makes room for', () => {
    const css = readFileSync(new URL('../../src/styles/back.css', import.meta.url), 'utf8');
    const rule = css.match(/.back__psv-ref {([^}]*)}/)?.[1] ?? '';
    expect(rule).toMatch(new RegExp(`font: 500 ${PASSIVE_REF.size}px`));
  });
});
