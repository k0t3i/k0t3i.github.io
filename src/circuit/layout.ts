import { FOOTPRINTS, type Footprint, type FootprintId, type Pad, type Rect } from './footprints';
import { KEYPAD, TEST_PADS, TEST_ROW } from './keypad';
import { PARTS, type Part } from './netlist';
import type { DeviceId } from './devices';
import type { Layer, Point } from './front';

/**
 * The layout of the board (spec 4.10): a four-layer board, its two outer layers drawn.
 * - F, the front (the art of the front face, assets/img/board-wide.svg), in front coordinates: its
 *   traces in front.ts, re-exported here;
 * - two planes inside, ground (L2) and +3V3 (L3), never drawn; where a signal cannot cross on the
 *   back (the flash pins of the ESP32-S3 interleave, for one), it hops through a split of one of them,
 *   by a blind via (in the pad, on a fine pitch) at each end;
 * - B, the back (the art of the back face, art.ts), in back coordinates: x mirrored, 1600 − x.
 * A through via joins F and B and shows on both faces; a blind via goes from an outer layer to a
 * plane and shows on its own face only. The ground pins of the back sit on its ground pour.
 * The parts of the front face are where the page draws them (wide.css, PartSprite.vue); their
 * through-hole pads show on the back. Hand-placed; the traces of the back are routed by
 * tests/gen/route.ts into routes.json; tests/unit/circuit-drc.spec.ts checks the result.
 */

export { FRONT_ROUTES, FRONT_TRACES, points, pointsPath, type Layer, type Point, type Trace } from './front';

/** The package of each device of the back face. */
export const FOOTPRINT_OF: Partial<Record<DeviceId, FootprintId>> = {
  esp32s3: 'qfn56',
  w25q128: 'soic8w',
  ap2112k: 'sot23-5',
  usblc6: 'sot23-6',
  tca9554: 'tssop16',
  pca9633: 'tssop8',
  pcf8563: 'so8',
  apx803: 'sot23',
  bh1750: 'wsof6',
  xtal40m: 'xtal2016',
  xtal32k: 'xtal3215',
  header6smd: 'header6smd',
  ufl: 'ufl',
  r0402: '0402',
  c0402: '0402',
  l0402: '0402',
  c0603: '0603',
  led0603: 'led0603',
  tp: 'tp',
};

export type Rot = 0 | 90 | 180 | 270;

/** Where each part of the back is: the top-left corner of its box as placed, and its quarter turns (clockwise). */
export const PLACE: Readonly<Record<string, [x: number, y: number, rot?: Rot]>> = {
  // U10 in the middle, turned a quarter: its radio, its crystal and its UART at its top right corner;
  // the keys of the keypad go down from its bottom right pins to the network RN1 (spec 4.11), which
  // sits 15 units right of them, so the keys step aside from the lines of the flash (the review of
  // Task 18: no comb of eleven lines under U10).
  U10: [430, 290, 90],
  C5: [550, 250, 270],
  C4: [528, 236, 270],
  J7: [610, 196],
  L1: [588, 246, 270],
  C14: [564, 264],
  C15: [606, 240],
  C9: [590, 290],
  C10: [612, 276],
  Y1: [622, 300, 90],
  C12: [652, 286],
  C13: [668, 304, 90],
  C8: [598, 398],
  C6: [404, 266],
  // Reset and boot, by J6 at the top.
  J6: [380, 96],
  U17: [440, 150],
  C21: [486, 154, 90],
  R4: [416, 156, 90],
  C11: [404, 196, 90],
  R5: [500, 196, 90],
  TP4: [380, 196],
  // The flash, under the chip, left of RN1: its near pins facing it.
  U11: [432, 490],
  C7: [398, 452],
  C16: [420, 500, 90],
  // U14 and the inputs of the front, on the left, under the header of DISP1.
  U14: [190, 300, 90],
  C17: [256, 284],
  R8: [262, 340],
  R9: [150, 470, 90],
  C18: [130, 470, 90],
  TP3: [140, 580],
  // The I²C devices, at the bottom right: the LED driver and its LEDs, the RTC and its crystal, the light sensor.
  R6: [610, 560, 90],
  R7: [624, 560, 90],
  R14: [626, 400, 90],
  U16: [640, 376],
  C20: [714, 386, 90],
  Y2: [648, 466],
  U15: [700, 612],
  C19: [756, 616, 90],
  D2: [700, 690, 270],
  D3: [718, 690, 270],
  D4: [736, 690, 270],
  D5: [754, 690, 270],
  R10: [701, 730, 270],
  R11: [719, 730, 270],
  R12: [737, 730, 270],
  R13: [755, 730, 270],
  U18: [692, 520],
  C22: [744, 526, 90],
  R15: [662, 524, 90],
  C23: [662, 556, 90],
  C25: [620, 652],
  R20: [520, 610, 90],
  // Power: VBUS from J5 to U12, in the lower right; U13 by the receptacle, the CC resistors of J5 in
  // the left column.
  U12: [644, 744],
  C2: [620, 752, 90],
  C3: [692, 760, 90],
  TP2: [722, 786],
  U13: [416, 752, 90],
  C26: [474, 752, 90],
  R2: [200, 752, 90],
  R3: [216, 772, 90],
  // The pull-ups of the microSD card.
  R16: [470, 600, 90],
  R17: [236, 676],
  R18: [236, 717],
  R19: [416, 700, 90],
  C24: [330, 690, 90],
};

