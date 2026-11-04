import type { BomRowContent } from '../content/types';
import { DEVICES } from './devices';
import { PARTS, netOf, pinsOf, type Net, type Part } from './netlist';

/**
 * The bill of materials of the back face (spec 4.10, revision 9): its eleven parts, each a real part
 * of the circuit and a skill, and the column « Relié à » computed from the netlist (netlist.ts), never
 * written by hand. The table, the links that light the parts and the accessible name of each part all
 * come from bomRows(): one source.
 */

export const BOM_REFS = ['U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'Y1', 'J6'] as const;
export type BomRef = (typeof BOM_REFS)[number];

/** The chip that is the master of the shared buses (Net.bus). */
const MCU = 'U10';

const partOf = (ref: string): Part => {
  const p = PARTS.find((x) => x.ref === ref);
  if (!p) throw new Error(`no part ${ref}`);
  return p;
};
const refOf = (pin: string): string => pin.slice(0, pin.indexOf('.'));
const pinNo = (pin: string): string => pin.slice(pin.indexOf('.') + 1);
const isBomRef = (ref: string): ref is BomRef => (BOM_REFS as readonly string[]).includes(ref);

/**
 * The parts `ref` is linked to by a signal, in the order of the netlist (PARTS):
 * - signal nets only: power and ground are left out;
 * - resistors, capacitors, inductors, clamps and test points are looked through (a series resistor,
 *   a pull-up, an RC), to the part on their other side; a passive of the front face (R1, D1) is named
 *   all the same, as the spec asks for the parts of the front;
 * - a part with pins joined inside (the flow-through ESD array U13) is named, and looked through too;
 * - on a shared bus (I²C, SPI) a device is linked to the chip only, not to the other devices of the
 *   bus; the chip is linked to all of them.
 */
export function linkedTo(ref: string): string[] {
  const found = new Set<string>();
  const seen = new Set<Net>();
  const queue: Net[] = [];
  const reach = (pin: string): void => {
    const net = netOf(pin);
    if (net && net.kind === 'signal' && !seen.has(net)) {
      seen.add(net);
      queue.push(net);
    }
  };
  for (const pin of pinsOf(ref)) reach(pin);
  while (queue.length) {
    const net = queue.shift() as Net;
    const pins = net.bus && ref !== MCU ? net.pins.filter((p) => refOf(p) === MCU) : net.pins;
    for (const pin of pins) {
      const to = refOf(pin);
      if (to === ref) continue;
      const part = partOf(to);
      const device = DEVICES[part.dev];
      const transparent = 'transparent' in device;
      if (!transparent || part.face === 'front') found.add(to);
      if (transparent) for (const other of pinsOf(to)) reach(other);
      const bridges: readonly (readonly [string, string])[] = 'bridges' in device ? device.bridges : [];
      for (const [a, b] of bridges) {
        if (pinNo(pin) === a) reach(`${to}.${b}`);
        if (pinNo(pin) === b) reach(`${to}.${a}`);
      }
    }
  }
  return PARTS.map((p) => p.ref).filter((r) => found.has(r));
}

/**
 * References that follow each other (the same letters, numbers one apart), three or more, as a range:
 * J1, J2, J3, J4, J5 gives J1–J5 (an en dash). The order is kept.
 */
export function refRanges(refs: readonly string[]): string[] {
  const split = (r: string): [string, number] | null => {
    const m = /^([A-Z]+)(\d+)$/.exec(r);
    return m ? [m[1] ?? '', Number(m[2])] : null;
  };
  const out: string[] = [];
  for (let i = 0; i < refs.length; ) {
    const head = split(refs[i] ?? '');
    let j = i + 1;
    if (head) {
      while (j < refs.length) {
        const next = split(refs[j] ?? '');
        if (!next || next[0] !== head[0] || next[1] !== head[1] + (j - i)) break;
        j++;
      }
    }
    if (j - i >= 3) out.push(`${refs[i]}–${refs[j - 1]}`);
    else out.push(...refs.slice(i, j));
    i = j;
  }
  return out;
}

/** The first letter as a capital: the part and the skill are written as they read in a sentence. */
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

export interface BomRow {
  ref: BomRef;
  /** Line 1: the part (capitalized) and its value; line 2: the skill (capitalized) and its details. */
  part: string;
  value: string;
  skill: string;
  details: string;
  /** The accessible name of the part: « {repère}, {composant}, {compétence} » (spec 4.10). */
  name: string;
  /** Every part it is linked to (data-links, what lights up). */
  links: string[];
  /** The same, as printed in « Relié à »: three references or more that follow each other as a range. */
  linked: string[];
}

/** The rows of the table, from the text of each row (content/fr.ts, en.ts) and the netlist. */
export function bomRows(rows: readonly BomRowContent[]): BomRow[] {
  return rows.map((row) => {
    if (!isBomRef(row.ref)) throw new Error(`${row.ref} is not a part of the bill of materials`);
    const links = linkedTo(row.ref);
    return {
      ref: row.ref,
      part: capitalize(row.part),
      value: row.value,
      skill: capitalize(row.skill),
      details: row.details,
      name: `${row.ref}, ${row.part}, ${row.skill}`,
      links,
      linked: refRanges(links),
    };
  });
}
