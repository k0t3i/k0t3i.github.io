import { PASSIVES, type PassiveId } from '../lib/passives';
import type { Rect } from '../lib/packages';
import type { BackRef, LabelSide, Point } from './backNets';
import { pinAt } from './backNets';

/**
 * The passive parts of the back face: decoration, in colour, around the skills. Each skill chip has
 * its decoupling capacitor by its side, the main chip (U10) its crystal and their load capacitors,
 * the switching regulator (U18) its inductor, the regulator (U20) its electrolytic, its tantalum and
 * its power LED; the header of DISP1 and the switch SW1, seen from behind, their resistors; a bank of
 * four status LEDs and their resistors sits in a corner. They are not skills: no part of
 * the bill of materials, no trace of the nets (N1 to N11) reaches them, nothing lights them, and
 * assistive technologies never meet them (the copper is aria-hidden). In the units of the wide
 * board; x, y is the top-left corner of the part as drawn (turned or not). Their silkscreen
 * references are smaller and quieter than those of the skills.
 * Hand-edited: tests/unit/back-nets.spec.ts keeps them clear of the parts, the nets, the references,
 * the through-hole pads and the holes, and the stitching clear of them.
 */

export type PassiveTone = 'red' | 'green' | 'amber' | 'blue';

export interface BackPassive {
  ref: string;
  pkg: PassiveId;
  x: number;
  y: number;
  /** Turned a quarter turn: drawn upright, its pads at its top and its bottom. */
  turned?: boolean;
  /** The colour of the lens of an LED. */
  tone?: PassiveTone;
  /** Where its reference is printed. */
  label: LabelSide;
}

const cap = (ref: string, x: number, y: number, label: LabelSide, turned = true): BackPassive => ({ ref, pkg: 'c0603', x, y, turned, label });
const res = (ref: string, x: number, y: number, label: LabelSide, turned = false): BackPassive => ({ ref, pkg: 'r0805', x, y, turned, label });

const LEDS: readonly [PassiveTone, number][] = [
  ['red', 140],
  ['green', 158],
  ['amber', 176],
  ['blue', 194],
];

export const BACK_PASSIVES: readonly BackPassive[] = [
  // U10, the main chip: two decoupling capacitors, its crystal and the two load capacitors.
  cap('C1', 506, 304, 'e'),
  cap('C2', 342, 416, 'w'),
  { ref: 'Y1', pkg: 'xtal', x: 324, y: 334, turned: true, label: 'n' },
  cap('C3', 308, 326, 'w'),
  cap('C4', 308, 352, 'w'),
  // A decoupling capacitor by each chip.
  cap('C5', 462, 566, 'e'),
  cap('C6', 164, 646, 'w'),
  cap('C7', 152, 388, 'w'),
  cap('C8', 741, 626, 'e'),
  cap('C9', 741, 650, 'e'),
  cap('C10', 266, 286, 'w'),
  cap('C11', 692, 304, 'e'),
  cap('C12', 542, 706, 'e'),
  cap('C14', 754, 436, 's'),
  // U18, a switching regulator: its inductor and its output capacitor.
  { ref: 'L1', pkg: 'ind', x: 500, y: 150, label: 'n' },
  cap('C13', 474, 162, 'n', false),
  // U20, the regulator: an electrolytic at its input, a tantalum at its output, its power LED.
  { ref: 'C15', pkg: 'elec', x: 626, y: 168, label: 'n' },
  { ref: 'C16', pkg: 'tant', x: 726, y: 214, label: 's' },
  res('R16', 744, 250, 'n', true),
  { ref: 'D5', pkg: 'led', x: 762, y: 250, turned: true, tone: 'green', label: 'n' },
  // Pull-ups and series resistors.
  res('R5', 250, 384, 'e'),
  res('R6', 250, 402, 'e'),
  res('R7', 548, 470, 'w'),
  res('R8', 548, 488, 'w'),
  res('R13', 660, 520, 'w'),
  res('R14', 660, 538, 'w'),
  res('R9', 296, 722, 'e'),
  res('R10', 296, 740, 'e'),
  // By the header of DISP1, seen from behind: its backlight resistors and a capacitor.
  res('R11', 160, 150, 'n'),
  res('R12', 192, 150, 'n'),
  cap('C17', 224, 151, 'n', false),
  // By the pads of SW1: its pull-up and its debounce capacitor.
  res('R15', 158, 562, 's'),
  cap('C18', 210, 520, 'e'),
  // The status LEDs, each over its resistor.
  ...LEDS.map(([tone, x], i): BackPassive => ({ ref: `D${i + 1}`, pkg: 'led', x, y: 712, turned: true, tone, label: 'n' })),
  ...LEDS.map(([, x], i) => res(`R${i + 1}`, x, 738, 's', true)),
];