/** A part of the back face, placed: its footprint turned, and its box on the face. */
export interface PlacedPart {
  part: Part;
  fp: Footprint;
  x: number;
  y: number;
  rot: Rot;
  /** Its box on the face. */
  box: Rect;
}

function turn([px, py]: Point, fp: Footprint, rot: Rot): Point {
  if (rot === 90) return [fp.h - py, px];
  if (rot === 180) return [fp.w - px, fp.h - py];
  if (rot === 270) return [py, fp.w - px];
  return [px, py];
}

/** The parts of the back face, as placed. */
export const BACK_PLACED: readonly PlacedPart[] = PARTS.filter((p) => p.face === 'back').map((part) => {
  const id = FOOTPRINT_OF[part.dev];
  const at = PLACE[part.ref];
  if (!id || !at) throw new Error(`${part.ref} is not placed`);
  const fp = FOOTPRINTS[id];
  const [x, y, rot = 0] = at;
  const quarter = rot === 90 || rot === 270;
  return { part, fp, x, y, rot, box: { x, y, w: quarter ? fp.h : fp.w, h: quarter ? fp.w : fp.h } };
});

/** A copper pad on a face, absolute, with its net (or none: a pin left open). */
export interface PlacedPad extends Pad {
  ref: string;
  layer: Layer | 'both';
}

/** The pads of a part of the back face, on the back. */
export function placedPads(p: PlacedPart): PlacedPad[] {
  return p.fp.pads.map((pad) => {
    const [x, y] = turn([pad.x, pad.y], p.fp, p.rot);
    const quarter = p.rot === 90 || p.rot === 270;
    return { ...pad, ref: p.part.ref, x: p.x + x, y: p.y + y, w: quarter ? pad.h : pad.w, h: quarter ? pad.w : pad.h, layer: 'B' };
  });
}

/** Mirror between the two faces. */
export const mirror = ([x, y]: Point): Point => [1600 - x, y];

/*
 * The pads of the parts of the front face, in front coordinates (the page draws them there at
 * 1600 x 900): the principles R1, C1, LED1, D1, U2 and the contacts of J3 and J5 are surface-mount
 * (F); the headers, the switch SW1, the jumper JP1 and the header of DISP1 go through the board.
 * SW2 is surface-mount: the SW2 drawn on the back face is the same switch seen from behind, so no
 * pad of it shows there (spec 4.10, the one exception to the mirrored pads).
 */
