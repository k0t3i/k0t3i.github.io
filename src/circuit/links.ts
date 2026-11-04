import { NETS, PARTS, deviceOf, type Net } from './netlist';

/**
 * What a part is linked to (spec 4.10, « Relié à »), from the netlist: the real signal links.
 * - Power and ground are not links; a series resistor, a pull-up, an RC filter, a clamp diode or a
 *   test point is looked through, to the part on the other side (a passive of the front face, R1 or
 *   D1, is named as well: its pads are on the page).
 * - On a shared bus (I²C, SPI), a device is linked to the chip that masters it (U10) and to what it
 *   serves, never to the other devices of the bus; the chip is linked to all of them.
 * - A part with no signal at all (the regulator) is linked to the connector that feeds it.
 * Also the nets each link runs on, for the light of the back face (live.ts).
 */

export const MASTER = 'U10';

const partOf = (pin: string): string => pin.split('.')[0] ?? '';
const transparent = (ref: string): boolean => Boolean((deviceOf(ref) as { transparent?: true }).transparent);
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
      if (other === ref) continue;
      if (transparent(other)) {
        // A passive of the front face is named too (its pads show on the page, spec 4.10), and looked through.
        if (PARTS.find((p) => p.ref === other)?.face === 'front' && !(net.bus && ref !== MASTER)) reach(other, here);
        for (const next of netsOfPart(other)) if (next !== net) walk(next, here, seen);
        continue;
      }
      // A device of a bus reaches only its master on that bus.
      if (net.bus && ref !== MASTER && other !== MASTER) continue;
      reach(other, here);
    }
  };
  for (const net of netsOfPart(ref)) walk(net, [], new Set());
  if (!found.size) {
    // No signal: the connectors that feed it (the regulator and J5).
    const inputs = Object.entries(deviceOf(ref).pins).filter(([, [, type]]) => type === 'power').map(([pin]) => `${ref}.${pin}`);
    for (const net of NETS.filter((n) => n.kind === 'power' && n.pins.some((p) => inputs.includes(p)))) {
      for (const pin of net.pins) if (/^J\d/.test(partOf(pin)) && PARTS.find((p) => p.ref === partOf(pin))) reach(partOf(pin), [net.name]);
    }
  }
  return [...found].map(([to, nets]) => ({ to, nets: [...nets] })).sort((a, b) => order(a.to) - order(b.to));
}

/** The order of references: the order of the parts in the netlist (the table first, then the back, then the front). */
export const order = (ref: string): number => PARTS.findIndex((p) => p.ref === ref);

/** The parts a part is linked to, in order. */
export const linkedTo = (ref: string): string[] => linksOf(ref).map((l) => l.to);

