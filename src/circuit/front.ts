/**
 * The copper of the front face (spec 4.10): its traces, in front coordinates (1600 x 900, the units
 * of the art). A module of its own, with no import, so the live layer of the page (BoardSignal.vue)
 * takes its routes without the netlist. layout.ts re-exports all of it, with the vias; the art of the
 * front (assets/img/board-wide.svg) is generated from it (tests/unit/front-copper.spec.ts), and
 * tests/unit/circuit-drc.spec.ts checks it with the rest of the board.
 */

export type Layer = 'F' | 'B';
export type Point = [number, number];

export interface Trace {
  net: string;
  layer: Layer;
  w: number;
  /** In the coordinates of its face. */
  pts: Point[];
}

/** The points of a path written with M, H, V and L. */
export function points(d: string): Point[] {
  const out: Point[] = [];
  let at: Point = [0, 0];
  for (const [, cmd, args = ''] of d.matchAll(/([MHVL])([^MHVL]*)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number);
    at = cmd === 'H' ? [n[0] ?? 0, at[1]] : cmd === 'V' ? [at[0], n[0] ?? 0] : [n[0] ?? 0, n[1] ?? 0];
    out.push(at);
  }
  return out;
}

/** The path through some points: M, then H and V, or L at 45°. */
export function pointsPath(pts: readonly Point[]): string {
  return pts
    .map(([x, y], i) => {
      if (i === 0) return `M${x} ${y}`;
      const [px, py] = pts[i - 1] as Point;
      if (y === py) return `H${x}`;
      if (x === px) return `V${y}`;
      return `L${x} ${y}`;
    })
    .join('');
}

/* @__NO_SIDE_EFFECTS__ */
function front(net: string, d: string, w = 2): Trace {
  return { net, layer: 'F', w, pts: points(d) };
}

/**
 * The traces of the front face, routed by hand in the style of its art. The live layer of the front
 * (BoardSignal.vue) lights the one of each part (FRONT_ROUTES), drawn the way its current flows: from
 * the via where the signal comes up from the back to the part; for LED1, from R1; for C1, from its
 * via to the +3V3 plane; for J5, out of the receptacle to the via that takes VBUS down to the back.
 */
export const FRONT_ROUTES = {
  r1: front('LED_DRV', 'M1046 522H108L96 534V618L112 634H119'),
  // From its via below the row, at 45°, so that its current is seen running (front-copper.spec.ts).
  c1: front('+3V3', 'M276 660L302 634H326'),
  // Low over C1, under the heading of the principles (its text grows down with the root font).
  led1: front('LED_A', 'M158 634V618L164 612H519L535 628V634'),
  d1: front('ONEWIRE', 'M1100 600L1034 534H732L720 546V618L736 634H742'),
  u2: front('SDA', 'M1020 570L1012 562H950L936 576V633L950 647H962'),
  j1: front('EXT1', 'M1174 572V622L1186 634H1194'),
  j2: front('SCL', 'M1166 600V658L1178 670H1194'),
  j3: front('SD_CS', 'M1158 670V682L1170 694H1199'),
  j4: front('ONEWIRE', 'M1150 700V730L1162 742H1199'),
  // Out of the receptacle to the ferrite bead FB1, which passes the 5 V on to its via (FRONT_TRACES).
  j5: front('VBUS_C', 'M1222 794L1210 806H1169', 3),
} as const satisfies Record<string, Trace>;

/**
 * The other traces of the front: U2, the ground and +3V3 stubs of its parts, SW2, TP1. The copper of
 * the header switches (JP1, SW2) is here, but the art does not draw it: the header lays them out in
 * rem, so they move with the root font (tests/unit/front-copper.spec.ts).
 */
export const FRONT_TRACES: readonly Trace[] = [
  .../* @__PURE__ */ Object.values(FRONT_ROUTES),
  // U2: SCL beside SDA, then under the package into pin 2; its address pins (A0 to A2) and pin 4 to ground, VCC by pin 8.
  front('SCL', 'M1000 578H956L944 590V626L952 634H970V647'),
  front('GND', 'M970 621H986V612L992 606'),
  front('+3V3', 'M962 621V612L956 606'),
  front('GND', 'M986 647H1000'),
  front('GND', 'M356 634H372'),
  front('GND', 'M567 634H584'),
  front('+3V3', 'M778 634H794'),
  front('FLIP', 'M1437 70V104L1470 137V430'),
  front('+3V3', 'M1428 70V86L1422 92'),
  front('GND', 'M1446 70V86L1452 92'),
  front('+3V3', 'M1066 252H1046'),
  front('THEME', 'M1308 64V80L1388 160H1426V446H1462'),
  // The 5 V on the board, out of FB1 down to the back; C27 filters it.
  front('VBUS', 'M1155 806H1112L1100 794V760', 3),
  front('VBUS', 'M1155 770V806'),
  front('GND', 'M1173 770V756'),
  // The test keypad (keypad.ts, spec 4.11). Each key from its switch down to its TEST pads, then down
  // a stair to its pin of RN1, its pull-up, whose pads take it through the board to the chip. ↑ goes
  // round the cross by its left, ← through its middle; under the row, ← joins its two pads below the
  // pad of →, and → its two above the pad of ←. The outer end of each arm keeps room for its mark.
  front('KEY_UP', 'M945 281H890L882 289V392L900 410'),
  front('KEY_UP', 'M900 410H918'),
  front('KEY_UP', 'M918 410L927 419V486H1040V495'),
  front('KEY_DOWN', 'M949 375L936 388V410'),
  front('KEY_DOWN', 'M936 410H954'),
  front('KEY_DOWN', 'M954 410L963 419V478H1050V495'),
  front('KEY_LEFT', 'M929 319H967L975 327V407L972 410'),
  front('KEY_LEFT', 'M972 410L981 419V432H999V419L1008 410'),
  front('KEY_LEFT', 'M990 432V470H1060V495'),
  front('KEY_RIGHT', 'M1001 337V381L990 392V410'),
  front('KEY_RIGHT', 'M1001 381H1017L1026 390V410'),
  front('KEY_RIGHT', 'M1026 410L1035 419V462H1070V495'),
  front('KEY_B', 'M1039 355V405L1044 410'),
  front('KEY_B', 'M1044 410L1053 419V454H1080V495'),
  front('KEY_A', 'M1079 327V393L1062 410'),
  front('KEY_A', 'M1062 410L1071 419V446H1090V495'),
  // The ground pad of each switch to its blind via (SW3 to the via of SW6).
  front('GND', 'M967 295L976 304H994'),
  front('GND', 'M949 353L956 346V342'),
  front('GND', 'M907 333L900 340'),
  front('GND', 'M1001 315L994 308V304'),
  front('GND', 'M1025 333L1032 326V322'),
  front('GND', 'M1065 305L1072 298V294'),
];