const rect = (ref: string, pin: string, x: number, y: number, w: number, h: number, layer: PlacedPad['layer'] = 'F'): PlacedPad => ({ ref, pin, x, y, w, h, layer });
const tht = (ref: string, pin: string, x: number, y: number, r = 4): PlacedPad => ({ ref, pin, x, y, w: 2 * r, h: 2 * r, round: true, layer: 'both' });
const square = (ref: string, pin: string, x: number, y: number, r = 4): PlacedPad => ({ ref, pin, x, y, w: 2 * r, h: 2 * r, layer: 'both' });

/**
 * The switches of the keypad (B3FS, keypad.ts): four gull-wing pads round each body, 11 units out from
 * its centre on one axis and 7 on the other. The pair of the key (pins 1 and 2, joined inside) faces
 * where its copper leaves: ↑ to its left, round the cross; ← to its right, through the middle of the
 * cross; the others down. The other pair (3 and 4) is on the ground.
 */
export const KEY_SIDE: Readonly<Record<string, 'left' | 'right' | 'down'>> = { SW3: 'left', SW4: 'down', SW5: 'right', SW6: 'down', SW7: 'down', SW8: 'down' };

function KEYPAD_PADS(): PlacedPad[] {
  return KEYPAD.flatMap(({ ref, x, y }) => {
    const side = KEY_SIDE[ref];
    // Pin 1 is the pad its copper leaves from, pin 2 its twin; pin 3 is the ground pad routed, pin 4 its twin.
    const at: Record<string, [number, number]> =
      side === 'left'
        ? { 1: [x - 11, y - 7], 2: [x - 11, y + 7], 3: [x + 11, y + 7], 4: [x + 11, y - 7] }
        : side === 'right'
          ? { 1: [x + 11, y - 7], 2: [x + 11, y + 7], 3: [x - 11, y + 7], 4: [x - 11, y - 7] }
          : ref === 'SW4'
            ? { 1: [x - 7, y + 11], 2: [x + 7, y + 11], 3: [x - 7, y - 11], 4: [x + 7, y - 11] }
            : ref === 'SW6'
              ? { 1: [x + 7, y + 11], 2: [x - 7, y + 11], 3: [x + 7, y - 11], 4: [x - 7, y - 11] }
              : { 1: [x + 7, y + 11], 2: [x - 7, y + 11], 3: [x - 7, y - 11], 4: [x + 7, y - 11] };
    const [w, h] = side === 'down' ? [4, 6] : [6, 4];
    return ['1', '2', '3', '4'].map((pin) => rect(ref, pin, at[pin]?.[0] ?? x, at[pin]?.[1] ?? y, w, h));
  });
}

/** The place of RN1 on the front: pin 1, then a pin every 10 units (2.54 mm, as J1) to the right (back x 525–585). */
export const RN1_X = 1015;
export const RN1_Y = 495;