/** The box of a passive on the face, as drawn. */
export function passiveBox(p: BackPassive): Rect {
  const { w, h } = PASSIVES[p.pkg];
  return p.turned ? { x: p.x, y: p.y, w: h, h: w } : { x: p.x, y: p.y, w, h };
}

/** How the copper draws it: its symbol at its place, turned about its centre if it is upright. */
export function passiveUse(p: BackPassive): { x: number; y: number; width: number; height: number; transform?: string } {
  const { w, h } = PASSIVES[p.pkg];
  const box = passiveBox(p);
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h, ...(p.turned ? { transform: `rotate(90 ${cx} ${cy})` } : {}) };
}

/** The silkscreen of a reference: its size in units (back.css), the advance of one character. */
export const PASSIVE_REF = { size: 8, advance: 5, gap: 3 };

/** Where its reference is printed: its baseline, its anchor, and the room it takes. */
export function passiveRef(p: BackPassive): { x: number; y: number; anchor: 'start' | 'end'; room: Rect } {
  const b = passiveBox(p);
  const { size, advance, gap } = PASSIVE_REF;
  const w = advance * p.ref.length;
  const middle = b.y + Math.round(b.h / 2) + 3;
  const at: Record<LabelSide, { x: number; y: number; anchor: 'start' | 'end'; left: number }> = {
    n: { x: b.x, y: b.y - gap, anchor: 'start', left: b.x },
    s: { x: b.x, y: b.y + b.h + gap + size - 1, anchor: 'start', left: b.x },
    e: { x: b.x + b.w + gap, y: middle, anchor: 'start', left: b.x + b.w + gap },
    w: { x: b.x - gap, y: middle, anchor: 'end', left: b.x - gap - w },
  };
  const { x, y, anchor, left } = at[p.label];
  return { x, y, anchor, room: { x: left, y: y - size + 1, w, h: size + 1 } };
}

/**
 * The short traces of ordinary copper from a decoupling capacitor to the supply pin of its chip:
 * the capacitor, the pad it leaves by (1 or 2), the chip and its pin, and the bends in between.
 */
export interface Stub {
  from: string;
  pad: 1 | 2;
  to: BackRef;
  pin: number;
  bends: Point[];
}

export const STUBS: readonly Stub[] = [
  { from: 'C1', pad: 2, to: 'U10', pin: 36, bends: [[511, 326]] },
  { from: 'C2', pad: 1, to: 'U10', pin: 12, bends: [[352, 414]] },
  { from: 'C5', pad: 1, to: 'U11', pin: 11, bends: [[462, 564]] },
  { from: 'C6', pad: 1, to: 'U12', pin: 14, bends: [[173, 645]] },
  { from: 'C7', pad: 1, to: 'U13', pin: 16, bends: [[164, 384]] },
  { from: 'C8', pad: 1, to: 'U14', pin: 18, bends: [[741, 634]] },
  { from: 'C11', pad: 1, to: 'U16', pin: 9, bends: [[695, 305]] },
  { from: 'C12', pad: 2, to: 'U17', pin: 7, bends: [[547, 738]] },
  { from: 'C14', pad: 1, to: 'U19', pin: 5, bends: [[755, 435]] },
  { from: 'L1', pad: 2, to: 'U18', pin: 6, bends: [[544, 154]] },
];

/** The centre of a pad of a passive, on the face (a turned part has pad 1 at its top). */
export function passivePad(p: BackPassive, pad: 1 | 2): Point {
  const r = PASSIVES[p.pkg].pads[pad - 1];
  if (!r) throw new Error(`${p.ref} has no pad ${pad}`);
  const [px, py] = [r.x + r.w / 2, r.y + r.h / 2];
  if (!p.turned) return [p.x + px, p.y + py];
  // A quarter turn clockwise about the centre: (x, y) of the symbol goes to (h - y, x) of the box.
  return [p.x + PASSIVES[p.pkg].h - py, p.y + px];
}

const passive = (ref: string): BackPassive => {
  const p = BACK_PASSIVES.find((q) => q.ref === ref);
  if (!p) throw new Error(`no passive ${ref}`);
  return p;
};

/** Every point of a stub: the pad of the passive, its bends, the pin of the chip. */
export function stubPoints(s: Stub): Point[] {
  return [passivePad(passive(s.from), s.pad), ...s.bends, pinAt(s.to, s.pin)];
}
