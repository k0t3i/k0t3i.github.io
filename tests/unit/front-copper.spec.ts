import { mount } from '@vue/test-utils';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import BoardSignal from '../../src/components/BoardSignal.vue';
import { FRONT_NET_PADS, VIA, frontVias, type NetPad } from '../../src/circuit/copper';
import { CIRCUIT, FRONT_ROUTES, FRONT_TRACES, pointsPath, type Point, type Trace, type Via } from '../../src/circuit/layout';

/*
 * The copper of the front face (spec 4.10, the decisions after the review): its traces are the real
 * ones (src/circuit/front.ts), its art (assets/img/board-wide.svg) draws them and their vias, and the
 * current that follows the pointer (BoardSignal.vue) runs along the route of each part.
 *
 * The art is generated from the data: after a change of the front copper, rewrite it with
 *   UPDATE_ART=1 npx vitest run tests/unit/front-copper.spec.ts
 * (PowerShell: $env:UPDATE_ART=1; npx vitest run tests/unit/front-copper.spec.ts).
 */

const ART_FILE = join(process.cwd(), 'src/assets/img/board-wide.svg');
const BEGIN = '<!-- The copper of the front, generated from src/circuit/front.ts and layout.ts by tests/unit/front-copper.spec.ts: do not edit by hand -->';
const END = '<!-- End of the generated copper -->';

/** The copper of the front as the art draws it: every trace (a veil under the mask), then every via, tented. */
function frontArt(): string {
  const traces = DRAWN.map((t) => `<path stroke-width="${t.w}" d="${pointsPath(t.pts)}"/>`);
  const vias = DRAWN_VIAS.map((v) => `<use href="#${v.kind === 'through' ? 'v' : 'b'}" x="${v.x}" y="${v.y}"/>`);
  return [
    BEGIN,
    '<defs>',
    // A through via (both faces), and a blind one (to a plane inside): the copper ring, the drill.
    `<g id="v"><circle r="${VIA.through}" fill="#fff" fill-opacity=".07"/><circle r="2" fill="#050506"/></g>`,
    `<g id="b"><circle r="${VIA.blind}" fill="#fff" fill-opacity=".07"/><circle r="1" fill="#050506"/></g>`,
    '</defs>',
    '<g fill="none" stroke="#fff" stroke-opacity=".055" stroke-linecap="round" stroke-linejoin="round">',
    ...traces,
    '</g>',
    '<g>',
    ...vias,
    '</g>',
    END,
  ].join('\n');
}

const PART_IDS = ['r1', 'c1', 'led1', 'd1', 'u2', 'j1', 'j2', 'j3', 'j4', 'j5'] as const;
type Id = (typeof PART_IDS)[number];
const REF: Record<Id, string> = { r1: 'R1', c1: 'C1', led1: 'LED1', d1: 'D1', u2: 'U2', j1: 'J1', j2: 'J2', j3: 'J3', j4: 'J4', j5: 'J5' };

const inPad = ([x, y]: Point, p: NetPad) => (p.round ? Math.hypot(x - p.x, y - p.y) <= p.w / 2 + 0.01 : Math.abs(x - p.x) <= p.w / 2 + 0.01 && Math.abs(y - p.y) <= p.h / 2 + 0.01);
const padsAt = (pt: Point, net: string) => FRONT_NET_PADS.filter((p) => p.net === net && inPad(pt, p));
const viaAt = ([x, y]: Point, net: string) => frontVias().find((v) => v.net === net && Math.hypot(x - v.x, y - v.y) <= (v.kind === 'through' ? VIA.through : VIA.blind));

/*
 * The switches of the header, JP1 and SW2, are laid out by the header in rem: they move with the
 * root font and the text spacing, up to some 60 units, so no copper drawn in the units of the art
 * stays on them (it would run under their labels). Their copper is in the data, checked with the
 * rest, but the art does not draw it, nor the vias only it reaches.
 */
