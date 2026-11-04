import { PASSIVES, type PassiveId } from '../lib/passives';
import type { Rect } from '../lib/packages';
import type { LabelSide } from './backNets';

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
 * the through-hole pads and the holes, and the stitching clear of them; PASSIVE_REF equals the size
 * of their references in back.css.
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

/*
 * One part a line: its reference, its package, x, y, the side of its reference, "^" when it stands
 * upright (a quarter turn), the colour of an LED. In order: U10, the main chip (two decoupling
 * capacitors, its crystal and the two load capacitors); a decoupling capacitor by each chip; U18,
 * a switching regulator (its inductor and its output capacitor); U20, the regulator (an electrolytic
 * at its input, a tantalum at its output, its power LED and its resistor); pull-ups and series
 * resistors; by the header of DISP1 seen from behind, its backlight resistors and a capacitor; by
 * the pads of SW1, its pull-up and its debounce capacitor; the four status LEDs over their resistors.
 */
const TABLE = `
C1 c0603 506 304 e ^
C2 c0603 342 416 w ^
Y1 xtal 324 334 n ^
C3 c0603 308 326 w ^
C4 c0603 308 352 w ^
C5 c0603 462 566 e ^
C6 c0603 164 646 w ^
C7 c0603 152 388 w ^
C8 c0603 741 626 e ^
C9 c0603 741 650 e ^
C10 c0603 266 286 w ^
C11 c0603 692 304 e ^
C12 c0603 542 706 e ^
C14 c0603 754 436 s ^
L1 ind 500 150 n
C13 c0603 474 162 n
C15 elec 626 168 n
C16 tant 726 214 s
R16 r0805 744 250 n ^
D5 led 762 250 n ^ green
R5 r0805 250 384 e
R6 r0805 250 402 e
R7 r0805 548 470 w
R8 r0805 548 488 w
R13 r0805 660 520 w
R14 r0805 660 538 w
R9 r0805 296 722 e
R10 r0805 296 740 e
R11 r0805 160 150 n
R12 r0805 192 150 n
C17 c0603 224 151 n
R15 r0805 158 562 s
C18 c0603 210 520 e ^
D1 led 140 712 n ^ red
D2 led 158 712 n ^ green
D3 led 176 712 n ^ amber
D4 led 194 712 n ^ blue
R1 r0805 140 738 s ^
R2 r0805 158 738 s ^
R3 r0805 176 738 s ^
R4 r0805 194 738 s ^`;

export const BACK_PASSIVES: readonly BackPassive[] = TABLE.trim()
  .split('\n')
  .map((line) => {
    const [ref = '', pkg, x, y, label, turned, tone] = line.split(' ');
    return { ref, pkg: pkg as PassiveId, x: Number(x), y: Number(y), label: label as LabelSide, turned: turned === '^', tone: tone as PassiveTone | undefined };
  });

/** The box of a passive on the face, as drawn. */
export function passiveBox(p: BackPassive): Rect {
  const { w, h } = PASSIVES[p.pkg];
  return p.turned ? { x: p.x, y: p.y, w: h, h: w } : { x: p.x, y: p.y, w, h };
}

/**
 * How the copper draws it: its symbol (drawn at one unit for one unit, no viewBox) at its place,
 * turned about its centre if it is upright.
 */
export function passiveUse(p: BackPassive): { x: number; y: number; transform?: string } {
  const { w, h } = PASSIVES[p.pkg];
  const box = passiveBox(p);
  const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
  return { x: cx - w / 2, y: cy - h / 2, ...(p.turned ? { transform: `rotate(90 ${cx} ${cy})` } : {}) };
}

/** The silkscreen of a reference: its size in units (back.css), the advance of one character, its gap from the part. */
export const PASSIVE_REF = { size: 8, advance: 5, gap: 3 } as const;
const { size: SIZE, advance: ADVANCE, gap: GAP } = PASSIVE_REF;

/** Where its reference is printed: its baseline, whether it ends there (on the west side), and the room it takes. */
export function passiveRef(p: BackPassive): { x: number; y: number; end: boolean; room: Rect } {
  const b = passiveBox(p);
  const w = ADVANCE * p.ref.length;
  const side = p.label;
  const x = side === 'e' ? b.x + b.w + GAP : side === 'w' ? b.x - GAP : b.x;
  const y = side === 'n' ? b.y - GAP : side === 's' ? b.y + b.h + GAP + SIZE - 1 : b.y + Math.round(b.h / 2) + 3;
  return { x, y, end: side === 'w', room: { x: side === 'w' ? x - w : x, y: y - SIZE + 1, w, h: SIZE + 1 } };
}