export const FRONT_PADS: readonly PlacedPad[] = [
  // The principles (PartSprite.vue, at --x of wide.css, y 618): pad centres in front coordinates.
  rect('R1', '1', 119.5, 634, 13, 16),
  rect('R1', '2', 158.5, 634, 13, 16),
  rect('C1', '1', 326.5, 634, 11, 14),
  rect('C1', '2', 355.5, 634, 11, 14),
  rect('LED1', 'A', 535, 634, 12, 14),
  rect('LED1', 'K', 567, 634, 12, 14),
  rect('D1', 'A', 742.5, 634, 11, 12),
  rect('D1', 'K', 777.5, 634, 11, 12),
  // U2, an SO-8 as the page draws it (PartSprite.vue): pin 1 by its dimple, at the bottom left.
  ...['1', '2', '3', '4'].map((pin, k) => rect('U2', pin, 962 + 8 * k, 647, 5, 6)),
  ...['5', '6', '7', '8'].map((pin, k) => rect('U2', pin, 986 - 8 * k, 621, 5, 6)),
  // The header of DISP1: GND, VCC, SCK, MOSI, DC, CS.
  square('DISP1', '1', 1228, 188, 6),
  ...['2', '3', '4', '5', '6'].map((pin, k) => tht('DISP1', pin, 1272 + 44 * k, 188, 6)),
  // SW1: pins 1 and 2 (one contact), 3 and 4 (the other).
  tht('SW1', '1', 1432, 525),
  tht('SW1', '2', 1432, 543),
  tht('SW1', '3', 1408, 525),
  tht('SW1', '4', 1408, 543),
  // JP1, at its place on the wide board at 1600 px: pin 1 (VERT, +3V3), 2 (the theme), 3 (NOIR, ground).
  square('JP1', '1', 1298, 64),
  tht('JP1', '2', 1308, 64),
  tht('JP1', '3', 1318, 64),
  // SW2, surface-mount: its three pins under the switch.
  rect('SW2', '1', 1428, 70, 3, 4),
  rect('SW2', '2', 1437, 70, 3, 4),
  rect('SW2', '3', 1446, 70, 3, 4),
  // J1 (four GPIOs, 3V3, GND), J2 (SCL, SDA, 3V3, GND, as a Grove port), J4 (1-Wire, 3V3, GND).
  square('J1', '1', 1194, 634),
  ...['2', '3', '4', '5', '6'].map((pin, k) => tht('J1', pin, 1204 + 10 * k, 634)),
  square('J2', '1', 1194, 670),
  ...['2', '3', '4'].map((pin, k) => tht('J2', pin, 1204 + 10 * k, 670)),
  square('J4', '1', 1199, 742),
  tht('J4', '2', 1209, 742),
  tht('J4', '3', 1219, 742),
  // J3, the microSD socket: the two legs of its shell, its contacts under it.
  square('J3', 'S1', 1194, 706, 5),
  tht('J3', 'S2', 1244, 706),
  rect('J3', '2', 1199, 694, 4, 4),
  ...[['1', 1203, 722], ['5', 1211, 712], ['3', 1219, 722], ['7', 1227, 712], ['8', 1235, 722]].map(([pin, x, y]) => rect('J3', String(pin), Number(x), Number(y), 4, 4)),
  rect('J3', '4', 1214, 698, 4, 4),
  rect('J3', '6', 1230, 698, 4, 4),
  // J5, the USB-C receptacle: the two tabs of its shell, its contacts under it.
  square('J5', 'S1', 1194, 778, 5),
  square('J5', 'S2', 1246, 778, 5),
  rect('J5', 'A4', 1222, 795, 4, 4),
  // TP1, a test point of the +3V3 rail.
  { ref: 'TP1', pin: '1', x: 1046, y: 252, w: 12, h: 12, round: true, layer: 'F' },
  rect('J5', 'A7', 1207, 772, 4, 4),
  rect('J5', 'A6', 1215, 784, 4, 4),
  rect('J5', 'A5', 1223, 772, 4, 4),
  rect('J5', 'B5', 1231, 784, 4, 4),
  rect('J5', 'A1', 1238, 792, 4, 4),
  ...KEYPAD_PADS(),
  // The TEST row J8, its pads under the keypad; TP5, the ground of the test bed, by it.
  ...TEST_PADS.map((p) => ({ ref: TEST_ROW.ref, pin: p.pin, x: p.x, y: p.y, w: 2 * TEST_ROW.r, h: 2 * TEST_ROW.r, round: true, layer: 'F' as const })),
  { ref: 'TP5', pin: '1', x: 880, y: 470, w: 12, h: 12, round: true, layer: 'F' },
  // RN1, the pull-ups of the keys: a bussed network in a SIP-7 under the TEST row, through the board.
  // Pin 1 (the common, +3V3, square) at the left; pins 2 to 7 the keys ↑ ↓ ← → B A. Seen from the
  // back, its pads are right under the pins of U10 that read the keys.
  square('RN1', '1', RN1_X, RN1_Y),
  ...['2', '3', '4', '5', '6', '7'].map((pin, k) => tht('RN1', pin, RN1_X + 10 * (k + 1), RN1_Y)),
  // The 5 V input by J5: FB1 on the trace of VBUS (pin 1 to J5, pin 2 to the board), C27 above it.
  rect('FB1', '1', 1169, 806, 10, 14),
  rect('FB1', '2', 1151, 806, 10, 14),
  rect('C27', '1', 1155, 770, 10, 14),
  rect('C27', '2', 1173, 770, 10, 14),
];