const HEADER = ['JP1', 'SW2'];
const onHeader = (t: Trace) => [t.pts[0], t.pts.at(-1)].some((end) => FRONT_NET_PADS.some((p) => HEADER.includes(p.ref) && p.net === t.net && inPad(end as Point, p)));
const DRAWN = FRONT_TRACES.filter((t) => !onHeader(t));
const touches = (t: Trace, v: Via) => t.net === v.net && t.pts.some(([x, y]) => Math.hypot(x - v.x, y - v.y) <= VIA.through);
const DRAWN_VIAS = frontVias().filter((v) => DRAWN.some((t) => touches(t, v)) || !FRONT_TRACES.some((t) => touches(t, v)));

describe('the routes of the front', () => {
  it('each part has its route, from where its current comes to the part', () => {
    expect(Object.keys(FRONT_ROUTES)).toEqual(PART_IDS);
    for (const id of PART_IDS) {
      const t = FRONT_ROUTES[id];
      const [from, to] = [t.pts[0], t.pts.at(-1)] as [Point, Point];
      // J5 is the source: VBUS flows out of it, down to the back. Every other part is the end of its route.
      const [source, part] = id === 'j5' ? [to, from] : [from, to];
      expect(padsAt(part, t.net).map((p) => p.ref), `${id} ends on a pad of its own, on ${t.net}`).toContain(REF[id]);
      const via = viaAt(source, t.net);
      const other = padsAt(source, t.net).filter((p) => p.ref !== REF[id]);
      expect(Boolean(via) || other.length > 0, `${id} comes from a via of ${t.net}, or from a pad of another part`).toBe(true);
      // A signal goes down to the back through the circuit area, never under the table.
      if (via?.kind === 'through') expect(1600 - via.x, `${id}: its via, at x ${1600 - via.x} on the back`).toBeGreaterThanOrEqual(CIRCUIT.x);
      if (via?.kind === 'through') expect(1600 - via.x, `${id}: its via, at x ${1600 - via.x} on the back`).toBeLessThanOrEqual(CIRCUIT.x + CIRCUIT.w);
    }
    // Each route long enough for its current to be seen running on it (50 units at least).
    for (const id of PART_IDS) {
      const pts = FRONT_ROUTES[id].pts;
      const length = pts.slice(1).reduce((sum, [x, y], k) => sum + Math.hypot(x - (pts[k]?.[0] ?? x), y - (pts[k]?.[1] ?? y)), 0);
      expect(length, `${id}: ${length.toFixed(0)} units`).toBeGreaterThanOrEqual(50);
    }
    // LED1 is lit through R1, on the front; C1 takes the 3.3 V from its plane.
    expect(padsAt(FRONT_ROUTES.led1.pts[0] as Point, 'LED_A').map((p) => `${p.ref}.${p.pin}`)).toEqual(['R1.2']);
    expect(viaAt(FRONT_ROUTES.c1.pts[0] as Point, '+3V3')?.kind).toBe('blind');
    // The power comes from J5.
    expect([FRONT_ROUTES.j5.net, padsAt(FRONT_ROUTES.j5.pts[0] as Point, 'VBUS')[0]?.ref]).toEqual(['VBUS', 'J5']);
  });

  it('pin 1 of U2 is the pad by the dimple of its drawing, as on the page', () => {
    // The SOIC-8 drawn by PartSprite.vue (64 x 32 units), at --x 944, --y 618 on the wide board (wide.css).
    const sprite = readFileSync(join(process.cwd(), 'src/components/PartSprite.vue'), 'utf8');
    const chip = sprite.slice(sprite.indexOf('id="part-chip"'), sprite.indexOf('</symbol>', sprite.indexOf('id="part-chip"')));
    const [, cx = '0', cy = '0'] = chip.match(/class="pcb-mark"\s+cx="([\d.]+)"\s+cy="([\d.]+)"/) ?? [];
    const dimple: Point = [944 + Number(cx), 618 + Number(cy)];
    const u2 = FRONT_NET_PADS.filter((p) => p.ref === 'U2');
    const nearest = [...u2].sort((a, b) => Math.hypot(a.x - dimple[0], a.y - dimple[1]) - Math.hypot(b.x - dimple[0], b.y - dimple[1]))[0];
    expect(nearest?.pin).toBe('1');
    // Then counter-clockwise, seen from above: 1 to 4 along the side of the dimple, 5 to 8 back along the other.
    const at = (pin: string) => u2.find((p) => p.pin === pin) as NetPad;
    for (const [a, b] of [['1', '2'], ['2', '3'], ['3', '4'], ['5', '6'], ['6', '7'], ['7', '8']] as const) expect(at(b).x - at(a).x, `${a} → ${b}`).toBe(at('1').y === at(a).y ? 8 : -8);
    expect([at('4').x, at('5').x]).toEqual([at('4').x, at('4').x]);
  });

  it('nothing on the front leads to DISP1: its header is wired from the back', () => {
    const disp = FRONT_NET_PADS.filter((p) => p.ref === 'DISP1');
    expect(disp).toHaveLength(6);
    for (const t of FRONT_TRACES) {
      for (const end of [t.pts[0], t.pts.at(-1)] as Point[]) {
        expect(disp.some((p) => inPad(end, { ...p, w: p.w + 8, h: p.h + 8 })), `${t.net} at ${end.join(',')}`).toBe(false);
      }
    }
  });
});

