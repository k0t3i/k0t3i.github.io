import { NETS, PARTS, deviceOf, type Net } from './netlist';

/**
 * What a part is linked to (spec 4.10, « Relié à »), from the netlist: the real signal links.
 * - Power and ground are not links; a series resistor, a pull-up, an RC filter, a clamp diode or a
 *   test point is looked through, to the part on the other side (a passive of the front face, R1 or
 *   D1, is named as well: its pads are on the page).
 * - On a shared bus (I²C, SPI), a device is linked to the chip that masters it (U10) and to what it
 *   serves, never to the other devices of the bus; the chip is linked to all of them.
 * - Power is never a link, but for one named exception (FED_BY).
 * Also the nets each link runs on, for the light of the back face (live.ts).
 */

export const MASTER = 'U10';

/**
 * The one exception to « no power in Relié à » (Anthony's decision of 04/11/2026, spec 4.10,
 * « U12 → J5 »): the regulator, which has no signal, is linked to the connector that feeds it, so that
 * pointing at it lights something. The link runs on the power nets they share.
 */
export const FED_BY: Readonly<Record<string, string>> = { U12: 'J5' };

const partOf = (pin: string): string => pin.split('.')[0] ?? '';
const transparent = (ref: string): boolean => Boolean((deviceOf(ref) as { transparent?: true }).transparent);
/** A test point or the TEST row: probed, never a link, and its pads joined to nothing (spec 4.11). */
const probe = (ref: string): boolean => {
  const d = deviceOf(ref) as { probe?: true; bussed?: true };
  // A bussed network too: each of its resistors ends on the common rail, so it links nothing.
  return Boolean(d.probe || d.bussed);
};
/** A passive of the front named in « Relié à »: a part of the page (R1, D1), not one of the art (spec 4.11). */
const named = (ref: string): boolean => {
  const p = PARTS.find((x) => x.ref === ref);
  return p?.face === 'front' && !p.art;
};
const netsOfPart = (ref: string): Net[] => NETS.filter((n) => n.pins.some((p) => partOf(p) === ref));

export interface Link {
  /** The part at the other end. */
  to: string;
  /** The nets the link runs on, from the part to it. */
  nets: string[];
}

/** The links of a part: the parts it reaches through its signal nets, and the nets on the way. */
export function linksOf(ref: string): Link[] {
  const found = new Map<string, Set<string>>();
  const reach = (to: string, nets: string[]) => {
    const s = found.get(to) ?? new Set<string>();
    for (const n of nets) s.add(n);
    found.set(to, s);
  };
  // Walk the signal nets from the pins of the part; through a transparent part, on to its other pins.
  const walk = (net: Net, path: string[], seen: Set<string>) => {
    if (net.kind !== 'signal' || seen.has(net.name)) return;
    seen.add(net.name);
    const here = [...path, net.name];
    for (const pin of net.pins) {
      const other = partOf(pin);
      if (other === ref || probe(other)) continue;
      if (transparent(other)) {
        // A passive of the front face is named too (its pads show on the page, spec 4.10), and looked through.
        if (named(other) && !(net.bus && ref !== MASTER)) reach(other, here);
        for (const next of netsOfPart(other)) if (next !== net) walk(next, here, seen);
        continue;
      }
      // A device of a bus reaches only its master on that bus.
      if (net.bus && ref !== MASTER && other !== MASTER) continue;
      reach(other, here);
    }
  };
  for (const net of netsOfPart(ref)) walk(net, [], new Set());
  const feeder = FED_BY[ref];
  if (feeder) {
    // The power nets from the part to its feeder, through the passives between them (the ferrite bead FB1).
    const mine = NETS.filter((n) => n.kind === 'power' && n.pins.some((p) => partOf(p) === ref));
    const theirs = (n: Net) => n.pins.some((p) => partOf(p) === feeder);
    const shared = mine.filter(theirs).map((n) => n.name);
    if (!shared.length) {
      for (const n of mine) {
        for (const via of n.pins.map(partOf).filter((x) => transparent(x) && !probe(x))) {
          const next = netsOfPart(via).find((m) => m !== n && m.kind === 'power' && theirs(m));
          if (next) shared.push(n.name, next.name);
        }
      }
    }
    reach(feeder, shared);
  }
  return [...found].map(([to, nets]) => ({ to, nets: [...nets] })).sort((a, b) => order(a.to) - order(b.to));
}

/** The order of references: the order of the parts in the netlist (the table first, then the back, then the front). */
export const order = (ref: string): number => PARTS.findIndex((p) => p.ref === ref);

/** The parts a part is linked to, in order. */
export const linkedTo = (ref: string): string[] => linksOf(ref).map((l) => l.to);