export interface Via {
  net: string;
  /** In back coordinates. */
  x: number;
  y: number;
  /** A through via (both faces), or a blind one to a plane, on one face. */
  kind: 'through' | 'blind';
  layer?: Layer;
}

const via = (net: string, fx: number, fy: number): Via => ({ net, x: 1600 - fx, y: fy, kind: 'through' });
const blind = (net: string, fx: number, fy: number): Via => ({ net, x: 1600 - fx, y: fy, kind: 'blind', layer: 'F' });

export const VIAS: readonly Via[] = [
  // Where the signals of the front come up from the back.
  via('LED_DRV', 1046, 522),
  via('ONEWIRE', 1100, 600),
  via('SDA', 1020, 570),
  via('SCL', 1000, 578),
  via('EXT1', 1174, 572),
  via('SCL', 1166, 600),
  via('SD_CS', 1158, 670),
  via('ONEWIRE', 1150, 700),
  via('VBUS', 1100, 760),
  via('FLIP', 1470, 430),
  via('THEME', 1462, 446),
  // Under the microSD socket and the USB-C receptacle (hidden by them on the front).
  via('SD_DAT2', 1203, 722),
  via('SPI_SCK', 1211, 712),
  via('SPI_MOSI', 1219, 722),
  via('SPI_MISO', 1227, 712),
  via('SD_DAT1', 1235, 722),
  via('USB_DN_C', 1207, 772),
  via('USB_DP_C', 1215, 784),
  via('CC1', 1223, 772),
  via('CC2', 1231, 784),
  // The planes, from the front.
  blind('GND', 992, 606),
  blind('+3V3', 956, 606),
  blind('GND', 1000, 647),
  blind('+3V3', 276, 660),
  blind('GND', 372, 634),
  blind('GND', 584, 634),
  blind('+3V3', 794, 634),
  blind('+3V3', 1422, 92),
  blind('GND', 1452, 92),
  blind('+3V3', 1066, 252),
  blind('+3V3', 1214, 698),
  blind('GND', 1230, 698),
  blind('GND', 1238, 792),
  // The ground of each switch of the keypad, of TP5 (in its pad) and of C27.
  blind('GND', 956, 342),
  blind('GND', 900, 340),
  blind('GND', 994, 304),
  blind('GND', 1032, 322),
  blind('GND', 1072, 294),
  blind('GND', 880, 470),
  blind('GND', 1173, 756),
];

/**
 * Contacts of a front part joined to one of its drawn pads under the part itself (hidden by it on
 * the front): the four VBUS contacts of J5, its two D+ and two D− (rows A and B), its ground
 * contacts and its shell.
 */
export const JOINED: Readonly<Record<string, string>> = {
  'J5.A9': 'J5.A4',
  'J5.B4': 'J5.A4',
  'J5.B9': 'J5.A4',
  'J5.B6': 'J5.A6',
  'J5.B7': 'J5.A7',
  'J5.A12': 'J5.A1',
  'J5.B1': 'J5.A1',
  'J5.B12': 'J5.A1',
  'J5.S3': 'J5.S1',
  'J5.S4': 'J5.S2',
  // The twin pins of each switch of the keypad, joined inside it (Omron B3FS: 1 and 2, 3 and 4).
  ...Object.fromEntries(KEYPAD.flatMap(({ ref }) => [[`${ref}.2`, `${ref}.1`], [`${ref}.4`, `${ref}.3`]])),
};

/** The front pads that show on the back (through-hole), in back coordinates. */
export const THROUGH_PADS: readonly PlacedPad[] = FRONT_PADS.filter((p) => p.layer === 'both').map((p) => ({ ...p, x: 1600 - p.x }));

/** The area of the circuit on the back: the pour, and the window of the flowing board. */
export const CIRCUIT = { x: 120, y: 80, w: 664, h: 736 };