describe('the live layer of the wide board (BoardSignal.vue)', () => {
  const paths = (cls: string) =>
    mount(BoardSignal)
      .findAll(`path.${cls}`)
      .map((p) => ({ part: p.attributes('data-part'), d: p.attributes('d'), length: p.attributes('pathLength') }));

  it('the trace of each part, lit under the pointer, is its route', () => {
    const live = paths('trace-live');
    expect(live.map((p) => p.part)).toEqual(PART_IDS);
    for (const p of live) expect([p.d, p.length], p.part).toEqual([pointsPath(FRONT_ROUTES[p.part as Id].pts), '100']);
  });

  it('the signal of each part runs on its route', () => {
    const pulses = paths('trace-pulse');
    expect(pulses.map((p) => p.part)).toEqual(PART_IDS);
    for (const p of pulses) expect(p.d, p.part).toBe(pointsPath(FRONT_ROUTES[p.part as Id].pts));
  });

  it('the ambient signals run down four routes: R1 then LED1, D1, and the power out of J5', () => {
    const route = (id: Id) => pointsPath(FRONT_ROUTES[id].pts);
    expect(paths('signal').map((p) => p.d)).toEqual((['r1', 'led1', 'd1', 'j5'] as const).map(route));
  });
});

describe('the art of the front (board-wide.svg)', () => {
  it('draws the copper of the data: its traces and its vias, nothing else', () => {
    const art = readFileSync(ART_FILE, 'utf8');
    const begin = art.indexOf(BEGIN);
    const end = art.indexOf(END);
    const want = frontArt();
    if (process.env.UPDATE_ART && begin >= 0 && end > begin) {
      writeFileSync(ART_FILE, art.slice(0, begin) + want + art.slice(end + END.length));
      return;
    }
    expect(begin, 'the art has a generated copper block').toBeGreaterThan(0);
    expect(art.slice(begin, end + END.length)).toBe(want);
    // The copper of the header switches is all it leaves out: THEME from JP1, FLIP and the supply of SW2.
    expect(FRONT_TRACES.filter(onHeader).map((t) => t.net).sort()).toEqual(['+3V3', 'FLIP', 'GND', 'THEME']);
    expect(frontVias().filter((v) => !DRAWN_VIAS.some((w) => w.x === v.x && w.y === v.y)).map((v) => v.net).sort()).toEqual(['+3V3', 'FLIP', 'GND', 'THEME']);
    // No other copper drawn by hand: the only traces of the art are in the block.
    expect((art.slice(0, begin) + art.slice(end)).match(/<path [^>]*stroke-width/g)).toBeNull();
  });
});
