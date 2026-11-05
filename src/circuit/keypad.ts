/**
 * The test keypad of the front face (spec 4.11, revision 10): where its six switches and its TEST
 * row are, in front coordinates (the 1600 x 900 units of the art, assets/img/board-wide.svg).
 * A module of its own, with no import, like front.ts: the page places its buttons from it (the way
 * PartSprite places the parts, with --x / --y), the netlist and the layout take their pads from it,
 * and the art draws the bodies there.
 *
 * - The switches: six Omron B3FS-1000P, 6 x 6 mm surface-mount tactile switches (about 22 units of
 *   the art), a cross ↑ ↓ ← → and B and A, on the nets KEY_UP… of the netlist.
 * - The art draws each switch whole (its four legs, its metal frame, its round plunger), so that the
 *   pad reads as a drawing without JavaScript; the button of the page lies over it, its hit area the
 *   size given here.
 * - Each hit area is 38 x 38 units: 28.5 CSS px at the smallest wide board (79rem: a 1200 px board,
 *   0.75 px a unit), 28.1 px with the root font at 125 % (0.74 px a unit). WCAG 2.5.8 asks 24.
 *   The areas touch but never overlap. The 15 units between two bodies carry the copper.
 *
 * Where (measured on the build of 29482ec, FR and EN, from 1264 to 1920 px, root font at 125 % or
 * WCAG 1.4.12 spacing): the title never passes x 954 (FR at 1264 px with the spacing), its lines
 * end above y 410; the subtitle never passes x 789 nor y 509. So the keypad sits right of the title,
 * under TP1 (1046, 252), from x 979; the TEST row under it, its pull-ups and vias under that, above
 * the copper of the row of the principles (y 522). Both settings at once are a stress case where the title wraps.
 */

export type Key = 'up' | 'down' | 'left' | 'right' | 'b' | 'a';

export interface KeySwitch {
  /** Its reference on the board. */
  ref: string;
  key: Key;
  /** The net its signal pin is on (the other pins on ground). */
  net: string;
  /** Its centre, in front units. */
  x: number;
  y: number;
}

/** The side of the hit area of each switch, in front units (38 units: 28.5 px at 79rem). */
export const KEY_HIT = 38;

/** The body of a switch drawn in the art (its tin plate, 6 x 6 mm), and its plunger, 3.5 mm across. */
export const KEY_BODY = 22;
export const KEY_PLUNGER = 14;

/** The centre of the cross. */
const CX = 956;
const CY = 326;

/** The six switches, in the order of their references (and of the Konami code's keys: ↑ ↓ ← → B A). */
export const KEYPAD: readonly KeySwitch[] = [
  { ref: 'SW3', key: 'up', net: 'KEY_UP', x: CX, y: CY - KEY_HIT },
  { ref: 'SW4', key: 'down', net: 'KEY_DOWN', x: CX, y: CY + KEY_HIT },
  { ref: 'SW5', key: 'left', net: 'KEY_LEFT', x: CX - KEY_HIT, y: CY },
  { ref: 'SW6', key: 'right', net: 'KEY_RIGHT', x: CX + KEY_HIT, y: CY },
  { ref: 'SW7', key: 'b', net: 'KEY_B', x: 1032, y: 344 },
  { ref: 'SW8', key: 'a', net: 'KEY_A', x: 1072, y: 316 },
];

/**
 * The slot of the keypad group on the wide board, in front units: the box of the six hit areas
 * (x 899 to 1091, y 269 to 383): 91 units clear of the frame of DISP1 (x 1182). The group is placed at its top left (--x, --y) and is w x h.
 * Nothing else of the page may enter it.
 */
export const KEYPAD_SLOT = { x: 899, y: 269, w: 192, h: 114 } as const;

/**
 * On the flowing board there is no art: the keypad is its own block in the column of DISP1, right
 * after the figure (DOM order: after DISP1, before the principles), so that the pad and the screen
 * are seen together at 390 x 844 during a game. It is measured in cells of 2.5rem (40 px; 50 px at
 * 125 %, so it grows with the root font): a group of 5.8 x 3.6 cells (232 px, 290 px at 125 %: it fits
 * the 288 px of content at 320 px wide only at 100 %, so under 22rem of content let it scale down to
 * no less than 2rem cells, 32 px). Each hit area is one cell; the centres are in cells from the top
 * left of the group, the cross as on the wide board, B and A staggered as there. A margin of 0.3 cell
 * round the cross holds the printed marks of the keys (KEY_MARKS), so the group is 5.8 x 3.6 cells.
 */
export const KEYPAD_FLOW = {
  cell: '2.5rem',
  w: 5.8,
  h: 3.6,
  centres: {
    up: [1.8, 0.8],
    down: [1.8, 2.8],
    left: [0.8, 1.8],
    right: [2.8, 1.8],
    b: [4.3, 2.05],
    a: [5.3, 1.55],
  } as Readonly<Record<Key, readonly [number, number]>>,
} as const;

/**
 * The TEST row (J8): ten gold test pads, 18 units apart, each on the net of its key, marked under it
 * ↑ ↑ ↓ ↓ ← → ← → B A (the arrows drawn, B and A printed), with « TEST » printed under its left end. Decoration of the art: aria-hidden, never
 * interactive. The pads are the pogo-pin targets of the test bench of the pad.
 */
export const TEST_ROW = {
  ref: 'J8',
  /** The centre of pad 1, then one pad every `pitch` units to the right. */
  x: 900,
  y: 410,
  pitch: 18,
  /** The radius of a pad. */
  r: 5,
  marks: ['↑', '↑', '↓', '↓', '←', '→', '←', '→', 'B', 'A'],
  /** The silkscreen « TEST »: its start and baseline, under pads 1 and 2. */
  label: { text: 'TEST', x: 878, y: 446 },
} as const;

const NET_OF: Readonly<Record<string, string>> = { '↑': 'KEY_UP', '↓': 'KEY_DOWN', '←': 'KEY_LEFT', '→': 'KEY_RIGHT', B: 'KEY_B', A: 'KEY_A' };

/** The pads of the TEST row: pin (from 1), centre, and the net of its key. */
export const TEST_PADS: readonly { pin: string; x: number; y: number; net: string; mark: string }[] = /* @__PURE__ */ TEST_ROW.marks.map((mark, k) => ({
  pin: String(k + 1),
  x: TEST_ROW.x + TEST_ROW.pitch * k,
  y: TEST_ROW.y,
  net: NET_OF[mark] ?? '',
  mark,
}));

/**
 * The printed marks of the keys, silkscreen of the art (aria-hidden), in the style of the TEST row:
 * a small arrow off the outer end of each arm of the cross (→ by its upper corner, B being close), B
 * and A by their switches. In front units
 * from the centre of each switch (the wide board); `flow` in cells, for the drawing of the flowing
 * board. The copper leaves each of those places free.
 */
export const KEY_MARKS: Readonly<Record<Key, { dx: number; dy: number; flow: readonly [number, number] }>> = {
  up: { dx: 0, dy: -23, flow: [0, -0.48] },
  down: { dx: 0, dy: 24, flow: [0, 0.48] },
  left: { dx: -25, dy: 0, flow: [-0.48, 0] },
  right: { dx: 21, dy: -22, flow: [0.48, 0] },
  b: { dx: 23, dy: 13, flow: [0.42, 0.46] },
  a: { dx: 24, dy: 0, flow: [0, -0.5] },
};
