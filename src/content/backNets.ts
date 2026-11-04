import { padCenter, type PackageId } from '../lib/packages';

/**
 * The circuit of the back face (spec rev. 5, annex A « Carte des liaisons », approved by Anthony on
 * 03/11/2026): every part is a skill of the bill of materials, U10 to U20, and every net a trace
 * between two skills that work together. In the units of the wide board (1600 x 900, x mirrored
 * from the front: the through-hole parts of the front are on the left, content/backCopper.ts).
 * Hand-edited: tests/unit/back-nets.spec.ts checks the annex, the 45° routing, that every net ends
 * on a pad of its two parts, and the clearances.
 */

export const BACK_REFS = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'U20'] as const;
export type BackRef = (typeof BACK_REFS)[number];

export type NetId = 'N1' | 'N2' | 'N3' | 'N4' | 'N5' | 'N6' | 'N7' | 'N8' | 'N9' | 'N10' | 'N11';
export type Point = [number, number];

/** Where the reference of a part is printed: above it, under it, at its left or at its right. */
export type LabelSide = 'n' | 's' | 'w' | 'e';

export interface BackPart {
  ref: BackRef;
  pkg: PackageId;
  /** The top-left corner of its footprint (content/../lib/packages.ts). */
  x: number;
  y: number;
  label: LabelSide;
}

export interface BackNet {
  id: NetId;
  from: BackRef;
  to: BackRef;
  /** The pin it leaves `from` by, and the pin it reaches `to` by. */
  pins: [number, number];
  /** Its bends, between the two pads: every segment is horizontal, vertical or at 45°. */
  bends: Point[];
}

/**
 * The main chip, U10 Vue.js, is in the middle. With TypeScript (U11), the tests (U17), the
 * accessibility (U14), the team (U19) and the front-end architecture (U16) it closes a ring under
 * it; from the accessibility, a chain goes round the outside of that ring: semantic HTML (U12),
 * CSS (U13), performance (U15), debugging (U18) and electronics (U20).
 */
export const BACK_PARTS: readonly BackPart[] = [
  { ref: 'U10', pkg: 'lqfp48', x: 360, y: 300, label: 'n' },
  { ref: 'U11', pkg: 'tssop20', x: 379, y: 560, label: 'w' },
  { ref: 'U12', pkg: 'soic14', x: 180, y: 640, label: 'n' },
  { ref: 'U13', pkg: 'tssop16', x: 170, y: 380, label: 'n' },
  { ref: 'U14', pkg: 'qfn24', x: 665, y: 620, label: 'w' },
  { ref: 'U15', pkg: 'msop10', x: 290, y: 240, label: 'w' },
  { ref: 'U16', pkg: 'soic16', x: 600, y: 300, label: 'n' },
  { ref: 'U17', pkg: 'tssop14', x: 480, y: 700, label: 's' },
  { ref: 'U18', pkg: 'sot23-6', x: 560, y: 150, label: 'n' },
  { ref: 'U19', pkg: 'soic8', x: 700, y: 430, label: 'w' },
  { ref: 'U20', pkg: 'sot223', x: 700, y: 140, label: 'n' },
];

export const BACK_NETS: readonly BackNet[] = [
  { id: 'N1', from: 'U10', to: 'U11', pins: [13, 20], bends: [] },
  { id: 'N2', from: 'U10', to: 'U16', pins: [30, 1], bends: [[590, 374], [608, 356]] },
  { id: 'N3', from: 'U11', to: 'U17', pins: [10, 14], bends: [[449, 646], [487, 684]] },
  { id: 'N4', from: 'U12', to: 'U13', pins: [8, 8], bends: [[248, 450], [226, 428]] },
  { id: 'N5', from: 'U12', to: 'U14', pins: [7, 7], bends: [[248, 760], [278, 790], [649, 790], [679, 760]] },
  { id: 'N6', from: 'U13', to: 'U15', pins: [9, 1], bends: [[226, 376], [296, 306]] },
  { id: 'N7', from: 'U14', to: 'U17', pins: [6, 8], bends: [[549, 674], [529, 694]] },
  { id: 'N8', from: 'U15', to: 'U18', pins: [6, 1], bends: [[324, 240], [334, 230], [540, 230], [566, 204]] },
  { id: 'N9', from: 'U16', to: 'U19', pins: [8, 8], bends: [[678, 394], [709, 425]] },
  { id: 'N10', from: 'U14', to: 'U19', pins: [19, 2], bends: [] },
  { id: 'N11', from: 'U18', to: 'U20', pins: [3, 1], bends: [[586, 226], [606, 246], [690, 246], [710, 226]] },
];

/** What the flowing board shows of the circuit (it has no room for the whole face): every part and net. */
export const CIRCUIT_VIEW = { x: 120, y: 80, w: 664, h: 736 };

const partOf = (ref: BackRef): BackPart => {
  const part = BACK_PARTS.find((p) => p.ref === ref);
  if (!part) throw new Error(`no part ${ref}`);
  return part;
};

/** The centre of a pad of a part, on the face. */
export function pinAt(ref: BackRef, pin: number): Point {
  const part = partOf(ref);
  const [x, y] = padCenter(part.pkg, pin);
  return [part.x + x, part.y + y];
}

/** Every point of a net: the pad it leaves, its bends, the pad it reaches. */
export function netPoints(net: BackNet): Point[] {
  return [pinAt(net.from, net.pins[0]), ...net.bends, pinAt(net.to, net.pins[1])];
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

/** The path of a net, from its first part to its second one. */
export const netPath = (net: BackNet): string => pointsPath(netPoints(net));

/** The parts a part is linked to, in order: the column « Relié à » of the bill of materials. */
export function linkedTo(ref: BackRef): BackRef[] {
  const linked = BACK_NETS.flatMap((n) => (n.from === ref ? [n.to] : n.to === ref ? [n.from] : []));
  return BACK_REFS.filter((r) => linked.includes(r));
}
